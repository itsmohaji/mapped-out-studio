/**
 * @jest-environment ./jest.jsdom.env.cjs
 */
/**
 * Sidebar prefetching is on intent, not on page load (performance baseline
 * 2026-09-19: blanket prefetch downloaded 5–10 MB of other sections per load).
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

const prefetch = jest.fn();
let pathname = '/dashboard';
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ prefetch }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ prefetch: p, children, ...rest }: any) => <a data-prefetch={String(p)} {...rest}>{children}</a>,
}));

import { MenuItem } from '@gitroom/frontend/components/new-layout/menu-item';

beforeEach(() => {
  prefetch.mockReset();
  pathname = '/dashboard';
  jest.useFakeTimers();
  delete (window as any).requestIdleCallback;
});
afterEach(() => jest.useRealTimers());

describe('sidebar prefetching', () => {
  it('does not prefetch a section just because it is on screen', () => {
    render(<MenuItem label="Tasks" icon={null} path="/tasks" />);
    act(() => jest.advanceTimersByTime(10_000));
    expect(prefetch).not.toHaveBeenCalled();
    expect(screen.getByTitle('Tasks').getAttribute('data-prefetch')).toBe('false');
  });

  it('prefetches on hover, focus and touch', () => {
    render(<MenuItem label="Tasks" icon={null} path="/tasks" />);
    const a = screen.getByTitle('Tasks');
    fireEvent.mouseEnter(a);
    fireEvent.focus(a);
    fireEvent.touchStart(a);
    expect(prefetch).toHaveBeenCalledTimes(3);
    expect(prefetch).toHaveBeenCalledWith('/tasks');
  });

  it('prefetches only the likely-next section (Calendar) once idle', () => {
    render(<MenuItem label="Calendar" icon={null} path="/launches" />);
    expect(prefetch).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(2500));
    expect(prefetch).toHaveBeenCalledWith('/launches');
  });

  it('does not idle-prefetch the Calendar while you are on it', () => {
    pathname = '/launches';
    render(<MenuItem label="Calendar" icon={null} path="/launches" />);
    act(() => jest.advanceTimersByTime(10_000));
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('never prefetches external links', () => {
    render(<MenuItem label="Docs" icon={null} path="https://example.com" />);
    fireEvent.mouseEnter(screen.getByTitle('Docs'));
    expect(prefetch).not.toHaveBeenCalled();
  });
});
