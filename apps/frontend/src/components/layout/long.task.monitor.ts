import { reportMessage } from '@gitroom/react/sentry/report';

/**
 * Evidence for "the UI froze" (P0, 2026-09-19).
 *
 * A freeze is the main thread being busy for too long to respond to input. The
 * browser reports every such stretch as a `longtask` entry; until now nothing
 * listened, so a freeze left no trace anywhere and could only be described,
 * never measured.
 *
 * Every task over LONG_TASK_MS is counted per route and logged to the console.
 * Sentry gets at most one event per route per minute (grouped by route, tagged
 * with whether session replay was recording — the first suspect — so the two
 * populations can be compared). Running totals are on `window.__moLongTasks`
 * for anyone checking a live page.
 *
 * Chromium-based browsers only; Safari and Firefox do not expose `longtask`,
 * and there this does nothing.
 */
export const LONG_TASK_MS = 200;
/** A single task this long is a hard freeze, not jank. */
export const FREEZE_MS = 1000;
const REPORT_EVERY_MS = 60_000;
const MAX_REPORTS_PER_LOAD = 20;

export interface LongTaskStats {
  count: number;
  worstMs: number;
  totalMs: number;
  byRoute: Record<string, { count: number; worstMs: number }>;
}

/**
 * `/p/5b8f…/preview` → `/p/:id/preview`, so one route is one Sentry group and
 * not one per post, and no raw ids end up in tags.
 */
export function routeKey(pathname: string): string {
  return (
    pathname
      .split('/')
      .map((part) =>
        /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) ||
        /^\d+$/.test(part) ||
        (part.length >= 12 && /\d/.test(part) && /^[A-Za-z0-9_-]+$/.test(part))
          ? ':id'
          : part
      )
      .join('/') || '/'
  );
}

export function startLongTaskMonitor(
  getPathname: () => string = () => window.location.pathname
): () => void {
  if (
    typeof PerformanceObserver === 'undefined' ||
    !PerformanceObserver.supportedEntryTypes?.includes('longtask')
  ) {
    return () => undefined;
  }

  const stats: LongTaskStats = { count: 0, worstMs: 0, totalMs: 0, byRoute: {} };
  (window as any).__moLongTasks = stats;
  const lastReportAt: Record<string, number> = {};
  let reports = 0;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration < LONG_TASK_MS) continue;

      const ms = Math.round(entry.duration);
      const route = routeKey(getPathname());
      const onRoute = (stats.byRoute[route] ??= { count: 0, worstMs: 0 });
      stats.count += 1;
      stats.totalMs += ms;
      stats.worstMs = Math.max(stats.worstMs, ms);
      onRoute.count += 1;
      onRoute.worstMs = Math.max(onRoute.worstMs, ms);

      console.warn(`[Mapped Out] main thread blocked for ${ms}ms on ${route}`);

      const now = Date.now();
      if (
        reports >= MAX_REPORTS_PER_LOAD ||
        now - (lastReportAt[route] ?? -Infinity) < REPORT_EVERY_MS
      ) {
        continue;
      }
      lastReportAt[route] = now;
      reports += 1;

      const countOnRoute = onRoute.count;
      const worstOnRouteMs = onRoute.worstMs;
      reportMessage('Main thread blocked', (S) => {
        let replay = 'off';
        try {
          replay = (S as any).getReplay?.()?.getReplayId?.() ? 'on' : 'off';
        } catch {
          /* diagnostics must never throw */
        }
        return {
          level: 'warning',
          fingerprint: ['long-task', route],
          tags: {
            kind: 'long_task',
            route,
            severity: ms >= FREEZE_MS ? 'freeze' : 'jank',
            replay,
          },
          extra: { durationMs: ms, countOnRoute, worstOnRouteMs },
        };
      });
    }
  });

  try {
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    return () => undefined;
  }
  return () => observer.disconnect();
}
