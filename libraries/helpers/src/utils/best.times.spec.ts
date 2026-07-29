import {
  MIN_SAMPLES,
  bestSlots,
  confidence,
  engagementScore,
  scoreSlots,
} from './best.times';

// Local time on purpose — the recommendation has to match the clock the user
// schedules against.
const at = (day: number, hour: number, metrics: any) => {
  // 2026-07-05 is a Sunday.
  const d = new Date(2026, 6, 5 + day, hour, 0, 0);
  return { timestamp: d, metrics };
};

describe('engagementScore', () => {
  it('prefers reach when the platform reported it', () => {
    expect(engagementScore({ timestamp: new Date(), metrics: { reach: 500, likes: 3 } })).toBe(500);
  });

  it('falls back to the interactions it did report', () => {
    expect(
      engagementScore({ timestamp: new Date(), metrics: { likes: 4, comments: 2 } })
    ).toBe(6);
  });

  it('returns null when the platform reported NOTHING', () => {
    // Excluded from the average, never counted as a zero.
    expect(engagementScore({ timestamp: new Date(), metrics: {} })).toBeNull();
    expect(engagementScore({ timestamp: new Date() })).toBeNull();
    expect(
      engagementScore({ timestamp: new Date(), metrics: { likes: 0, comments: 0 } })
    ).toBeNull();
  });
});

describe('scoreSlots', () => {
  it('averages by weekday and hour', () => {
    const slots = scoreSlots([
      at(1, 9, { reach: 100 }),
      at(1, 9, { reach: 300 }),
      at(2, 18, { reach: 50 }),
    ]);
    const mon9 = slots.find((s) => s.day === 1 && s.hour === 9)!;
    expect(mon9.averageScore).toBe(200);
    expect(mon9.samples).toBe(2);
  });

  it('skips posts with no reported metrics rather than scoring them zero', () => {
    const slots = scoreSlots([at(1, 9, { reach: 100 }), at(1, 9, {})]);
    const mon9 = slots.find((s) => s.day === 1 && s.hour === 9)!;
    expect(mon9.samples).toBe(1);
    expect(mon9.averageScore).toBe(100);
  });

  it('ignores an unparseable timestamp', () => {
    expect(scoreSlots([{ timestamp: 'nope', metrics: { reach: 10 } }])).toEqual([]);
  });
});

describe('bestSlots', () => {
  it('refuses to recommend a slot with too little evidence', () => {
    // One spectacular post is not a pattern.
    expect(bestSlots([at(3, 20, { reach: 100000 })])).toEqual([]);
  });

  it('recommends once there is enough evidence, best first', () => {
    const posts = [
      ...Array.from({ length: MIN_SAMPLES }, () => at(1, 9, { reach: 100 })),
      ...Array.from({ length: MIN_SAMPLES }, () => at(4, 19, { reach: 900 })),
    ];
    const out = bestSlots(posts);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ day: 4, hour: 19, averageScore: 900 });
    expect(out[1]).toMatchObject({ day: 1, hour: 9 });
  });

  it('caps how many it returns', () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      Array.from({ length: MIN_SAMPLES }, () => at(i % 7, i, { reach: 10 * i }))
    ).flat();
    expect(bestSlots(posts, 3)).toHaveLength(3);
  });

  it('is safe on empty input', () => {
    expect(bestSlots([])).toEqual([]);
    expect(bestSlots(undefined as any)).toEqual([]);
  });
});

describe('confidence', () => {
  it('reports how much evidence there actually is', () => {
    const posts = Array.from({ length: MIN_SAMPLES }, () => at(1, 9, { reach: 10 }));
    expect(confidence(posts)).toEqual({
      scored: MIN_SAMPLES,
      slotsWithEnough: 1,
      enough: true,
    });
  });

  it('says plainly when there is not enough', () => {
    expect(confidence([at(1, 9, { reach: 10 })]).enough).toBe(false);
  });
});
