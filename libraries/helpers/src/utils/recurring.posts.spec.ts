import { MAX_OCCURRENCES, recurringOccurrences } from './recurring.posts';

const d = (s: string) => new Date(s);

describe('recurringOccurrences', () => {
  it('returns only the occurrences inside the window', () => {
    const out = recurringOccurrences(
      d('2026-01-01T09:00:00Z'),
      1,
      d('2026-07-06T00:00:00Z'),
      d('2026-07-08T23:59:59Z')
    );
    expect(out.map((o) => o.date.toISOString())).toEqual([
      '2026-07-06T09:00:00.000Z',
      '2026-07-07T09:00:00.000Z',
      '2026-07-08T09:00:00.000Z',
    ]);
  });

  it('does not walk from the original date — a 2-year-old daily post costs 3 entries, not 700', () => {
    const out = recurringOccurrences(
      d('2024-01-01T09:00:00Z'),
      1,
      d('2026-07-06T00:00:00Z'),
      d('2026-07-08T23:59:59Z')
    );
    expect(out).toHaveLength(3);
  });

  it('keeps the original publish date so the editor opens the real post', () => {
    const out = recurringOccurrences(
      d('2026-01-01T09:00:00Z'),
      7,
      d('2026-07-06T00:00:00Z'),
      d('2026-07-20T00:00:00Z')
    );
    expect(out.length).toBeGreaterThan(0);
    for (const o of out) {
      expect(o.actualDate.toISOString()).toBe('2026-01-01T09:00:00.000Z');
    }
  });

  it('never produces an occurrence before the post existed', () => {
    const out = recurringOccurrences(
      d('2026-07-10T09:00:00Z'),
      1,
      d('2026-07-01T00:00:00Z'),
      d('2026-07-12T23:59:59Z')
    );
    expect(out.map((o) => o.date.toISOString())).toEqual([
      '2026-07-10T09:00:00.000Z',
      '2026-07-11T09:00:00.000Z',
      '2026-07-12T09:00:00.000Z',
    ]);
  });

  it('returns nothing when the post starts after the window', () => {
    expect(
      recurringOccurrences(
        d('2026-09-01T09:00:00Z'),
        1,
        d('2026-07-01T00:00:00Z'),
        d('2026-07-08T00:00:00Z')
      )
    ).toEqual([]);
  });

  it('treats a zero or negative interval as not recurring instead of spinning forever', () => {
    // The original loop never advanced its cursor for these — an infinite loop.
    expect(
      recurringOccurrences(d('2026-01-01'), 0, d('2026-07-01'), d('2026-07-08'))
    ).toEqual([]);
    expect(
      recurringOccurrences(d('2026-01-01'), -3, d('2026-07-01'), d('2026-07-08'))
    ).toEqual([]);
    expect(
      recurringOccurrences(d('2026-01-01'), null, d('2026-07-01'), d('2026-07-08'))
    ).toEqual([]);
  });

  it('caps a pathological range instead of building a runaway list', () => {
    const out = recurringOccurrences(
      d('2020-01-01'),
      1,
      d('2020-01-01'),
      d('2100-01-01')
    );
    expect(out).toHaveLength(MAX_OCCURRENCES);
  });

  it('survives an unparseable date', () => {
    expect(
      recurringOccurrences('nope', 1, d('2026-07-01'), d('2026-07-08'))
    ).toEqual([]);
  });
});
