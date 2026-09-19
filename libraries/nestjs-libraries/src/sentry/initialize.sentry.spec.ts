/**
 * Backend + orchestrator Sentry configuration.
 *
 * Until 2026-09-19 the OpenAI integration recorded every prompt and every
 * response — brand briefs, captions, client analytics — into Sentry, and every
 * console call at every level (log, debug, trace…) was shipped as a Sentry log.
 * AI runs are already audited in `AiRun` without their content; a third-party
 * error tracker is not the place to keep client data.
 */
const init = jest.fn();
jest.mock('@sentry/nestjs', () => ({
  init: (opts: any) => init(opts),
  consoleLoggingIntegration: (opts: any) => ({ name: 'ConsoleLogging', opts }),
  openAIIntegration: (opts: any) => ({ name: 'OpenAI', opts }),
}));
jest.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: () => ({ name: 'NodeProfiling' }),
}));

import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  init.mockReset();
});

function optionsFor(nodeEnv: string) {
  process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://public@example.invalid/1';
  process.env.NODE_ENV = nodeEnv;
  initializeSentry('backend', true);
  return init.mock.calls[0][0];
}
const integration = (opts: any, name: string) =>
  opts.integrations.find((i: any) => i.name === name);

describe('backend Sentry in production', () => {
  it('never records AI prompts or responses', () => {
    const openai = integration(optionsFor('production'), 'OpenAI');
    // Either the integration is gone or it records nothing.
    if (openai) {
      expect(openai.opts.recordInputs).toBe(false);
      expect(openai.opts.recordOutputs).toBe(false);
    }
  });

  it('ships only warnings and errors from the console, not every log line', () => {
    const levels = integration(optionsFor('production'), 'ConsoleLogging').opts.levels;
    expect(levels).toEqual(expect.arrayContaining(['warn', 'error']));
    for (const noisy of ['log', 'info', 'debug', 'trace']) {
      expect(levels).not.toContain(noisy);
    }
  });

  it('samples traces instead of tracing every request', () => {
    expect(optionsFor('production').tracesSampleRate).toBeLessThanOrEqual(0.1);
  });

  it('does nothing at all without a DSN', () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    expect(initializeSentry('backend')).toBeNull();
    expect(init).not.toHaveBeenCalled();
  });
});
