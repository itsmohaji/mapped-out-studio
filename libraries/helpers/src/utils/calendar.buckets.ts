/**
 * Calendar post bucketing.
 *
 * Week view renders 7 x 24 = 168 cells. Each cell used to run its own
 * `posts.filter(...)` over the WHOLE post list to find the handful that belong
 * to it — so painting one week was 168 full scans, and it ran again on every
 * re-render of the calendar.
 *
 * Grouping once into a Map turns that into a single pass plus 168 O(1) lookups.
 * On an iPad with a busy month loaded, that is the difference between a frame
 * and a freeze.
 *
 * Pure so the bucketing rule is testable without a browser: an off-by-one here
 * silently hides a post from the calendar, which is worse than being slow.
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export type CalendarDisplay = 'day' | 'week' | 'month' | 'list';

export interface BucketablePost {
  publishDate: string | Date;
}

/**
 * The key a date falls into, per display mode. These MUST match what the cell
 * asks for, so both sides call this one function.
 *
 * - day   — exact minute, because the day view shows a row per minute-slot
 * - week  — the hour, because a week cell is one hour
 * - month — the calendar day
 */
export function bucketKey(date: dayjs.Dayjs, display: CalendarDisplay): string {
  switch (display) {
    case 'day':
      return date.format('YYYY-MM-DD HH:mm');
    case 'month':
      return date.format('YYYY-MM-DD');
    default:
      return date.format('YYYY-MM-DD HH');
  }
}

/**
 * Group posts into their cells, in one pass.
 *
 * Dates are converted UTC -> local first, exactly as the cell used to do. A
 * post with an unparseable date is DROPPED rather than bucketed under
 * "Invalid Date": a garbage key would collect every bad row into one cell and
 * render them all in the wrong place, which looks like data corruption.
 */
export function groupPostsByBucket<T extends BucketablePost>(
  posts: T[],
  display: CalendarDisplay
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const post of posts || []) {
    const local = dayjs.utc(post?.publishDate).local();
    if (!local.isValid()) continue;
    const key = bucketKey(local, display);
    const existing = map.get(key);
    if (existing) existing.push(post);
    else map.set(key, [post]);
  }
  return map;
}

/** Empty array shared by every miss, so a lookup never creates garbage. */
export const NO_POSTS: never[] = [];

export function postsInBucket<T extends BucketablePost>(
  buckets: Map<string, T[]>,
  date: dayjs.Dayjs,
  display: CalendarDisplay
): T[] {
  return buckets.get(bucketKey(date, display)) || (NO_POSTS as unknown as T[]);
}
