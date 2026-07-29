/**
 * Best time to post, derived from YOUR OWN published posts and the engagement
 * the platform reported for each of them.
 *
 * This is deliberately not a generic "best time to post on Instagram" table.
 * Those are marketing folklore. Every number here comes from posts this
 * workspace actually published, and a slot is only ever recommended when there
 * are enough of them to mean anything.
 */

export interface ScoredPost {
  /** When it actually went out. */
  timestamp: string | Date;
  /** Whatever the platform reported. Missing is fine — it just doesn't score. */
  metrics?: Record<string, number> | null;
}

export interface Slot {
  day: number; // 0..6, Sunday first
  hour: number; // 0..23
  samples: number;
  averageScore: number;
}

/** Minimum posts in a slot before we are willing to call it a pattern. */
export const MIN_SAMPLES = 3;

/**
 * One number per post: reach if the platform gave us reach, otherwise the
 * interactions it did report. Returns null when it reported nothing, so a post
 * with no data is EXCLUDED rather than counted as a zero.
 */
export function engagementScore(post: ScoredPost): number | null {
  const m = post.metrics || {};
  const reach = Number(m.reach ?? m.impressions ?? m.views ?? NaN);
  if (Number.isFinite(reach) && reach > 0) return reach;

  const interactions = ['likes', 'comments', 'shares', 'saved', 'saves']
    .map((k) => Number(m[k]))
    .filter((n) => Number.isFinite(n));
  if (!interactions.length) return null;

  const total = interactions.reduce((a, c) => a + c, 0);
  return total > 0 ? total : null;
}

/**
 * Average score per weekday/hour slot, in the VIEWER's local time — the times
 * are only useful if they match the clock the person schedules against.
 */
export function scoreSlots(posts: ScoredPost[]): Slot[] {
  const buckets = new Map<string, { total: number; samples: number }>();

  for (const post of posts || []) {
    const when = new Date(post.timestamp);
    if (Number.isNaN(when.getTime())) continue;
    const score = engagementScore(post);
    if (score === null) continue;

    const key = `${when.getDay()}:${when.getHours()}`;
    const cur = buckets.get(key) || { total: 0, samples: 0 };
    cur.total += score;
    cur.samples += 1;
    buckets.set(key, cur);
  }

  return [...buckets.entries()].map(([key, v]) => {
    const [day, hour] = key.split(':').map(Number);
    return {
      day,
      hour,
      samples: v.samples,
      averageScore: v.total / v.samples,
    };
  });
}

/**
 * The slots worth recommending, best first. Anything under MIN_SAMPLES is
 * dropped — one lucky post is not a pattern, and presenting it as one is how
 * analytics features start lying.
 */
export function bestSlots(posts: ScoredPost[], take = 5): Slot[] {
  return scoreSlots(posts)
    .filter((s) => s.samples >= MIN_SAMPLES)
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, take);
}

/** How much evidence exists, so the UI can say so instead of implying certainty. */
export function confidence(posts: ScoredPost[]): {
  scored: number;
  slotsWithEnough: number;
  enough: boolean;
} {
  const slots = scoreSlots(posts);
  const scored = slots.reduce((a, s) => a + s.samples, 0);
  const slotsWithEnough = slots.filter((s) => s.samples >= MIN_SAMPLES).length;
  return { scored, slotsWithEnough, enough: slotsWithEnough > 0 };
}
