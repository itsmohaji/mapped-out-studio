/**
 * Error reporting that does not ship the Sentry SDK to browsers that never use it.
 *
 * Importing `@sentry/nextjs` anywhere in client code put the whole browser SDK
 * (replay included, ~570 KB) into every page — while production has no DSN, so
 * all of it was dead weight (performance baseline, 2026-09-19). Call sites
 * report through here instead; the SDK is fetched only after SentryComponent
 * has actually initialised Sentry, and everything before that is a no-op, which
 * is exactly what `Sentry.captureException` was without a DSN.
 */
type Sdk = typeof import('@sentry/nextjs');
type Context = Record<string, any>;

let enabled = false;
const sdk = (): Promise<Sdk> => import('@sentry/nextjs');

/** Called once Sentry.init has run. */
export function enableSentryReporting() {
  enabled = true;
}

export function isSentryReportingEnabled() {
  return enabled;
}

export function reportError(error: unknown, context?: Context) {
  if (!enabled) return;
  sdk()
    .then((S) => S.captureException(error, context))
    .catch(() => undefined);
}

/** `context` may be a function of the SDK, for values only the SDK can give. */
export function reportMessage(
  message: string,
  context?: Context | ((S: Sdk) => Context)
) {
  if (!enabled) return;
  sdk()
    .then((S) =>
      S.captureMessage(
        message,
        typeof context === 'function' ? context(S) : context
      )
    )
    .catch(() => undefined);
}
