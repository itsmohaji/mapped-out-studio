'use client';
import { ConfigType, Dayjs } from 'dayjs';
// Every plugin the frontend uses, registered in one place. Importing this here
// means the whole app inherits them: most components already reach dayjs
// through `newDayjs` below.
import dayjs from '@gitroom/frontend/components/layout/dayjs.setup';
import {
  isValidTimezone,
  resolveTimezone,
} from '@gitroom/helpers/utils/timezone';
import { zonedDayjs } from '@gitroom/helpers/utils/dayjs.zone';

const { utc: originalUtc } = dayjs;

export const TIMEZONE_STORAGE_KEY = 'timezone';

// The account's zone, cached at module scope. `getTimezone()` is called from
// module-level dayjs code all over the app and must answer synchronously, so it
// cannot read React context itself — `TimezoneSync` pushes the value in here.
//
// This module stays free of React and of app-level imports on purpose: roughly
// twenty components import it just for `newDayjs`, and the account wiring lives
// next door in `timezone.sync.tsx`.
let accountTimezone: string | null = null;

const readStoredTimezone = () => {
  try {
    return localStorage.getItem(TIMEZONE_STORAGE_KEY);
  } catch {
    // Private mode, or storage disabled. Not a reason to fail to render a date.
    return null;
  }
};

export const getTimezone = () => {
  if (typeof window === 'undefined') {
    return dayjs.tz.guess();
  }

  return resolveTimezone({
    account: accountTimezone,
    stored: readStoredTimezone(),
    guess: dayjs.tz.guess(),
  });
};

export const getAccountTimezone = () => accountTimezone;

/**
 * Adopt a zone for this browser: cache it, and make it dayjs's default so
 * `dayjs.tz()` (which a few components call with no argument) agrees with
 * everything rendered through `.local()`.
 */
export const applyTimezone = (timezone: string) => {
  if (!isValidTimezone(timezone)) {
    return;
  }

  accountTimezone = timezone;

  try {
    localStorage.setItem(TIMEZONE_STORAGE_KEY, timezone);
  } catch {
    // The account still holds the value; the cache is only an optimisation.
  }

  dayjs.tz.setDefault(timezone);
};

/**
 * The app's date constructor. Every component builds dates through this rather
 * than calling dayjs directly, which is what makes one setting able to move the
 * whole product into another timezone.
 *
 * On the server it stays plain dayjs: there is no user there to have a zone,
 * and the pages that matter render on the client.
 */
export const newDayjs = (config?: ConfigType) => {
  if (typeof window === 'undefined') {
    return dayjs(config);
  }

  return zonedDayjs(dayjs, getTimezone(), config);
};

// Patched at module scope rather than from an effect. Effects run after the
// whole tree has rendered, so a patch installed there arrives one paint too
// late: every date on screen would first render in the browser's zone and only
// pick up the chosen one on some later re-render. Browser only — on the server
// this would leak one request's timezone into the next.
if (typeof window !== 'undefined') {
  // `.local()` means "the timezone this user works in", not "the timezone this
  // machine is set to". Patched on the prototype so that both spellings the
  // codebase uses — `dayjs.utc(x).local()` and `newDayjs(x).local()` — give the
  // same answer; when they disagreed, the calendar bucketed a post into one
  // cell and drew it in another.
  const proto = Object.getPrototypeOf(originalUtc());
  proto.local = function (this: Dayjs) {
    return this.tz(getTimezone());
  };

  const stored = readStoredTimezone();
  if (stored) {
    dayjs.tz.setDefault(getTimezone());
  }
}
