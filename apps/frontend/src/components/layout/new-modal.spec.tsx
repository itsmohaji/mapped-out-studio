/**
 * @jest-environment ./jest.jsdom.env.cjs
 */
/**
 * Regression tests for the "screen is stuck" freeze (P0, 2026-09-19).
 *
 * The modal manager locks the page while a modal is open: the body stops
 * scrolling and every `.blurMe` container stops taking clicks. Two ways used to
 * leave that lock on with nothing on screen to close:
 *   1. the manager unmounting while a modal was open (the lock had no cleanup);
 *   2. a modal's content throwing — there was no error boundary, so the error
 *      escaped to Next's global-error page and took the whole app with it.
 *
 * `isPageLocked` deliberately checks for BOTH the old lock (classes) and the
 * new one (a body attribute), so these tests fail against the old code for the
 * right reason rather than because an implementation detail moved.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';

const captureException = jest.fn();
jest.mock('@gitroom/react/sentry/report', () => ({
  reportError: (...args: any[]) => captureException(...args),
}));
// ESM-only package; Escape-to-close is not what these tests are about.
jest.mock('react-hotkeys-hook', () => ({ useHotkeys: () => undefined }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
const toast = jest.fn();
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: (...a: any[]) => toast(...a) }),
}));

import {
  ModalManager,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';

function isPageLocked() {
  const body = document.body;
  return (
    body.classList.contains('overflow-hidden') ||
    body.hasAttribute('data-ui-locked') ||
    Array.from(document.querySelectorAll('.blurMe')).some((el) =>
      el.classList.contains('pointer-events-none')
    )
  );
}

let modals: ReturnType<typeof useModals>;
const Grab = () => {
  modals = useModals();
  return null;
};

const App = () => (
  <ModalManager>
    <Grab />
    <div className="blurMe" data-testid="app">
      the app
    </div>
  </ModalManager>
);

const Boom = () => {
  throw new Error('modal content exploded');
};

afterEach(() => {
  act(() => modals?.closeAll());
  document.body.className = '';
  document.body.removeAttribute('data-ui-locked');
  captureException.mockReset();
  toast.mockReset();
});

describe('modal manager page lock', () => {
  it('locks while a modal is open and unlocks when it closes', () => {
    render(<App />);
    expect(isPageLocked()).toBe(false);

    act(() => modals.openModal({ id: 'a', children: <div>hello</div> }));
    expect(screen.getByText('hello')).toBeTruthy();
    expect(isPageLocked()).toBe(true);

    act(() => modals.closeById('a'));
    expect(isPageLocked()).toBe(false);
  });

  it('stays locked until the LAST of several modals closes', () => {
    render(<App />);
    act(() => modals.openModal({ id: 'a', children: <div>one</div> }));
    act(() => modals.openModal({ id: 'b', children: <div>two</div> }));

    act(() => modals.closeById('b'));
    expect(isPageLocked()).toBe(true);

    act(() => modals.closeById('a'));
    expect(isPageLocked()).toBe(false);
  });

  it('releases the lock if the manager unmounts while a modal is open', () => {
    const { unmount } = render(<App />);
    act(() => modals.openModal({ id: 'a', children: <div>hello</div> }));
    expect(isPageLocked()).toBe(true);

    // Layout swap, user refetch returning null, route error — anything that
    // takes the manager away without closing the modal first.
    unmount();
    expect(isPageLocked()).toBe(false);
  });
});

describe('a modal whose content throws', () => {
  // React logs caught render errors to console.error; keep the output readable.
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => spy.mockRestore());

  it('closes that modal, keeps the app alive, unlocks the page and reports it', () => {
    render(<App />);
    act(() => modals.openModal({ id: 'bad', children: <Boom /> }));

    // The rest of the app is still there — the crash did not escape.
    expect(screen.getByTestId('app')).toBeTruthy();
    // The broken modal is gone and nothing is left holding the page.
    expect(isPageLocked()).toBe(false);
    // And someone finds out without a client having to report it.
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0].message).toBe(
      'modal content exploded'
    );
    // The user is told what happened instead of a window silently vanishing.
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][1]).toBe('warning');
  });

  it('only closes the broken modal, not the ones beneath it', () => {
    render(<App />);
    act(() => modals.openModal({ id: 'good', children: <div>still here</div> }));
    act(() => modals.openModal({ id: 'bad', children: <Boom /> }));

    expect(screen.getByText('still here')).toBeTruthy();
    expect(isPageLocked()).toBe(true);
  });
});
