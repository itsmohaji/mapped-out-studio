import { asArray, isUnexpectedShape, pluckArray } from './as.array';

describe('asArray', () => {
  it('passes an array straight through, same identity', () => {
    const list = [1, 2, 3];
    expect(asArray(list)).toBe(list);
  });

  it('turns null and undefined into an empty list', () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
  });

  it('turns the WRONG TYPE into an empty list — the actual crash', () => {
    // `x?.filter` does not protect against any of these. Each one is a real
    // API failure mode: an error envelope, a stringified body, a bare number.
    expect(asArray({ statusCode: 500, message: 'boom' })).toEqual([]);
    expect(asArray('not a list')).toEqual([]);
    expect(asArray(42)).toEqual([]);
    expect(asArray(true)).toEqual([]);
  });

  it('never returns something without .filter and .map', () => {
    for (const input of [null, undefined, {}, '', 0, NaN, { a: 1 }]) {
      const out = asArray(input);
      expect(typeof out.filter).toBe('function');
      expect(typeof out.map).toBe('function');
    }
  });

  it('returns a STABLE empty identity, so it cannot become a render loop', () => {
    // A fresh [] each call would give every downstream useMemo a new dependency
    // on every render — a "safety" wrapper that quietly becomes a perf bug.
    expect(asArray(null)).toBe(asArray(undefined));
    expect(asArray({})).toBe(asArray('nope'));
  });

  it('the shared empty list cannot be mutated by a caller', () => {
    const out = asArray<number>(null);
    expect(() => {
      (out as number[]).push(1);
    }).toThrow();
  });
});

describe('pluckArray', () => {
  it('reads the named list out of an envelope', () => {
    expect(pluckArray({ integrations: [{ id: 'a' }] }, 'integrations')).toEqual([
      { id: 'a' },
    ]);
  });

  it('accepts a bare array body too', () => {
    const list = [{ id: 'a' }];
    expect(pluckArray(list, 'integrations')).toBe(list);
  });

  it('survives every shape an API actually returns on a bad day', () => {
    for (const body of [
      null,
      undefined,
      {},
      { integrations: null },
      { integrations: 'oops' },
      { integrations: { 0: 'a' } },
      { statusCode: 502, message: 'Bad Gateway' },
      'Bad Gateway',
    ]) {
      expect(pluckArray(body, 'integrations')).toEqual([]);
    }
  });
});

describe('isUnexpectedShape', () => {
  it('flags a present-but-wrong value, and only that', () => {
    // Absent is normal — still loading. Present-but-wrong is a real bug and
    // worth a log line.
    expect(isUnexpectedShape({ a: 1 })).toBe(true);
    expect(isUnexpectedShape('x')).toBe(true);
    expect(isUnexpectedShape([])).toBe(false);
    expect(isUnexpectedShape(null)).toBe(false);
    expect(isUnexpectedShape(undefined)).toBe(false);
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `x?.filter(...)` is the idiom that produced "_?.filter is not a function" on
 * the Calendar page. It reads as defensive and is not: it guards null, and does
 * nothing when the value is present and the wrong TYPE — which is exactly what
 * an API returns on a bad day.
 *
 * The fix was to guarantee the shape where the data enters. This pins that, at
 * the specific boundaries the Calendar page depends on. A repo-wide ban on the
 * idiom is a bigger refactor and is deliberately NOT claimed here.
 */
describe('calendar data boundaries are guaranteed', () => {
  const frontend = join(__dirname, '../../../..', 'apps/frontend/src');
  const read = (rel: string) =>
    readFileSync(join(frontend, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('useIntegrationList always returns an array of usable channels', () => {
    const code = read('components/launches/helpers/use.integration.list.tsx');
    // Was `pluckArray`, which guaranteed the OUTER array only. That was not
    // enough: the envelope could be perfectly well-formed while one item's
    // `time` was `{}`, and the Calendar's `p.time.flatMap()` still threw. The
    // normaliser repairs each item too, so this now asserts the stronger
    // guarantee rather than the weaker one it replaced.
    expect(code).toContain('normalizeIntegrationList');
    // The old shape: `(await res.json()).integrations` straight out.
    expect(code).not.toMatch(/\)\.json\(\)\)\.integrations/);
  });

  it('the calendar context normalises every list it exposes', () => {
    const code = read('components/launches/calendar.context.tsx');
    expect(code).toContain('asArray');
    // `|| []` catches null but not a present-but-wrong value.
    expect(code).not.toMatch(/calendarData\?\.posts \|\| \[\]/);
    expect(code).not.toMatch(/sets \|\| \[\]/);
  });

  it('the calendar page no longer optional-chains its channel list', () => {
    const code = read('components/launches/launches.component.tsx');
    expect(code).not.toMatch(/integrations\?\.filter/);
  });
});
