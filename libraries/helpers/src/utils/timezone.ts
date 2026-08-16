/**
 * Timezone resolution — one question, one answer, everywhere.
 *
 * The timezone used to live in `localStorage` and nowhere else. Two devices
 * belonging to the same person therefore turned the same typed wall-clock time
 * into two different UTC instants: whatever the browser happened to guess won,
 * per device, silently. The account is now the source of truth; `localStorage`
 * survives only as a synchronous cache, because `getTimezone()` is reached from
 * module-level dayjs calls that have to answer before React has mounted.
 *
 * Both ends share this module: the frontend to decide which zone to render in,
 * the backend to refuse a zone it cannot honour.
 */

/**
 * True only for a zone the runtime's IANA database actually knows.
 *
 * `Intl` is the only timezone database guaranteed to be present in both node
 * and the browser, and it is already how the automation module reads zoned
 * wall-clock parts — so a zone that passes here is a zone the rest of the
 * system can compute with.
 */
export const isValidTimezone = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export interface TimezoneSources {
  /** What the account says. The source of truth when it is set. */
  account?: string | null;
  /** The per-device cache. Only answers before the account has loaded. */
  stored?: string | null;
  /** The browser's guess. Last resort, and the value we adopt on first run. */
  guess?: string | null;
}

/**
 * First source that names a real zone wins, in order of authority. `UTC` is the
 * floor: it is always valid, so the app never has to handle "no timezone".
 */
export const resolveTimezone = ({
  account,
  stored,
  guess,
}: TimezoneSources): string => {
  return [account, stored, guess].find(isValidTimezone) ?? 'UTC';
};
