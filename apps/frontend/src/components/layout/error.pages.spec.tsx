/**
 * @jest-environment ./jest.jsdom.env.cjs
 */
/**
 * The two Next.js error pages are the last line of defence when a render
 * throws. They must: report the error (it used to reach Sentry only if a
 * provider the global page does not have was present), never pop a Sentry
 * dialog at the user, and never leave the page locked behind them.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

const captureException = jest.fn();
const showReportDialog = jest.fn();
jest.mock('@gitroom/react/sentry/report', () => ({
  reportError: (...a: any[]) => captureException(...a),
}));
jest.mock('@sentry/nextjs', () => ({
  showReportDialog: (...a: any[]) => showReportDialog(...a),
}));
// global-error replaces the ROOT layout, so no provider is mounted above it.
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ sentryDsn: '' }),
}));

import GlobalError from '@gitroom/frontend/app/global-error';
import SiteError from '@gitroom/frontend/app/(app)/(site)/error';

let consoleError: jest.SpyInstance;
beforeEach(() => {
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  captureException.mockReset();
  showReportDialog.mockReset();
});
afterEach(() => {
  consoleError.mockRestore();
  document.body.className = '';
  document.body.removeAttribute('data-ui-locked');
});

describe('global-error', () => {
  it('reports the crash without depending on app providers, and shows no dialog', () => {
    render(<GlobalError error={new Error('root crash')} />);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0].message).toBe('root crash');
    expect(showReportDialog).not.toHaveBeenCalled();
  });

  it('releases a page lock left behind by whatever crashed', () => {
    document.body.classList.add('overflow-hidden');
    document.body.setAttribute('data-ui-locked', '1');
    render(<GlobalError error={new Error('root crash')} />);
    expect(document.body.classList.contains('overflow-hidden')).toBe(false);
    expect(document.body.hasAttribute('data-ui-locked')).toBe(false);
  });

  it('offers a way out', () => {
    render(<GlobalError error={new Error('root crash')} />);
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
  });
});

describe('page error ((site)/error.tsx)', () => {
  it('reports the crash to Sentry, not only to the console', () => {
    render(<SiteError error={new Error('page crash')} reset={jest.fn()} />);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0].message).toBe('page crash');
    expect(showReportDialog).not.toHaveBeenCalled();
  });
});
