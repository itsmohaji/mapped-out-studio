import { isValidTimezone, resolveTimezone } from './timezone';

describe('isValidTimezone', () => {
  it('accepts IANA zones the runtime can actually compute in', () => {
    expect(isValidTimezone('Asia/Bahrain')).toBe(true);
    expect(isValidTimezone('Europe/London')).toBe(true);
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
  });

  it('rejects anything the IANA database does not know', () => {
    expect(isValidTimezone('Not/AZone')).toBe(false);
    expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false);
  });

  it('rejects non-strings, empty strings and whitespace', () => {
    expect(isValidTimezone(undefined)).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(0)).toBe(false);
    expect(isValidTimezone(120)).toBe(false);
    expect(isValidTimezone({ timeZone: 'UTC' })).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone('   ')).toBe(false);
  });
});

describe('resolveTimezone', () => {
  it('lets the account outrank the device — this is the whole point', () => {
    expect(
      resolveTimezone({
        account: 'Asia/Bahrain',
        stored: 'Europe/London',
        guess: 'America/New_York',
      })
    ).toBe('Asia/Bahrain');
  });

  it('falls back to the device cache until the account has loaded', () => {
    expect(
      resolveTimezone({
        account: null,
        stored: 'Europe/London',
        guess: 'America/New_York',
      })
    ).toBe('Europe/London');
  });

  it('falls back to the browser guess when nothing has been chosen yet', () => {
    expect(
      resolveTimezone({ account: null, stored: null, guess: 'America/New_York' })
    ).toBe('America/New_York');
  });

  it('skips a source that names a zone the runtime cannot honour', () => {
    // A zone deleted from the IANA database, or a hand-edited localStorage
    // value, must not take the app down — the next source answers instead.
    expect(
      resolveTimezone({
        account: 'Not/AZone',
        stored: 'Europe/London',
        guess: 'America/New_York',
      })
    ).toBe('Europe/London');
  });

  it('answers UTC rather than nothing when every source is unusable', () => {
    expect(resolveTimezone({})).toBe('UTC');
    expect(
      resolveTimezone({ account: '', stored: null, guess: 'Not/AZone' })
    ).toBe('UTC');
  });
});
