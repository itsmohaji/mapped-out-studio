import { Injectable, Logger } from '@nestjs/common';
import { AiProvidersService } from '@gitroom/nestjs-libraries/database/prisma/ai/ai.providers.service';
import { AiOrchestraRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-orchestra/ai.orchestra.repository';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { AiTask } from '@gitroom/nestjs-libraries/ai/ai.router';
import { providerMeta } from '@gitroom/nestjs-libraries/ai/ai.providers.registry';
import { creditsForTask } from '@gitroom/helpers/utils/ai.assist';
import { costMicros } from '@gitroom/helpers/utils/ai.orchestra';

/**
 * The ONE place an AI call actually happens.
 *
 * Everything upstream — the composer, the assistant drawer, AI Orchestra, an
 * automation node — asks for a TASK. This resolves that task through the router,
 * talks to whichever provider won, and meters the result. Nothing above it names
 * a provider or a model, which is what makes enabling a second provider a
 * settings change rather than a release.
 *
 * Deliberately built on `fetch` rather than a vendor SDK: every provider in the
 * catalogue except Anthropic speaks the OpenAI wire format, so one request
 * shape covers ten providers, and there is no client to rebuild when a key is
 * rotated mid-process.
 */

export interface GenerateParams {
  task: AiTask;
  instruction: string;
  input: string;
  /** Image URLs to show the model. Only sent when the winner can see. */
  images?: string[];
  orgId: string;
  userId?: string | null;
  /** What to record this against in the meter. */
  capabilityKey?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Flat shape on purpose. The backend tsconfig runs without `strictNullChecks`,
 * which breaks discriminated-union narrowing — a `{ok:true}|{ok:false}` result
 * fails to narrow under `if (!res.ok)` and errors at every call site.
 */
export interface GenerateResult {
  ok: boolean;
  text: string;
  /** Only set when ok === false. Safe to log; never shown to a client verbatim. */
  reason?: string;
  provider?: string;
  model?: string;
  credits?: number;
  /** True when media was supplied but the winner could not be shown it. */
  reducedCapability?: boolean;
}

const MAX_ATTEMPTS = 2;

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    private _providers: AiProvidersService,
    private _runs: AiOrchestraRepository,
    private _config: PrismaRepository<'aiProviderConfig'>
  ) {}

  /** Is any provider able to serve this task right now? */
  async available(task: AiTask): Promise<boolean> {
    const r = await this._providers.resolve(task);
    return !!r.ok;
  }

  /**
   * Run a task.
   *
   * When `images` are supplied it asks the router for `vision` FIRST. If no
   * enabled provider can see, it falls back to the requested text task and
   * flags `reducedCapability` — the caller writes a text-only prompt and the
   * user is never told which model looked at what. That is the graceful
   * degradation the media feature depends on, and it lives here so no caller
   * can forget it.
   */
  async generate(params: GenerateParams): Promise<GenerateResult> {
    const started = Date.now();
    const wantsVision = !!params.images?.length;

    let task: AiTask = params.task;
    let reduced = false;

    if (wantsVision) {
      const vision = await this._providers.resolve('vision');
      if (vision.ok) {
        task = 'vision';
      } else {
        reduced = true;
        this.logger.log(
          `ai: media supplied but no vision provider (${vision.reason}); falling back to ${params.task}`
        );
      }
    }

    const resolved = await this._providers.resolve(task);
    if (!resolved.ok) {
      await this.meter({ ...params, task, status: 'refused', reason: resolved.reason, started });
      return { ok: false, text: '', reason: resolved.reason, reducedCapability: reduced };
    }

    // Non-null after the `ok` check above; the flat result type cannot express
    // that, so it is asserted once here rather than at every use.
    const provider = resolved.provider as string;
    const model = resolved.model ?? null;
    const images = reduced ? [] : params.images || [];

    let lastError = 'The AI provider did not respond.';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const out = await this.call({
          provider,
          model,
          apiKey: resolved.apiKey as string,
          endpoint: resolved.endpoint ?? null,
          instruction: params.instruction,
          input: params.input,
          images,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
        });

        const credits = creditsForTask(task, out.promptTokens, out.outputTokens);

        await this.meter({
          ...params,
          task,
          status: 'ok',
          started,
          provider,
          model,
          promptTokens: out.promptTokens,
          outputTokens: out.outputTokens,
          credits,
        });

        return {
          ok: true,
          text: out.text,
          provider,
          model: model || undefined,
          credits,
          reducedCapability: reduced,
        };
      } catch (e: any) {
        lastError = String(e?.message || e || 'error').slice(0, 300);
        // A transport hiccup is worth one retry; a 4xx is the provider telling
        // us the request is wrong and retrying it just spends the same money
        // twice for the same answer.
        if (attempt >= MAX_ATTEMPTS || /^HTTP 4/.test(lastError)) break;
      }
    }

    await this.meter({
      ...params,
      task,
      status: 'error',
      reason: lastError,
      started,
      provider,
      model,
    });
    this.logger.warn(`ai ${task} via ${provider} failed: ${lastError}`);
    return { ok: false, text: '', reason: lastError, reducedCapability: reduced };
  }

  // -------------------------------------------------------------------------

  private async call(p: {
    provider: string;
    model: string | null;
    apiKey: string;
    endpoint: string | null;
    instruction: string;
    input: string;
    images: string[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ text: string; promptTokens: number | null; outputTokens: number | null }> {
    const base = (p.endpoint || providerMeta(p.provider)?.defaultEndpoint || '').replace(
      /\/$/,
      ''
    );
    if (!base) throw new Error('Provider has no endpoint configured.');

    const model = p.model || providerMeta(p.provider)?.defaultModels[0];
    if (!model) throw new Error('Provider has no model configured.');

    return p.provider === 'anthropic'
      ? this.callAnthropic({ ...p, base, model })
      : this.callOpenAiCompatible({ ...p, base, model });
  }

  private async callOpenAiCompatible(p: {
    base: string;
    model: string;
    apiKey: string;
    instruction: string;
    input: string;
    images: string[];
    maxTokens?: number;
    temperature?: number;
  }) {
    const content: any = p.images.length
      ? [
          { type: 'text', text: p.input },
          ...p.images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ]
      : p.input;

    const res = await fetch(`${p.base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: p.model,
        messages: [
          { role: 'system', content: p.instruction },
          { role: 'user', content },
        ],
        ...(p.maxTokens ? { max_tokens: p.maxTokens } : {}),
        ...(p.temperature != null ? { temperature: p.temperature } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    }

    const body: any = await res.json();
    return {
      text: String(body?.choices?.[0]?.message?.content || '').trim(),
      // The provider's OWN numbers. Missing stays missing — never estimated.
      promptTokens: body?.usage?.prompt_tokens ?? null,
      outputTokens: body?.usage?.completion_tokens ?? null,
    };
  }

  private async callAnthropic(p: {
    base: string;
    model: string;
    apiKey: string;
    instruction: string;
    input: string;
    images: string[];
    maxTokens?: number;
    temperature?: number;
  }) {
    const res = await fetch(`${p.base}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': p.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: p.model,
        // Anthropic requires max_tokens; the others treat it as optional.
        max_tokens: p.maxTokens || 2048,
        system: p.instruction,
        messages: [
          {
            role: 'user',
            content: p.images.length
              ? [
                  { type: 'text', text: p.input },
                  ...p.images.map((url) => ({
                    type: 'image',
                    source: { type: 'url', url },
                  })),
                ]
              : p.input,
          },
        ],
        ...(p.temperature != null ? { temperature: p.temperature } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    }

    const body: any = await res.json();
    const text = (body?.content || [])
      .filter((c: any) => c?.type === 'text')
      .map((c: any) => c.text)
      .join('')
      .trim();

    return {
      text,
      promptTokens: body?.usage?.input_tokens ?? null,
      outputTokens: body?.usage?.output_tokens ?? null,
    };
  }

  /**
   * Record the run. Never throws.
   *
   * A metering failure must not lose the answer the user is waiting for — but
   * it is logged, because silently un-metered usage is how a credit system
   * stops meaning anything.
   */
  private async meter(p: {
    orgId: string;
    userId?: string | null;
    capabilityKey?: string;
    task: AiTask;
    status: 'ok' | 'error' | 'refused';
    reason?: string;
    started: number;
    provider?: string;
    model?: string | null;
    promptTokens?: number | null;
    outputTokens?: number | null;
    credits?: number;
  }) {
    try {
      await this._runs.logRun({
        orgId: p.orgId,
        userId: p.userId || null,
        capabilityKey: p.capabilityKey || `assist:${p.task}`,
        provider: p.provider || null,
        model: p.model || null,
        status: p.status,
        refusedReason: p.reason ? p.reason.slice(0, 300) : null,
        promptTokens: p.promptTokens ?? null,
        outputTokens: p.outputTokens ?? null,
        costMicros: costMicros(p.model || '', p.promptTokens, p.outputTokens),
        durationMs: Date.now() - p.started,
        // Additive columns. Old rows have neither and fall back to the
        // token-derived credit, so the meter stays correct across the upgrade.
        task: p.task,
        credits: p.status === 'ok' ? p.credits ?? null : null,
      } as any);
    } catch (e: any) {
      this.logger.warn(`ai meter failed: ${e?.message}`);
    }

    // Running provider totals. Best-effort and separate from the run log: this
    // is the operator's cost signal, not the client's credit balance.
    if (p.status === 'ok' && p.provider) {
      try {
        await this._config.model.aiProviderConfig.update({
          where: { provider: p.provider },
          data: {
            usedRequests: { increment: 1 },
            usedTokens: {
              increment: (p.promptTokens || 0) + (p.outputTokens || 0),
            },
          },
        });
      } catch {
        // A provider row that vanished mid-call is not worth failing over.
      }
    }
  }
}
