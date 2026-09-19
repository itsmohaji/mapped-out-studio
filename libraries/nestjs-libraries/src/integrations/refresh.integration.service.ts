import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Integration } from '@prisma/client';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  AuthTokenDetails,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { TemporalService } from 'nestjs-temporal-core';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import {
  ATTENTION_PROBE_MS,
  backoffMs,
  classifyRefreshError,
  MAX_FAILURES,
  RefreshFailureKind,
} from '@gitroom/nestjs-libraries/integrations/refresh.policy';

const LOCK_MS = 60_000;
const WAIT_FOR_OTHER_MS = 30_000;
const STATE_TTL_S = 7 * 24 * 3600;
const lockKey = (id: string) => `integration:refresh:lock:${id}`;
const stateKey = (id: string) => `integration:refresh:state:${id}`;
const probeKey = (id: string) => `integration:refresh:probe:${id}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type RefreshState = { failures: number; nextAt: number };

@Injectable()
export class RefreshIntegrationService {
  constructor(
    private _integrationManager: IntegrationManager,
    @Inject(forwardRef(() => IntegrationService))
    private _integrationService: IntegrationService,
    private _temporalService: TemporalService
  ) {}
  /**
   * Every token refresh in the system goes through here (API, Temporal
   * activities, analytics, posting, AI tools). Guarantees, per channel:
   *  - one refresh at a time across all processes (Redis lock);
   *  - after a temporary failure, no new attempt before the backoff expires;
   *  - a channel that needs a human is not retried on every page view — one
   *    silent probe a day at most, until it is reconnected;
   *  - one notification when it starts needing a human, never one per attempt.
   * Returns false when no fresh token is available; never throws for a
   * provider's refusal (reConnect errors still propagate, as before).
   */
  async refresh(integration: Integration, cause = ''): Promise<false | AuthTokenDetails> {
    const id = integration.id;
    const now = Date.now();
    const owner = `${process.pid}:${now}:${Math.random()}`;
    let locked: unknown;
    try {
      if (integration.refreshNeeded) {
        const probe = await ioRedis.set(probeKey(id), '1', 'PX', ATTENTION_PROBE_MS, 'NX');
        if (!probe) return false;
      } else {
        const state = await this.readState(id);
        if (state && state.nextAt > now) return false; // backing off
      }
      locked = await ioRedis.set(lockKey(id), owner, 'PX', LOCK_MS, 'NX');
    } catch (err) {
      // Without the lock and the backoff state we cannot refresh safely. Fail
      // closed and quietly: callers treat false as "no fresh token".
      console.error(`[token-refresh] integration=${id} redis unavailable, skipped: ${(err as Error)?.message}`);
      return false;
    }
    if (!locked) {
      return this.waitForOtherRefresh(integration);
    }

    try {
      return await this.refreshLocked(integration, cause);
    } finally {
      await ioRedis
        .eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          lockKey(id),
          owner
        )
        .catch(() => undefined); // expires by itself after LOCK_MS
    }
  }

  private async refreshLocked(
    integration: Integration,
    cause: string
  ): Promise<false | AuthTokenDetails> {
    const socialProvider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const refresh = await this.refreshProcess(integration, socialProvider, cause);

    if (!refresh) {
      return false as const;
    }

    await this._integrationService.createOrUpdateIntegration(
      undefined,
      !!socialProvider.oneTimeToken,
      integration.organizationId,
      integration.name,
      integration.picture!,
      'social',
      integration.internalId,
      integration.providerIdentifier,
      refresh.accessToken,
      refresh.refreshToken,
      refresh.expiresIn
    );
    await ioRedis.del(stateKey(integration.id), probeKey(integration.id));

    return refresh;
  }

  /** Another process holds the lock: use its result instead of refreshing twice. */
  private async waitForOtherRefresh(integration: Integration): Promise<false | AuthTokenDetails> {
    const until = Date.now() + WAIT_FOR_OTHER_MS;
    while (Date.now() < until && (await ioRedis.get(lockKey(integration.id)))) {
      await sleep(500);
    }
    const fresh = await this._integrationService.getIntegrationById(
      integration.organizationId,
      integration.id
    );
    if (
      !fresh ||
      fresh.refreshNeeded ||
      fresh.token === integration.token ||
      !fresh.tokenExpiration ||
      fresh.tokenExpiration.getTime() <= Date.now()
    ) {
      return false;
    }
    return {
      id: fresh.internalId,
      name: fresh.name,
      picture: fresh.picture || '',
      username: '',
      accessToken: fresh.token,
      refreshToken: fresh.refreshToken || '',
      expiresIn: Math.round((fresh.tokenExpiration.getTime() - Date.now()) / 1000),
    };
  }

  private async readState(id: string): Promise<RefreshState | null> {
    try {
      const raw = await ioRedis.get(stateKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Provider refused or failed: back off, or hand over to a human — never both loudly. */
  private async recordFailure(
    integration: Integration,
    kind: RefreshFailureKind,
    detail: string,
    cause: string
  ) {
    const failures = ((await this.readState(integration.id))?.failures || 0) + 1;
    const needsHuman = kind === 'auth' || failures >= MAX_FAILURES;
    console.warn(
      `[token-refresh] integration=${integration.id} provider=${integration.providerIdentifier} ` +
        `kind=${kind} failures=${failures} ${needsHuman ? 'NEEDS_ATTENTION' : 'backing-off'} :: ${detail}`
    );

    if (needsHuman) {
      await ioRedis.del(stateKey(integration.id));
      // The silent daily probe's cooldown starts now, not at the next page view.
      await ioRedis.set(probeKey(integration.id), '1', 'PX', ATTENTION_PROBE_MS);
      if (integration.refreshNeeded) return; // already flagged and notified
      await this._integrationService.markNeedsAttention(
        integration.organizationId,
        integration,
        cause
      );
      return;
    }

    const state: RefreshState = { failures, nextAt: Date.now() + backoffMs(failures, kind) };
    await ioRedis.set(stateKey(integration.id), JSON.stringify(state), 'EX', STATE_TTL_S);
  }

  public async setBetweenSteps(integration: Integration, cause = '') {
    await this._integrationService.setBetweenRefreshSteps(integration.id);
    await this._integrationService.informAboutRefreshError(
      integration.organizationId,
      integration,
      cause
    );
  }

  public async startRefreshWorkflow(orgId: string, id: string, integration: SocialProvider) {
    if (!integration.refreshCron) {
      return false;
    }

    return this._temporalService.client
      .getRawClient()
      ?.workflow.start(`refreshTokenWorkflow`, {
        workflowId: `refresh_${id}`,
        args: [{integrationId: id, organizationId: orgId}],
        taskQueue: 'main',
        workflowIdConflictPolicy: 'TERMINATE_EXISTING',
      });
  }

  private async refreshProcess(
    integration: Integration,
    socialProvider: SocialProvider,
    cause = ''
  ): Promise<AuthTokenDetails | false> {
    let refresh: AuthTokenDetails | false = false;
    let failure: { kind: RefreshFailureKind; detail: string } | null = null;
    // One immediate in-process retry for a transient failure; anything beyond
    // that waits for the backoff.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        refresh = await socialProvider.refreshToken(integration.refreshToken!);
        failure = refresh && refresh.accessToken
          ? null
          : { kind: 'transient', detail: 'provider returned no access token' };
      } catch (err) {
        failure = classifyRefreshError(err);
      }
      if (!failure || failure.kind !== 'transient' || attempt === 1) break;
      await sleep(2000);
    }

    if (failure || !refresh) {
      await this.recordFailure(
        integration,
        failure?.kind || 'transient',
        failure?.detail || 'no token',
        cause
      );
      return false;
    }

    if (
      !socialProvider.reConnect ||
      integration.rootInternalId === integration.internalId
    ) {
      return refresh;
    }

    const reConnect = await socialProvider.reConnect(
      integration.rootInternalId,
      integration.internalId,
      refresh.accessToken
    );

    return {
      ...refresh,
      ...reConnect,
    };
  }
}
