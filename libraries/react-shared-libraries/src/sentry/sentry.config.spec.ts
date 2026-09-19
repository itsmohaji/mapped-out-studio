/**
 * @jest-environment ./jest.jsdom.env.cjs
 */
/**
 * The browser Sentry configuration is part of the product, not a dev setting.
 *
 * Until 2026-09-19 it recorded a session replay of EVERY session (canvas
 * included), profiled 75% of them and traced all of them. Replay serialises
 * every DOM change on the main thread — on the calendar grid, the media library
 * and the Polotno canvas — which is the leading suspect for the UI freezing.
 * It also recorded all visible text unmasked, so client names, captions and
 * figures went to a third party, and it popped a Sentry "Something broke!"
 * dialog at clients on every reported error.
 *
 * These tests pin the settings that matter so a later edit cannot quietly
 * reintroduce any of that.
 */
const init = jest.fn();
const showReportDialog = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  init: (opts: any) => init(opts),
  browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
  browserProfilingIntegration: () => ({ name: 'BrowserProfiling' }),
  replayIntegration: (opts: any) => ({ name: 'Replay', opts }),
  replayCanvasIntegration: () => ({ name: 'ReplayCanvas' }),
  feedbackIntegration: (opts: any) => ({ name: 'Feedback', opts }),
  consoleLoggingIntegration: (opts: any) => ({ name: 'ConsoleLogging', opts }),
  showReportDialog: (...a: any[]) => showReportDialog(...a),
}));
jest.mock('@sentry/react', () => ({
  showReportDialog: (...a: any[]) => showReportDialog(...a),
}));

import { initializeSentryClient } from '@gitroom/react/sentry/initialize.sentry.client';
import { initializeSentryServer } from '@gitroom/react/sentry/initialize.sentry.server';

const DSN = 'https://public@example.invalid/1';

function optionsFor(env: string) {
  init.mockReset();
  initializeSentryClient(env, DSN);
  expect(init).toHaveBeenCalledTimes(1);
  return init.mock.calls[0][0];
}

const names = (opts: any) => (opts.integrations || []).map((i: any) => i.name);

afterEach(() => showReportDialog.mockReset());

describe('browser Sentry in production', () => {
  const opts = optionsFor('production');

  it('never records whole sessions — replay only around an error, and rarely', () => {
    expect(opts.replaysSessionSampleRate).toBe(0);
    expect(opts.replaysOnErrorSampleRate).toBeGreaterThan(0);
    expect(opts.replaysOnErrorSampleRate).toBeLessThanOrEqual(0.1);
  });

  it('does not record canvases', () => {
    expect(names(opts)).not.toContain('ReplayCanvas');
  });

  it('masks all text, inputs and media in the replays it does keep', () => {
    const replay = opts.integrations.find((i: any) => i.name === 'Replay');
    expect(replay).toBeTruthy();
    expect(replay.opts.maskAllText).toBe(true);
    expect(replay.opts.maskAllInputs).toBe(true);
    expect(replay.opts.blockAllMedia).toBe(true);
  });

  it('samples traces and profiles instead of taking all of them', () => {
    expect(opts.tracesSampleRate).toBeLessThanOrEqual(0.1);
    expect(opts.profilesSampleRate ?? 0).toBeLessThanOrEqual(0.1);
  });

  it('does not attach IPs, cookies or headers automatically', () => {
    expect(opts.sendDefaultPii).toBe(false);
  });

  it('reports an error silently — no dialog is ever shown to the user', async () => {
    const event = {
      event_id: 'abc',
      exception: { values: [{ value: 'kaboom' }] },
    };
    expect(opts.beforeSend(event, {})).toBe(event);
    // The old code opened the dialog from a dynamic import; give it the chance.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(showReportDialog).not.toHaveBeenCalled();
  });

  it('still drops the network noise it always dropped', () => {
    const event = { exception: { values: [{ value: 'Failed to fetch' }] } };
    expect(opts.beforeSend(event, {})).toBeNull();
  });
});

describe('Next.js server-side Sentry', () => {
  it('shares the same silent, PII-free, sampled defaults', async () => {
    init.mockReset();
    initializeSentryServer('production', DSN);
    const opts = init.mock.calls[0][0];
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.tracesSampleRate).toBeLessThanOrEqual(0.1);
    opts.beforeSend({ event_id: 'x', exception: { values: [{ value: 'e' }] } }, {});
    await new Promise((r) => setTimeout(r, 0));
    expect(showReportDialog).not.toHaveBeenCalled();
  });
});

describe('browser Sentry in development', () => {
  it('keeps full tracing so problems are easy to see locally', () => {
    expect(optionsFor('development').tracesSampleRate).toBe(1);
  });
});
