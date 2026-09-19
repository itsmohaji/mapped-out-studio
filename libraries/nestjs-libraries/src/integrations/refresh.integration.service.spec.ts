/**
 * Incident 2026-09-19 — Instagram refresh notification storm (~30 emails).
 * Real RefreshIntegrationService + real IntegrationService.markNeedsAttention,
 * with an in-memory Redis (NX / PX / EX), one fake channel row, a fake Meta
 * provider and an email counter. Invariant under test everywhere:
 * N failures never produce N emails.
 */
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => {
  const data = new Map<string, { v: string; exp: number }>();
  const live = (k: string) => {
    const e = data.get(k);
    if (e && e.exp && e.exp <= Date.now()) data.delete(k);
    return data.get(k);
  };
  return {
    ioRedis: {
      __data: data,
      async get(k: string) { return live(k)?.v ?? null; },
      async set(k: string, v: string, ...args: any[]) {
        let exp = 0;
        for (let i = 0; i < args.length; i++) {
          if (args[i] === 'PX') exp = Date.now() + Number(args[i + 1]);
          if (args[i] === 'EX') exp = Date.now() + Number(args[i + 1]) * 1000;
        }
        if (args.includes('NX') && live(k)) return null;
        data.set(k, { v: String(v), exp });
        return 'OK';
      },
      async del(...keys: string[]) { keys.forEach((k) => data.delete(k)); return keys.length; },
      async eval(_script: string, _n: number, k: string, owner: string) {
        if (live(k)?.v === owner) { data.delete(k); return 1; }
        return 0;
      },
    },
  };
});

// DI-only imports of the services under test; the real ones load every provider.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({ IntegrationManager: class {} }));
jest.mock('bcrypt', () => ({}));

import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  backoffMs,
  classifyRefreshError,
  MAX_FAILURES,
  ProviderRefreshError,
} from '@gitroom/nestjs-libraries/integrations/refresh.policy';

const HOUR = 3600_000;
const expired = () => new ProviderRefreshError(400, { error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190, error_subcode: 463 } });
const revoked = () => new ProviderRefreshError(400, { error: { message: 'The user has not authorized application', type: 'OAuthException', code: 190, error_subcode: 458 } });
const outage = () => new ProviderRefreshError(503, { error: { message: 'Service temporarily unavailable', code: 2, is_transient: true } });
const rateLimited = () => new ProviderRefreshError(400, { error: { message: 'Application request limit reached', type: 'OAuthException', code: 4 } });
const ok = (n = 1) => ({ id: 'ig', name: 'Mapped Out', picture: '', username: 'mappedout', accessToken: `new-${n}`, refreshToken: `new-${n}`, expiresIn: 58 * 24 * 3600 });

const setup = () => {
  (ioRedis as any).__data.clear();
  const row: any = {
    id: 'ch1', organizationId: 'org1', name: 'Mapped Out', providerIdentifier: 'instagram-standalone',
    internalId: 'ig', rootInternalId: 'ig', token: 'old', refreshToken: 'old', picture: '',
    refreshNeeded: false, tokenExpiration: new Date(Date.now() - HOUR),
  };
  const emails: string[] = [];
  const provider = { refreshToken: jest.fn(), oneTimeToken: false };

  const integrationService = Object.create(IntegrationService.prototype) as IntegrationService;
  Object.assign(integrationService, {
    _integrationRepository: {
      async flagRefreshNeededOnce() {
        if (row.refreshNeeded) return 0;
        row.refreshNeeded = true;
        return 1;
      },
    },
    _notificationService: {
      async inAppNotification(_o: string, subject: string, _m: string, sendEmail: boolean) {
        if (sendEmail) emails.push(subject);
      },
    },
    async createOrUpdateIntegration(...a: any[]) {
      Object.assign(row, { token: a[8], refreshToken: a[9], refreshNeeded: false, tokenExpiration: new Date(Date.now() + a[10] * 1000) });
    },
    async getIntegrationById() { return { ...row }; },
  });

  const service = new RefreshIntegrationService(
    { getSocialIntegration: () => provider } as any,
    integrationService,
    {} as any
  );
  /** What every caller does: read the row, then refresh. */
  const attempt = () => settle(service.refresh({ ...row }));
  return { row, emails, provider, service, attempt, integrationService };
};

/** Run a promise to completion while fake timers drive its sleeps. */
const settle = async <T,>(p: Promise<T>): Promise<T> => {
  let done = false;
  let value: any;
  let error: any;
  p.then((v) => ((done = true), (value = v)), (e) => ((done = true), (error = e)));
  while (!done) await jest.advanceTimersByTimeAsync(250);
  if (error) throw error;
  return value;
};
const later = (ms: number) => jest.setSystemTime(Date.now() + ms);

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('token refresh — one failure', () => {
  it('temporary failure: retried once internally, then backs off quietly — no email, not flagged', async () => {
    const t = setup();
    t.provider.refreshToken.mockRejectedValue(outage());
    expect(await t.attempt()).toBe(false);
    expect(t.provider.refreshToken).toHaveBeenCalledTimes(2); // first try + one internal retry
    expect(t.emails).toHaveLength(0);
    expect(t.row.refreshNeeded).toBe(false);
  });
});

describe('token refresh — 10 repeated failures', () => {
  it('10 page views in a burst: one provider attempt, zero emails', async () => {
    const t = setup();
    t.provider.refreshToken.mockRejectedValue(outage());
    for (let i = 0; i < 10; i++) await t.attempt();
    expect(t.provider.refreshToken).toHaveBeenCalledTimes(2); // only the first view reached Meta
    expect(t.emails).toHaveLength(0);
  });

  it('10 failures spread over time: flagged after MAX_FAILURES, exactly ONE email, then silence', async () => {
    const t = setup();
    t.provider.refreshToken.mockRejectedValue(outage());
    for (let i = 1; i <= 10; i++) {
      await t.attempt();
      later(backoffMs(i, 'transient') + 1000);
    }
    expect(t.row.refreshNeeded).toBe(true);
    expect(t.emails).toEqual(['Instagram connection requires attention']);
    // attempts 1..MAX reached Meta (2 calls each); after that only the daily probe
    expect(t.provider.refreshToken.mock.calls.length).toBeLessThanOrEqual(MAX_FAILURES * 2 + 2 * 2);
  });

  it('backoff grows exponentially and is capped', () => {
    expect([1, 2, 3, 4, 5].map((n) => backoffMs(n, 'transient') / 60_000)).toEqual([5, 10, 20, 40, 80]);
    expect(backoffMs(20, 'transient')).toBe(6 * HOUR);
  });
});

describe('token refresh — concurrent workers', () => {
  it('5 concurrent refreshes of one channel: Meta is called once, every caller gets the new token', async () => {
    const t = setup();
    t.provider.refreshToken.mockImplementation(() => new Promise((r) => setTimeout(() => r(ok()), 1500)));
    const results = await settle(Promise.all([1, 2, 3, 4, 5].map(() => t.service.refresh({ ...t.row }))));
    expect(t.provider.refreshToken).toHaveBeenCalledTimes(1);
    expect(results.every((r: any) => r && r.accessToken === 'new-1')).toBe(true);
    expect(t.emails).toHaveLength(0);
  });

  it('5 concurrent refreshes of an expired token: one Meta call, ONE email', async () => {
    const t = setup();
    t.provider.refreshToken.mockImplementation(() => new Promise((_r, j) => setTimeout(() => j(expired()), 1500)));
    await settle(Promise.all([1, 2, 3, 4, 5].map(() => t.service.refresh({ ...t.row }))));
    expect(t.provider.refreshToken).toHaveBeenCalledTimes(1);
    expect(t.emails).toHaveLength(1);
  });

  it('10 concurrent "disconnect" calls (posting, analytics, AI tools): ONE email', async () => {
    const t = setup();
    await Promise.all([...Array(10)].map(() => t.integrationService.disconnectChannel('org1', { ...t.row })));
    expect(t.emails).toHaveLength(1);
    expect(t.row.refreshNeeded).toBe(true);
  });
});

describe('token refresh — expired and revoked tokens need a human', () => {
  it.each([
    ['expired', expired],
    ['revoked', revoked],
  ])('%s: flagged at once, one email, no internal retry, no further Meta calls on page views', async (_n, err) => {
    const t = setup();
    t.provider.refreshToken.mockRejectedValue(err());
    await t.attempt();
    expect(t.provider.refreshToken).toHaveBeenCalledTimes(1);
    expect(t.row.refreshNeeded).toBe(true);
    expect(t.emails).toEqual(['Instagram connection requires attention']);

    for (let i = 0; i < 10; i++) { await t.attempt(); later(60_000); }
    expect(t.provider.refreshToken).toHaveBeenCalledTimes(1);
    expect(t.emails).toHaveLength(1);

    later(24 * HOUR); // the daily silent probe
    await t.attempt();
    expect(t.provider.refreshToken).toHaveBeenCalledTimes(2);
    expect(t.emails).toHaveLength(1);
  });

  it('the channel is only flagged — its row and tokens are kept, nothing is deleted', async () => {
    const t = setup();
    t.provider.refreshToken.mockRejectedValue(expired());
    await t.attempt();
    expect(t.row.token).toBe('old');
    expect(t.row.refreshToken).toBe('old');
  });
});

describe('token refresh — rate limit', () => {
  it('no internal retry, waits at least an hour, no email', async () => {
    const t = setup();
    t.provider.refreshToken.mockRejectedValue(rateLimited());
    await t.attempt();
    expect(t.provider.refreshToken).toHaveBeenCalledTimes(1);
    later(30 * 60_000);
    await t.attempt();
    expect(t.provider.refreshToken).toHaveBeenCalledTimes(1);
    later(31 * 60_000);
    await t.attempt();
    expect(t.provider.refreshToken).toHaveBeenCalledTimes(2);
    expect(t.emails).toHaveLength(0);
  });
});

describe('token refresh — recovery', () => {
  it('temporary Meta outage, then success: token saved, backoff cleared, no email', async () => {
    const t = setup();
    t.provider.refreshToken.mockRejectedValueOnce(outage()).mockRejectedValueOnce(outage()).mockResolvedValue(ok(2));
    expect(await t.attempt()).toBe(false);
    later(backoffMs(1, 'transient') + 1000);
    const r: any = await t.attempt();
    expect(r.accessToken).toBe('new-2');
    expect(t.row.token).toBe('new-2');
    expect(await ioRedis.get('integration:refresh:state:ch1')).toBeNull();
    expect(t.emails).toHaveLength(0);
  });

  it('a flagged channel whose daily probe succeeds is un-flagged, still one email in total', async () => {
    const t = setup();
    t.provider.refreshToken.mockRejectedValueOnce(expired()).mockResolvedValue(ok(3));
    await t.attempt();
    later(24 * HOUR + 1000);
    await t.attempt();
    expect(t.row.refreshNeeded).toBe(false);
    expect(t.row.token).toBe('new-3');
    expect(t.emails).toHaveLength(1);
  });
});

describe('Meta error classification', () => {
  it.each([
    [expired(), 'auth'],
    [revoked(), 'auth'],
    [new ProviderRefreshError(400, { error: { type: 'OAuthException', code: 200, message: 'Permissions error' } }), 'auth'],
    [rateLimited(), 'rate_limit'],
    [new ProviderRefreshError(429, {}), 'rate_limit'],
    [new ProviderRefreshError(400, { error: { code: 80002 } }), 'rate_limit'],
    [outage(), 'transient'],
    [new ProviderRefreshError(500, {}), 'transient'],
    [new TypeError('fetch failed'), 'transient'],
  ])('%s -> %s', (err, kind) => {
    expect(classifyRefreshError(err).kind).toBe(kind);
  });

  it('keeps Meta\'s own message for the log', () => {
    expect(classifyRefreshError(expired()).detail).toContain('code 190 · subcode 463 · Error validating access token');
  });
});
