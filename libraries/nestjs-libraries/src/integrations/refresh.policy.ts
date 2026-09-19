/**
 * Token-refresh failure policy.
 *
 * Incident 2026-09-19: an expired Instagram token was "refreshed" again on every
 * Dashboard/Analytics view, by several requests at once, and every failure sent
 * two emails — ~30 emails in minutes, with Meta's actual error discarded.
 *
 *  - auth       the token is expired/revoked/invalid: retrying cannot help, a
 *               human has to reconnect. Needs attention immediately.
 *  - rate_limit Meta (or the provider) is throttling us: back off, at least 1 h.
 *  - transient  outage, 5xx, network, or an answer we do not understand: back off
 *               exponentially; after MAX_FAILURES in a row, needs attention.
 */
export type RefreshFailureKind = 'auth' | 'rate_limit' | 'transient';

/** Thrown by a provider's refreshToken() with the provider's own answer. */
export class ProviderRefreshError extends Error {
  constructor(public status: number, public body: any) {
    super(
      `refresh failed (HTTP ${status}): ${
        body?.error?.message || body?.error_message || body?.message || 'no access token returned'
      }`
    );
  }
}

export const MAX_FAILURES = 5;
const MIN = 60_000;
export const BACKOFF_BASE_MS = 5 * MIN;
export const BACKOFF_MAX_MS = 6 * 60 * MIN;
export const RATE_LIMIT_MIN_MS = 60 * MIN;
/** A channel that needs a human is probed silently at most once per this. */
export const ATTENTION_PROBE_MS = 24 * 60 * MIN;

/** 5 min, 10, 20, 40, 80 … capped at 6 h. Rate limits wait at least 1 h. */
export const backoffMs = (failures: number, kind: RefreshFailureKind) => {
  const exp = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1), BACKOFF_MAX_MS);
  return kind === 'rate_limit' ? Math.max(exp, RATE_LIMIT_MIN_MS) : exp;
};

// Graph API error codes: https://developers.facebook.com/docs/graph-api/guides/error-handling
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const AUTH_CODES = new Set([102, 190, 10]);

export const classifyRefreshError = (
  err: unknown
): { kind: RefreshFailureKind; detail: string } => {
  if (err instanceof ProviderRefreshError) {
    const e = err.body?.error || err.body || {};
    const code = Number(e.code);
    const detail = [
      `HTTP ${err.status}`,
      e.type || e.error_type,
      Number.isFinite(code) ? `code ${code}` : '',
      e.error_subcode ? `subcode ${e.error_subcode}` : '',
      e.message || e.error_message || '',
    ].filter(Boolean).join(' · ');

    if (err.status === 429 || RATE_LIMIT_CODES.has(code) || (code >= 80000 && code <= 80014)) {
      return { kind: 'rate_limit', detail };
    }
    if (err.status >= 500 || e.is_transient === true || code === 1 || code === 2) {
      return { kind: 'transient', detail };
    }
    if (
      AUTH_CODES.has(code) ||
      (code >= 200 && code <= 299) ||
      err.status === 401 ||
      (err.status === 400 && /oauth/i.test(e.type || e.error_type || ''))
    ) {
      return { kind: 'auth', detail };
    }
    return { kind: 'transient', detail };
  }
  // fetch() network failures, timeouts, anything unexpected: not proof the
  // token is bad, so never treated as needing a human on the first sight.
  return { kind: 'transient', detail: (err as Error)?.message || String(err) };
};

/** "instagram-standalone" -> "Instagram" (for the one human-facing email). */
export const providerLabel = (identifier: string) => {
  const base = (identifier || 'channel').split('-')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
};
