/**
 * Expanding a recurring post into the occurrences that fall inside the calendar
 * window the user is actually looking at.
 *
 * The old expansion started at the post's ORIGINAL publish date and stepped
 * forward one interval at a time until it passed the window end — so a daily
 * post created two years ago produced ~730 entries to render one week, and
 * every one of them was sent over the wire.
 */

export interface Occurrence {
  date: Date;
  /** The original row's publish date, kept so the editor opens the real post. */
  actualDate: Date;
}

/** Hard cap. A window plus a tiny interval must never build a runaway list. */
export const MAX_OCCURRENCES = 500;

export function recurringOccurrences(
  publishDate: Date | string,
  intervalInDays: number | null | undefined,
  windowStart: Date | string,
  windowEnd: Date | string
): Occurrence[] {
  const first = new Date(publishDate);
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  const interval = Number(intervalInDays);

  // A zero or negative interval would never advance the cursor — the original
  // loop would spin forever. Treat it as "not actually recurring".
  if (!Number.isFinite(interval) || interval <= 0) return [];
  if (Number.isNaN(first.getTime()) || Number.isNaN(end.getTime())) return [];
  if (first.getTime() > end.getTime()) return [];

  const DAY = 86_400_000;
  const step = interval * DAY;

  // Jump straight to the first occurrence at or after the window start instead
  // of stepping there one interval at a time.
  let cursor = first.getTime();
  if (cursor < start.getTime()) {
    const skips = Math.ceil((start.getTime() - cursor) / step);
    cursor += skips * step;
  }

  const out: Occurrence[] = [];
  while (cursor <= end.getTime() && out.length < MAX_OCCURRENCES) {
    out.push({ date: new Date(cursor), actualDate: first });
    cursor += step;
  }
  return out;
}
