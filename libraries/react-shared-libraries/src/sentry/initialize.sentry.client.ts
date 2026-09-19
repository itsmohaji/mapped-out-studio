import * as Sentry from '@sentry/nextjs';
import { initializeSentryBasic } from '@gitroom/react/sentry/initialize.sentry.next.basic';

/**
 * Browser Sentry.
 *
 * Until 2026-09-19 this recorded a replay of EVERY session with canvas capture,
 * profiled 75% of sessions and ran with text unmasked. Replay serialises every
 * DOM mutation on the main thread, which on the calendar grid, media library and
 * design editor is the leading suspect for the UI freezing — and it shipped
 * client names, captions and figures to a third party.
 *
 * Now: no whole-session replay; a masked replay of the moments around an error
 * for a small sample of sessions only; no canvas capture; light sampling.
 * `sentry.config.spec.ts` pins these values.
 */
export const initializeSentryClient = (environment: string, dsn: string) => {
  const production = environment !== 'development';
  return initializeSentryBasic(environment, dsn, {
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.browserProfilingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
      Sentry.feedbackIntegration({
        // Disable the injection of the default widget
        autoInject: false,
      }),
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: production ? 0.1 : 1.0,
    profilesSampleRate: production ? 0 : 1.0,
  });
};
