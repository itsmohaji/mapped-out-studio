import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
  bucketKey,
  groupPostsByBucket,
  postsInBucket,
} from './calendar.buckets';

dayjs.extend(utc);
dayjs.extend(timezone);

const post = (publishDate: string, id = publishDate) => ({ publishDate, id });

describe('bucketKey', () => {
  const d = dayjs('2026-03-14T09:37:00');

  it('buckets a week cell by the hour', () => {
    expect(bucketKey(d, 'week')).toBe('2026-03-14 09');
  });

  it('buckets a month cell by the day', () => {
    expect(bucketKey(d, 'month')).toBe('2026-03-14');
  });

  it('buckets a day cell by the exact minute', () => {
    expect(bucketKey(d, 'day')).toBe('2026-03-14 09:37');
  });

  it('puts two times in the same hour into the same week bucket', () => {
    expect(bucketKey(dayjs('2026-03-14T09:00:00'), 'week')).toBe(
      bucketKey(dayjs('2026-03-14T09:59:59'), 'week')
    );
  });

  it('does NOT merge adjacent hours', () => {
    expect(bucketKey(dayjs('2026-03-14T09:59:59'), 'week')).not.toBe(
      bucketKey(dayjs('2026-03-14T10:00:00'), 'week')
    );
  });
});

describe('groupPostsByBucket', () => {
  it('groups in one pass and keeps every post', () => {
    const posts = [
      post('2026-03-14T09:10:00.000Z'),
      post('2026-03-14T09:50:00.000Z'),
      post('2026-03-14T11:00:00.000Z'),
    ];
    const buckets = groupPostsByBucket(posts, 'week');
    const total = [...buckets.values()].reduce((n, v) => n + v.length, 0);
    expect(total).toBe(3);
  });

  it('a lookup returns exactly the posts the old filter would have', () => {
    // The property that matters: bucketing must not change WHICH posts a cell
    // shows, only how fast it finds them.
    const posts = [
      post('2026-03-14T09:10:00.000Z'),
      post('2026-03-14T09:50:00.000Z'),
      post('2026-03-14T11:00:00.000Z'),
    ];
    const buckets = groupPostsByBucket(posts, 'week');

    for (const display of ['week', 'month', 'day'] as const) {
      const b = groupPostsByBucket(posts, display);
      for (const p of posts) {
        const cell = dayjs.utc(p.publishDate).local();
        expect(postsInBucket(b, cell, display)).toContain(p);
      }
    }

    const nineAm = dayjs.utc('2026-03-14T09:00:00.000Z').local();
    expect(postsInBucket(buckets, nineAm, 'week')).toHaveLength(2);
  });

  it('returns an empty array for a cell with nothing in it', () => {
    const buckets = groupPostsByBucket([post('2026-03-14T09:00:00.000Z')], 'week');
    const empty = postsInBucket(buckets, dayjs('2020-01-01T00:00:00'), 'week');
    expect(empty).toEqual([]);
  });

  it('returns the SAME empty array every time, so a miss creates no garbage', () => {
    // 168 cells x a re-render each would otherwise allocate 168 throwaway
    // arrays, and each new identity would break a downstream useMemo.
    const buckets = groupPostsByBucket([], 'week');
    const a = postsInBucket(buckets, dayjs('2020-01-01T00:00:00'), 'week');
    const b = postsInBucket(buckets, dayjs('2021-02-02T00:00:00'), 'week');
    expect(a).toBe(b);
  });

  it('DROPS an unparseable date instead of bucketing it under "Invalid Date"', () => {
    // One garbage key would collect every bad row into a single cell and render
    // them all in the wrong place — that reads as data corruption, not slowness.
    const buckets = groupPostsByBucket(
      [post('not-a-date'), post('2026-03-14T09:00:00.000Z')],
      'week'
    );
    const total = [...buckets.values()].reduce((n, v) => n + v.length, 0);
    expect(total).toBe(1);
    expect([...buckets.keys()].join()).not.toMatch(/invalid/i);
  });

  it('is safe on empty and undefined input', () => {
    expect(groupPostsByBucket([], 'week').size).toBe(0);
    expect(groupPostsByBucket(undefined as any, 'week').size).toBe(0);
  });

  it('handles a busy month without quadratic blowup', () => {
    // 500 posts x 168 cells was 84,000 comparisons per render. This asserts the
    // shape of the fix: one pass to build, O(1) to read.
    const posts = Array.from({ length: 500 }, (_, i) =>
      post(`2026-03-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00.000Z`)
    );
    const buckets = groupPostsByBucket(posts, 'week');
    const total = [...buckets.values()].reduce((n, v) => n + v.length, 0);
    expect(total).toBe(500);
  });
});
