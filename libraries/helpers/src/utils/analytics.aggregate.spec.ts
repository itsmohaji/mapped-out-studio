import {
  aggregateEngagement,
  aggregateFollowers,
  aggregateMetric,
  followerCount,
  headlineNumber,
  postingHeatmap,
  reportedChange,
  ChannelBlock,
} from './analytics.aggregate';

const block = (
  id: string,
  data: any[] | null,
  disabled = false
): ChannelBlock => ({ integration: { id, disabled }, data });

const series = (...totals: number[]) =>
  totals.map((total, i) => ({ total, date: `2026-07-0${i + 1}` }));

describe('headlineNumber', () => {
  it('sums a normal metric', () => {
    expect(headlineNumber({ label: 'Reach', data: series(2, 3, 5) })).toBe(10);
  });

  it('averages an "average" metric instead of summing', () => {
    expect(
      headlineNumber({ label: 'Rate', data: series(2, 4), average: 1 })
    ).toBe(3);
  });

  it('does not divide by zero on an empty series', () => {
    expect(headlineNumber({ label: 'Rate', data: [], average: 1 })).toBe(0);
  });
});

describe('followerCount', () => {
  it('takes the LATEST point, never the sum', () => {
    expect(followerCount([{ label: 'Followers', data: series(10, 12, 15) }])).toBe(15);
  });

  it('returns null when no follower metric exists', () => {
    expect(followerCount([{ label: 'Reach', data: series(9) }])).toBeNull();
    expect(followerCount(null)).toBeNull();
  });
});

describe('aggregateMetric', () => {
  it('sums across channels and reports the coverage', () => {
    const r = aggregateMetric(
      [
        block('a', [{ label: 'Reach', data: series(10, 20) }]),
        block('b', [{ label: 'Reach', data: series(5, 5) }]),
      ],
      'reach'
    );
    expect(r.value).toBe(40);
    expect(r.reporting).toBe(2);
    expect(r.total).toBe(2);
  });

  it('a non-reporting channel is NOT counted as a zero', () => {
    const r = aggregateMetric(
      [
        block('a', [{ label: 'Reach', data: series(10) }]),
        block('b', [{ label: 'Likes', data: series(3) }]),
      ],
      'reach'
    );
    expect(r.value).toBe(10);
    expect(r.reporting).toBe(1);
    expect(r.total).toBe(2);
  });

  it('returns null (a dash, not a zero) when nothing reports', () => {
    const r = aggregateMetric([block('a', [{ label: 'Likes', data: series(1) }])], 'reach');
    expect(r.value).toBeNull();
    expect(r.series).toEqual([]);
  });

  it('excludes disabled channels from the eligible total', () => {
    const r = aggregateMetric(
      [
        block('a', [{ label: 'Reach', data: series(10) }]),
        block('b', [{ label: 'Reach', data: series(99) }], true),
      ],
      'reach'
    );
    expect(r.value).toBe(10);
    expect(r.total).toBe(1);
  });

  it('ignores metrics the platform flagged unavailable', () => {
    const r = aggregateMetric(
      [block('a', [{ label: 'Reach', data: series(10), available: false }])],
      'reach'
    );
    expect(r.value).toBeNull();
  });

  it('merges the series by date, in date order', () => {
    const r = aggregateMetric(
      [
        block('a', [{ label: 'Reach', data: [{ total: 1, date: '2026-07-02' }] }]),
        block('b', [
          { label: 'Reach', data: [{ total: 4, date: '2026-07-01' }, { total: 2, date: '2026-07-02' }] },
        ]),
      ],
      'reach'
    );
    expect(r.series).toEqual([
      { date: '2026-07-01', total: 4 },
      { date: '2026-07-02', total: 3 },
    ]);
  });
});

describe('aggregateEngagement', () => {
  it('adds up whichever interaction metrics were reported', () => {
    const r = aggregateEngagement([
      block('a', [
        { label: 'Likes', data: series(5) },
        { label: 'Comments', data: series(2) },
      ]),
    ]);
    expect(r.value).toBe(7);
    expect(r.reporting).toBe(1);
  });

  it('is null when a channel reports no interactions at all', () => {
    expect(aggregateEngagement([block('a', [{ label: 'Reach', data: series(9) }])]).value).toBeNull();
  });
});

describe('aggregateFollowers', () => {
  it('sums the latest count per channel', () => {
    const r = aggregateFollowers([
      block('a', [{ label: 'Followers', data: series(10, 11) }]),
      block('b', [{ label: 'Subscribers', data: series(4, 9) }]),
    ]);
    expect(r.value).toBe(20);
    expect(r.reporting).toBe(2);
  });
});

describe('reportedChange', () => {
  it('only uses a change the platform actually supplied', () => {
    expect(
      reportedChange(
        [block('a', [{ label: 'Reach', data: series(1), percentageChange: 10 }])],
        'reach'
      )
    ).toBe(10);
  });

  it('never invents one from the series', () => {
    expect(
      reportedChange([block('a', [{ label: 'Reach', data: series(1, 50) }])], 'reach')
    ).toBeNull();
  });
});

describe('postingHeatmap', () => {
  it('counts real publish timestamps into day x hour', () => {
    const d = new Date(2026, 6, 1, 14, 30); // Wednesday 14:00 local
    const grid = postingHeatmap([{ publishDate: d.toISOString() }]);
    expect(grid[d.getDay()][14]).toBe(1);
    expect(grid.length).toBe(7);
    expect(grid[0].length).toBe(24);
  });

  it('skips unparseable dates instead of throwing', () => {
    expect(() => postingHeatmap([{ publishDate: 'nope' }])).not.toThrow();
  });
});
