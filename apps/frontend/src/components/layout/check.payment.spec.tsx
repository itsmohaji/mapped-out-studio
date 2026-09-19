/**
 * @jest-environment ./jest.jsdom.env.cjs
 */
/**
 * CheckPayment locks the page behind a spinner while it polls the billing
 * check after a Stripe checkout. It used to poll forever while the status was
 * pending, and a single failed request left the spinner — and the lock — up
 * for good. Same freeze class as the modal manager.
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

const fetchMock = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => fetchMock,
}));
jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: () => Promise.resolve(),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => ({ open: jest.fn() }),
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  __esModule: true,
  default: () => <div>loading</div>,
}));

import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';

function isPageLocked() {
  const body = document.body;
  return (
    body.classList.contains('overflow-hidden') ||
    body.hasAttribute('data-ui-locked')
  );
}

const json = (body: unknown) => ({ json: async () => body });

afterEach(() => {
  fetchMock.mockReset();
  document.body.className = '';
  document.body.removeAttribute('data-ui-locked');
});

describe('CheckPayment', () => {
  it('unlocks the page and shows the app once payment is confirmed', async () => {
    fetchMock.mockResolvedValue(json({ status: 2 }));
    render(
      <CheckPayment check="abc" mutate={jest.fn()}>
        <div>app</div>
      </CheckPayment>
    );
    await waitFor(() => expect(screen.getByText('app')).toBeTruthy());
    expect(isPageLocked()).toBe(false);
  });

  it('never leaves the page locked when the check request fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    render(
      <CheckPayment check="abc" mutate={jest.fn()}>
        <div>app</div>
      </CheckPayment>
    );
    await waitFor(() => expect(screen.getByText('app')).toBeTruthy());
    expect(isPageLocked()).toBe(false);
  });

  it('gives up instead of polling forever while the status stays pending', async () => {
    fetchMock.mockResolvedValue(json({ status: 0 }));
    render(
      <CheckPayment check="abc" mutate={jest.fn()}>
        <div>app</div>
      </CheckPayment>
    );
    await waitFor(() => expect(screen.getByText('app')).toBeTruthy(), {
      timeout: 3000,
    });
    expect(isPageLocked()).toBe(false);
    const calls = fetchMock.mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(120);
  });

  it('releases the lock and stops polling if it unmounts mid-check', async () => {
    let release!: () => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(json({ status: 0 }));
        })
    );
    const { unmount } = render(
      <CheckPayment check="abc" mutate={jest.fn()}>
        <div>app</div>
      </CheckPayment>
    );
    expect(isPageLocked()).toBe(true);

    unmount();
    expect(isPageLocked()).toBe(false);

    const before = fetchMock.mock.calls.length;
    await act(async () => release());
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});
