/**
 * The ONE place dayjs plugins are registered for the frontend.
 *
 * `dayjs.extend()` is a global side effect, so a plugin is available only if
 * some module that calls `extend` has already been evaluated. Before this file,
 * registration was scattered across eight components and several call sites
 * depended on a DIFFERENT module having been imported first:
 *
 *   - calendar.tsx called `.isoWeekday()` but only registered isSameOrAfter,
 *     relying on calendar.context.tsx loading first
 *   - stars.table.component.tsx called `.isoWeek()` and registered nothing
 *   - filters.tsx called `startOf('isoWeek')` and registered nothing
 *   - notification.component.tsx called `.fromNow()` and registered nothing
 *
 * Whether those worked depended on Next's code splitting and which route the
 * user landed on — which is exactly why the calendar "randomly" crashed with
 * "... is not a function". A missing plugin does not degrade: the method simply
 * is not there.
 *
 * Import this module (or anything that imports it, such as `set.timezone`)
 * before using dayjs. It is idempotent — `extend` ignores a plugin it already
 * has — so importing it from many places costs nothing.
 *
 * `dayjs.plugins.spec.ts` fails the build if a frontend file starts using a
 * plugin method this file does not register.
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import duration from 'dayjs/plugin/duration';

// Order matters for exactly one pair: `timezone` requires `utc`.
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(advancedFormat);
dayjs.extend(customParseFormat);
dayjs.extend(duration);

export default dayjs;
