/**
 * @jest-environment ./jest.jsdom.env.cjs
 */
const captureMessage = jest.fn();
let replayId: string | undefined;
jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: any[]) => captureMessage(...a),
  getReplay: () => ({ getReplayId: () => replayId }),
}));

import {
  routeKey,
  startLongTaskMonitor,
} from '@gitroom/frontend/components/layout/long.task.monitor';

type Cb = (list: { getEntries: () => { duration: number }[] }) => void;
let observers: { cb: Cb; disconnected: boolean }[];

class FakeObserver {
  static supportedEntryTypes = ['longtask'];
  disconnected = false;
  constructor(public cb: Cb) {
    observers.push(this);
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
}

const emit = (...durations: number[]) =>
  observers[0].cb({ getEntries: () => durations.map((duration) => ({ duration })) });

let now = 1_000_000;
let path = '/launches';
let warn: jest.SpyInstance;

beforeEach(() => {
  observers = [];
  (global as any).PerformanceObserver = FakeObserver;
  captureMessage.mockReset();
  replayId = undefined;
  now = 1_000_000;
  path = '/launches';
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const start = () => startLongTaskMonitor(() => path);
const stats = () => (window as any).__moLongTasks;

describe('long-task monitor', () => {
  it('ignores short tasks and records long ones per route', () => {
    start();
    emit(150, 250, 1400);
    expect(stats().count).toBe(2);
    expect(stats().worstMs).toBe(1400);
    expect(stats().byRoute['/launches']).toEqual({ count: 2, worstMs: 1400 });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('reports to Sentry at most once per route per minute', () => {
    start();
    emit(300);
    emit(5000);
    expect(captureMessage).toHaveBeenCalledTimes(1);

    now += 61_000;
    emit(300);
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  it('reports a different route straight away', () => {
    start();
    emit(300);
    path = '/media';
    emit(300);
    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(captureMessage.mock.calls[1][1].tags.route).toBe('/media');
  });

  it('labels a hard freeze and whether replay was recording', () => {
    replayId = 'r1';
    start();
    emit(1500);
    const { tags, extra, fingerprint } = captureMessage.mock.calls[0][1];
    expect(tags).toMatchObject({ kind: 'long_task', severity: 'freeze', replay: 'on' });
    expect(extra.durationMs).toBe(1500);
    expect(fingerprint).toEqual(['long-task', '/launches']);
  });

  it('caps reports per page load so a bad page cannot flood Sentry', () => {
    start();
    for (let i = 0; i < 50; i++) {
      path = `/route-${i}`;
      emit(300);
    }
    expect(captureMessage).toHaveBeenCalledTimes(20);
    expect(stats().count).toBe(50);
  });

  it('stops observing when stopped', () => {
    const stop = start();
    stop();
    expect(observers[0].disconnected).toBe(true);
  });

  it('does nothing where the browser has no longtask support', () => {
    (FakeObserver as any).supportedEntryTypes = [];
    expect(() => start()()).not.toThrow();
    expect(observers).toHaveLength(0);
    (FakeObserver as any).supportedEntryTypes = ['longtask'];
  });
});

describe('routeKey', () => {
  it('collapses ids so one route is one group and no ids leak into tags', () => {
    expect(routeKey('/p/5b8f0c3e-1d2a-4f6b-9c7d-0a1b2c3d4e5f/preview')).toBe(
      '/p/:id/preview'
    );
    expect(routeKey('/clients/42')).toBe('/clients/:id');
    expect(routeKey('/p/clx9a8b7c6d5e4f3/edit')).toBe('/p/:id/edit');
  });

  it('keeps readable route segments', () => {
    expect(routeKey('/launches')).toBe('/launches');
    expect(routeKey('/settings/ai-providers')).toBe('/settings/ai-providers');
    expect(routeKey('/')).toBe('/');
  });
});
