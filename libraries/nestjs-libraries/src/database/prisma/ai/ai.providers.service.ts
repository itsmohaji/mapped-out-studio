import { Injectable, Logger } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  decrypt_legacy_using_IV,
  encrypt_legacy_using_IV,
} from '@gitroom/helpers/auth/auth.service';
import {
  AI_PROVIDERS,
  maskKey,
  providerMeta,
} from '@gitroom/nestjs-libraries/ai/ai.providers.registry';
import {
  AiTask,
  ConfiguredProvider,
  routeTask,
  routingTable,
} from '@gitroom/nestjs-libraries/ai/ai.router';

const json = (v: any, f: any) => {
  try {
    return (typeof v === 'string' ? JSON.parse(v) : v) ?? f;
  } catch {
    return f;
  }
};

/**
 * AI provider administration.
 *
 * Platform-owner surface. Every method here assumes the caller has already been
 * checked as a super admin by the controller — the service never returns a
 * plaintext key regardless, so a mistake there leaks masked values at worst.
 */
@Injectable()
export class AiProvidersService {
  private readonly logger = new Logger(AiProvidersService.name);

  constructor(
    private _config: PrismaRepository<'aiProviderConfig'>,
    private _audit: PrismaRepository<'aiProviderAudit'>
  ) {}

  private decrypt(value?: string | null): string {
    if (!value) return '';
    try {
      return decrypt_legacy_using_IV(value) || '';
    } catch {
      // A key encrypted under a rotated secret must not crash the settings
      // page — it reads as "not configured", which is the honest state.
      return '';
    }
  }

  /**
   * Every provider in the catalogue, merged with whatever is configured.
   *
   * Returns the full catalogue rather than only configured rows so the settings
   * page can show what is available without duplicating the registry in the UI.
   * The key is masked here and nowhere else has to remember to do it.
   */
  async list() {
    const rows = await this._config.model.aiProviderConfig.findMany();
    const byKey = new Map(rows.map((r: any) => [r.provider, r]));

    return AI_PROVIDERS.map((meta) => {
      const row: any = byKey.get(meta.key);
      const plain = this.decrypt(row?.apiKey);

      return {
        ...meta,
        configured: !!row,
        enabled: !!row?.enabled,
        priority: row?.priority ?? 10,
        hasKey: !!plain,
        maskedKey: maskKey(plain),
        endpoint: row?.endpoint ?? meta.defaultEndpoint,
        orgId: row?.orgId ?? null,
        models: json(row?.models, []) as string[],
        health: row?.health ?? 'unknown',
        healthMessage: row?.healthMessage ?? null,
        healthAt: row?.healthAt ?? null,
        rpmLimit: row?.rpmLimit ?? null,
        dailyTokens: row?.dailyTokens ?? null,
        usage: {
          tokens: row?.usedTokens ?? 0,
          requests: row?.usedRequests ?? 0,
          costUsd: row?.usedCostUsd ?? 0,
        },
      };
    });
  }

  /** Shape the router needs — no secrets, just whether a key exists. */
  private async configured(): Promise<ConfiguredProvider[]> {
    const rows = await this._config.model.aiProviderConfig.findMany();
    return rows.map((r: any) => ({
      key: r.provider,
      enabled: !!r.enabled,
      priority: r.priority ?? 10,
      hasKey: !!this.decrypt(r.apiKey),
      health: (r.health ?? 'unknown') as ConfiguredProvider['health'],
      models: json(r.models, []),
    }));
  }

  /** What each task will actually use, for the settings screen. */
  async routing() {
    return routingTable(await this.configured());
  }

  /**
   * Resolve a task to a provider AND its live credentials.
   *
   * The only path that ever decrypts a key for use. Callers get a client
   * config, never the raw record, so a key cannot accidentally end up in a
   * response body or a log line.
   */
  async resolve(
    task: AiTask,
    override?: { provider?: string; model?: string }
  ): Promise<
    | { ok: true; provider: string; model: string | null; apiKey: string; endpoint: string | null }
    | { ok: false; reason: string }
  > {
    const decision = routeTask(task, await this.configured(), override);
    if (!decision.provider) return { ok: false, reason: decision.reason };

    const row: any = await this._config.model.aiProviderConfig.findUnique({
      where: { provider: decision.provider },
    });
    const apiKey = this.decrypt(row?.apiKey);
    if (!apiKey) {
      return { ok: false, reason: `Provider "${decision.provider}" has no usable key.` };
    }

    return {
      ok: true,
      provider: decision.provider,
      model: 'model' in decision ? decision.model : null,
      apiKey,
      endpoint: row?.endpoint ?? providerMeta(decision.provider)?.defaultEndpoint ?? null,
    };
  }

  /**
   * Create or update a provider.
   *
   * A BLANK apiKey means "leave the stored key alone", not "clear it" — a form
   * that round-trips a masked value must never wipe the real one. Clearing is
   * an explicit `clearKey`.
   */
  async upsert(
    provider: string,
    patch: {
      enabled?: boolean;
      priority?: number;
      apiKey?: string;
      clearKey?: boolean;
      endpoint?: string | null;
      orgId?: string | null;
      models?: string[];
      rpmLimit?: number | null;
      dailyTokens?: number | null;
    },
    actor: { id?: string; name?: string }
  ) {
    if (!providerMeta(provider)) return null;

    const data: any = {};
    if (patch.enabled !== undefined) data.enabled = patch.enabled;
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.endpoint !== undefined) data.endpoint = patch.endpoint || null;
    if (patch.orgId !== undefined) data.orgId = patch.orgId || null;
    if (patch.models !== undefined) data.models = JSON.stringify(patch.models ?? []);
    if (patch.rpmLimit !== undefined) data.rpmLimit = patch.rpmLimit ?? null;
    if (patch.dailyTokens !== undefined) data.dailyTokens = patch.dailyTokens ?? null;

    let keyChanged = false;
    if (patch.clearKey) {
      data.apiKey = null;
      data.health = 'unknown';
      data.healthMessage = null;
      keyChanged = true;
    } else if (patch.apiKey && patch.apiKey.trim()) {
      data.apiKey = encrypt_legacy_using_IV(patch.apiKey.trim());
      // A new key invalidates the old verdict — rotation happens live, and the
      // provider stays routable until the next test says otherwise.
      data.health = 'unknown';
      data.healthMessage = null;
      keyChanged = true;
    }

    const saved = await this._config.model.aiProviderConfig.upsert({
      where: { provider },
      update: data,
      create: { provider, ...data },
    });

    await this.log(
      provider,
      keyChanged ? (patch.clearKey ? 'key_cleared' : 'key_set') : 'settings_updated',
      actor,
      Object.keys(data)
        .filter((k) => k !== 'apiKey')
        .join(', ') || null
    );

    return saved;
  }

  /**
   * Test a provider against its real API.
   *
   * Uses the stored key unless one is supplied, so an operator can validate a
   * key BEFORE saving it and never store something broken.
   */
  async test(
    provider: string,
    candidateKey: string | undefined,
    actor: { id?: string; name?: string }
  ): Promise<{ ok: boolean; message: string }> {
    const meta = providerMeta(provider);
    if (!meta) return { ok: false, message: 'Unknown provider.' };

    const row: any = await this._config.model.aiProviderConfig.findUnique({
      where: { provider },
    });
    const key = (candidateKey || '').trim() || this.decrypt(row?.apiKey);
    if (!key) return { ok: false, message: 'No API key to test.' };

    const endpoint = row?.endpoint || meta.defaultEndpoint;
    if (!endpoint) {
      return { ok: false, message: 'This provider needs an endpoint before it can be tested.' };
    }

    let result: { ok: boolean; message: string };
    try {
      if (meta.key === 'anthropic') {
        // Anthropic does not speak the OpenAI wire format; a models list needs
        // its own header set.
        const res = await fetch(`${endpoint.replace(/\/$/, '')}/models`, {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        });
        result = res.ok
          ? { ok: true, message: 'Connected.' }
          : { ok: false, message: `HTTP ${res.status} — ${(await res.text()).slice(0, 160)}` };
      } else if (meta.openAiCompatible) {
        const res = await fetch(`${endpoint.replace(/\/$/, '')}/models`, {
          headers: {
            Authorization: `Bearer ${key}`,
            ...(row?.orgId ? { 'OpenAI-Organization': row.orgId } : {}),
          },
        });
        result = res.ok
          ? { ok: true, message: 'Connected.' }
          : { ok: false, message: `HTTP ${res.status} — ${(await res.text()).slice(0, 160)}` };
      } else {
        result = {
          ok: false,
          message: `${meta.label} has no connection test yet; the key is stored but unverified.`,
        };
      }
    } catch (e: any) {
      result = { ok: false, message: e?.message || 'Could not reach the provider.' };
    }

    // Only record health for the STORED key. Testing a candidate that has not
    // been saved must not mark the live provider broken.
    if (!candidateKey) {
      await this._config.model.aiProviderConfig
        .upsert({
          where: { provider },
          update: {
            health: result.ok ? 'ok' : 'error',
            healthMessage: result.message,
            healthAt: new Date(),
          },
          create: {
            provider,
            health: result.ok ? 'ok' : 'error',
            healthMessage: result.message,
            healthAt: new Date(),
          },
        })
        .catch(() => undefined);
    }

    await this.log(provider, result.ok ? 'test_passed' : 'test_failed', actor, result.message);
    return result;
  }

  auditLog(take = 100) {
    return this._audit.model.aiProviderAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /** Never throws — an audit failure must not block the action being audited. */
  private async log(
    provider: string,
    action: string,
    actor: { id?: string; name?: string },
    detail?: string | null
  ) {
    try {
      await this._audit.model.aiProviderAudit.create({
        data: {
          provider,
          action,
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
          detail: detail ?? null,
        },
      });
    } catch (e: any) {
      this.logger.warn(`ai provider audit failed: ${e?.message}`);
    }
  }
}
