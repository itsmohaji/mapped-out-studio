const captureException = jest.fn();
const captureMessage = jest.fn();
let sdkLoaded = 0;
jest.mock('@sentry/nextjs', () => {
  sdkLoaded++;
  return { captureException: (...a: any[]) => captureException(...a), captureMessage: (...a: any[]) => captureMessage(...a), marker: 'sdk' };
});

import { enableSentryReporting, reportError, reportMessage } from '@gitroom/react/sentry/report';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('lazy Sentry reporter', () => {
  it('does nothing — and never loads the SDK — while Sentry is not initialised', async () => {
    reportError(new Error('x'));
    reportMessage('y');
    await flush();
    expect(sdkLoaded).toBe(0);
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('forwards to the SDK once Sentry has been initialised', async () => {
    enableSentryReporting();
    const err = new Error('boom');
    reportError(err, { tags: { area: 'modal' } });
    reportMessage('slow', (S: any) => ({ extra: { sdk: S.marker } }));
    await flush();
    expect(captureException).toHaveBeenCalledWith(err, { tags: { area: 'modal' } });
    expect(captureMessage).toHaveBeenCalledWith('slow', { extra: { sdk: 'sdk' } });
  });
});
