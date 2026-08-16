/**
 * Constructing dates in the user's timezone rather than the browser's.
 *
 * Displaying dates in a chosen timezone is only half a fix. The app also reads
 * wall-clock values back — "9:00" typed into the picker, "2026-08-16" from a
 * filter, the hour a calendar cell stands for — and turns them into UTC
 * instants with `.utc()`. If those are built in the BROWSER's zone while the
 * screen is labelled in the CHOSEN one, the user types 9am, sees 9am, and the
 * post goes out at some other hour. That is worse than the bug we set out to
 * fix, so both directions go through here.
 *
 * The rule is simple: a value that already names an instant keeps its instant
 * and is re-expressed in the zone; a value that only names a wall-clock is
 * interpreted IN the zone.
 *
 * Pure, and takes dayjs as an argument, so the rule can be tested without a
 * browser and without depending on the machine's own timezone.
 */

import type { ConfigType, Dayjs } from 'dayjs';

/**
 * The dayjs surface this module needs. Typed structurally so the caller can
 * pass its own configured instance (the frontend's has a dozen plugins on it).
 */
export interface ZonedDayjsLib {
  (config?: ConfigType): Dayjs;
  tz: {
    (config?: ConfigType, timezone?: string): Dayjs;
  };
}

/**
 * True when a string carries its own UTC offset — `...Z`, `+03:00`, `-0500`.
 *
 * Such a string names an instant, so it must not be re-interpreted as a
 * wall-clock: `2026-08-16T06:00:00.000Z` is 9am in Bahrain, not 6am.
 */
export const hasExplicitOffset = (value: string): boolean =>
  /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());

/**
 * Build a Dayjs that thinks in `zone`.
 *
 * - no argument      — now, expressed in the zone
 * - offset-bearing   — that instant, expressed in the zone
 * - bare wall-clock  — that wall-clock, read as being in the zone
 * - Date / number    — that instant, expressed in the zone
 *
 * When the zone equals the browser's own timezone every branch is equivalent to
 * plain `dayjs(...)`, which is why turning this on changes nothing for a user
 * who never leaves their own timezone.
 */
export const zonedDayjs = (
  dayjs: ZonedDayjsLib,
  zone: string,
  config?: ConfigType
): Dayjs => {
  if (config === undefined || config === null) {
    return dayjs().tz(zone);
  }

  if (typeof config === 'string') {
    return hasExplicitOffset(config)
      ? dayjs(config).tz(zone)
      : dayjs.tz(config, zone);
  }

  return dayjs(config).tz(zone);
};

/**
 * The wall-clock the user is looking at, as a plain `Date`.
 *
 * Date-picker widgets speak native `Date`s and read their components in the
 * BROWSER's zone. Handing one a zoned instant makes it display a different
 * clock time from the rest of the app, so hand it the digits instead.
 */
export const toWidgetDate = (date: Dayjs): Date =>
  new Date(
    date.year(),
    date.month(),
    date.date(),
    date.hour(),
    date.minute(),
    date.second()
  );
