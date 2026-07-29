/**
 * Cross-channel analytics aggregation.
 *
 * Every number here comes from what a platform actually returned. Where a
 * platform reports nothing we count the channel as "not reporting" rather than
 * as a zero, because a zero would silently drag an average down and make the
 * dashboard lie.
 */

export interface MetricItem {
  label: string;
  data: Array<{ total: number; date: string }>;
  average?: number;
  percentageChange?: number;
  available?: boolean;
}

export interface ChannelBlock {
  integration: { id: string; name?: string; identifier?: string; disabled?: boolean };
  data: MetricItem[] | null;
}

/**
 * The per-channel headline, identical to render.analytics so a number on the
 * dashboard always matches the same number on the analytics page:
 * sum the series, and divide by the point count when it is an "average" metric.
 */
export function headlineNumber(item: MetricItem): number {
  const sum = (item.data || []).reduce((a, c) => a + Number(c.total || 0), 0);
  return item.average ? sum / (item.data?.length || 1) : sum;
}

export function formatHeadline(item: MetricItem): string {
  const value = headlineNumber(item);
  return item.average
    ? value.toFixed(2) + '%'
    : new Intl.NumberFormat().format(Math.round(value));
}

const matchers = {
  reach: /^(reach|impressions|views)$/i,
  likes: /^(likes|reactions|favorites)$/i,
  comments: /^(comments|replies)$/i,
  shares: /^(shares|retweets|reposts)$/i,
  saves: /^(saves|saved|bookmarks)$/i,
  followers: /follow|subscriber|fan/i,
};

const find = (data: MetricItem[] | null, re: RegExp) =>
  (data || []).find((m) => m.available !== false && re.test((m.label || '').trim()));

/** Latest point, never the sum — a follower count is a level, not a flow. */
export function followerCount(data: MetricItem[] | null): number | null {
  const f = find(data, matchers.followers);
  if (!f || !f.data?.length) return null;
  return Number(f.data[f.data.length - 1].total || 0);
}

export interface Aggregate {
  /** null when NO channel reported this metric — render a dash, not a zero. */
  value: number | null;
  /** How many channels contributed, and how many were eligible at all. */
  reporting: number;
  total: number;
  /** Summed day-by-day series for a sparkline, empty when nothing reported. */
  series: Array<{ total: number; date: string }>;
}

const emptyAggregate = (total: number): Aggregate => ({
  value: null,
  reporting: 0,
  total,
  series: [],
});

/** Sum one metric family across every channel that reports it. */
export function aggregateMetric(
  blocks: ChannelBlock[],
  kind: keyof typeof matchers
): Aggregate {
  const eligible = (blocks || []).filter((b) => !b.integration.disabled);
  const out = emptyAggregate(eligible.length);
  const byDate = new Map<string, number>();

  for (const b of eligible) {
    const metric = find(b.data, matchers[kind]);
    if (!metric || !metric.data?.length) continue;
    out.reporting += 1;
    out.value = (out.value || 0) + headlineNumber(metric);
    for (const point of metric.data) {
      byDate.set(
        point.date,
        (byDate.get(point.date) || 0) + Number(point.total || 0)
      );
    }
  }

  out.series = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, total]) => ({ date, total }));
  return out;
}

/** Engagement = the interaction metrics a platform actually reported. */
export function aggregateEngagement(blocks: ChannelBlock[]): Aggregate {
  const parts = (['likes', 'comments', 'shares', 'saves'] as const).map((k) =>
    aggregateMetric(blocks, k)
  );
  const reporting = Math.max(...parts.map((p) => p.reporting), 0);
  if (!reporting) return emptyAggregate(parts[0]?.total || 0);

  const byDate = new Map<string, number>();
  for (const p of parts) {
    for (const point of p.series) {
      byDate.set(point.date, (byDate.get(point.date) || 0) + point.total);
    }
  }
  return {
    value: parts.reduce((a, p) => a + (p.value || 0), 0),
    reporting,
    total: parts[0].total,
    series: [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([date, total]) => ({ date, total })),
  };
}

export function aggregateFollowers(blocks: ChannelBlock[]): Aggregate {
  const eligible = (blocks || []).filter((b) => !b.integration.disabled);
  const out = emptyAggregate(eligible.length);
  for (const b of eligible) {
    const count = followerCount(b.data);
    if (count === null) continue;
    out.reporting += 1;
    out.value = (out.value || 0) + count;
  }
  return out;
}

/**
 * Period-over-period change, but ONLY when the platform supplied it. We never
 * synthesise a comparison from half a series — that reads as a real trend.
 */
export function reportedChange(
  blocks: ChannelBlock[],
  kind: keyof typeof matchers
): number | null {
  const values: number[] = [];
  for (const b of (blocks || []).filter((x) => !x.integration.disabled)) {
    const metric = find(b.data, matchers[kind]);
    if (metric && typeof metric.percentageChange === 'number') {
      values.push(metric.percentageChange);
    }
  }
  if (!values.length) return null;
  return values.reduce((a, c) => a + c, 0) / values.length;
}

/** day 0..6 (Sun..Sat) x hour 0..23, counted from real publish timestamps. */
export function postingHeatmap(
  posts: Array<{ publishDate: string | Date }>
): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  for (const p of posts || []) {
    const d = new Date(p.publishDate);
    if (Number.isNaN(d.getTime())) continue;
    grid[d.getDay()][d.getHours()] += 1;
  }
  return grid;
}
