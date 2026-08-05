/**
 * AI Orchestra — what a skill is allowed to know, and how it is written down.
 *
 * This is a pure module because it decides two things that must be testable
 * without a database or a provider key: whether there is enough real data to
 * answer at all, and exactly which bytes are handed to a language model.
 *
 * The governing rule, inherited from the rest of this codebase: a figure that a
 * platform did not report is *not measured*. It never becomes a zero, and it is
 * never estimated to fill a gap.
 */

import {
  ChannelBlock,
  MetricItem,
  followerCount,
  formatHeadline,
  isFollowerMetric,
} from './analytics.aggregate';
import { CAPABILITIES } from './ai.capabilities';

export interface BrandBriefLike {
  audience?: string | null;
  tone?: string | null;
  dos?: string | null;
  donts?: string | null;
  products?: string | null;
  notes?: string | null;
}

export interface PastPost {
  platform: string;
  content: string;
  publishedAt?: string | null;
}

export interface ClientContext {
  clientName: string | null;
  timeframeDays: number;
  /** One entry per connected channel, whether or not it reported anything. */
  channels: ChannelBlock[];
  posts: PastPost[];
  brief: BrandBriefLike | null;
}

export interface Coverage {
  channelsConnected: number;
  channelsReporting: number;
  postsSampled: number;
  timeframeDays: number;
  hasBrief: boolean;
}

/**
 * Anything shaped like a credential must never reach a prompt. Checked by key
 * name rather than by value, so an unexpected new field is excluded by default
 * instead of leaking until someone notices.
 */
const SECRET_KEY = /token|secret|password|refresh|apikey|api_key|credential/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key || '');
}

/** Drops secret-shaped keys at any depth. Used on everything before rendering. */
export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redact(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(k)) continue;
      out[k] = redact(v);
    }
    return out as unknown as T;
  }
  return value;
}

const reported = (block: ChannelBlock) =>
  !!(block.data || []).some((m) => m.available !== false && m.data?.length);

export function coverageOf(ctx: ClientContext): Coverage {
  return {
    channelsConnected: ctx.channels.length,
    channelsReporting: ctx.channels.filter(reported).length,
    postsSampled: ctx.posts.length,
    timeframeDays: ctx.timeframeDays,
    hasBrief: !!ctx.brief && Object.values(ctx.brief).some(Boolean),
  };
}

/**
 * Capabilities that make claims about performance need something to base them
 * on. Those that write copy degrade instead — they still produce something
 * useful with no analytics, they just say what they were working from.
 *
 * Derived from the registry rather than listed again here. A hand-kept copy had
 * already drifted: `campaign_strategy` and `recommend_budget` are both declared
 * `needsAnalytics` and neither was gated, so both would happily reason about
 * performance for an account with nothing reporting.
 */
const NEEDS_ANALYTICS = new Set(
  CAPABILITIES.filter((c) => c.needsAnalytics).map((c) => c.key)
);

export function hasEnoughData(
  capabilityKey: string,
  coverage: Coverage
): { ok: boolean; message?: string } {
  if (!NEEDS_ANALYTICS.has(capabilityKey)) return { ok: true };
  if (coverage.channelsReporting > 0) return { ok: true };

  return {
    ok: false,
    // Client-safe: names no skill, model, provider or prompt.
    message:
      coverage.channelsConnected === 0
        ? 'Connect a channel first — there is nothing to analyse yet.'
        : 'None of the connected channels are reporting analytics yet, so there is nothing to analyse.',
  };
}

/**
 * Post content is TipTap HTML. The model should read what the audience read, so
 * tags are removed and block boundaries become spaces rather than running two
 * sentences together. Entities are decoded for the handful the editor emits.
 */
export function stripHtml(html: string): string {
  return (html || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/\s*(p|div|li|h[1-6]|blockquote)\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const clean = (s: string, max: number) =>
  (s || '').replace(/\s+/g, ' ').trim().slice(0, max);

function renderBrief(brief: BrandBriefLike | null): string {
  if (!brief) return 'BRAND BRIEF: none on file. Keep guidance generic and say so.';
  const lines = [
    ['Audience', brief.audience],
    ['Tone', brief.tone],
    ['Always', brief.dos],
    ['Never', brief.donts],
    ['Products/services', brief.products],
    ['Notes', brief.notes],
  ]
    .filter(([, v]) => !!(v && String(v).trim()))
    .map(([k, v]) => `- ${k}: ${clean(String(v), 600)}`);

  if (!lines.length)
    return 'BRAND BRIEF: none on file. Keep guidance generic and say so.';
  return ['BRAND BRIEF:', ...lines].join('\n');
}

function renderChannel(block: ChannelBlock): string {
  const name = block.integration?.name || 'Unnamed channel';
  const platform = block.integration?.identifier || 'unknown';
  if (!reported(block)) {
    return `- ${name} (${platform}): not reporting analytics.`;
  }
  const metrics = (block.data || [])
    .filter((m: MetricItem) => m.available !== false && m.data?.length)
    // Followers are rendered below as a level. Left in this list they would be
    // SUMMED into a total that never existed.
    .filter((m: MetricItem) => !isFollowerMetric(m.label))
    .map((m: MetricItem) => {
      const change =
        typeof m.percentageChange === 'number'
          ? ` (change ${m.percentageChange > 0 ? '+' : ''}${m.percentageChange}%)`
          : '';
      return `${m.label}: ${formatHeadline(m)}${change}`;
    });

  const followers = followerCount(block.data);
  if (followers !== null) metrics.push(`followers now ${Math.round(followers)}`);

  // Possible when a platform returns only metrics it marked unavailable.
  if (!metrics.length) return `- ${name} (${platform}): not reporting analytics.`;

  return `- ${name} (${platform}): ${metrics.join('; ')}.`;
}

function renderPosts(posts: PastPost[]): string {
  if (!posts.length)
    return 'RECENT PUBLISHED POSTS: none in this period.';
  const lines = posts
    .slice(0, 20)
    .map(
      (p) =>
        `- [${p.platform}${p.publishedAt ? ' ' + p.publishedAt.slice(0, 10) : ''}] ${clean(
          p.content,
          280
        )}`
    );
  return ['RECENT PUBLISHED POSTS (the account’s own writing):', ...lines].join(
    '\n'
  );
}

export function renderCoverage(c: Coverage): string {
  return [
    `COVERAGE: ${c.channelsConnected} channel(s) connected, ${c.channelsReporting} reporting analytics`,
    `${c.postsSampled} published post(s) sampled over the last ${c.timeframeDays} days`,
    c.hasBrief ? 'brand brief on file' : 'no brand brief on file',
  ].join('; ');
}

/**
 * The DATA block. This is the whole of what a skill sees about a client, so it
 * is assembled in one place and redacted on the way out.
 */
export function renderContext(ctx: ClientContext): string {
  const safe = redact(ctx);
  const coverage = coverageOf(safe);

  return [
    '--- DATA (the only facts you may use) ---',
    `CLIENT: ${safe.clientName || 'not specified'}`,
    renderCoverage(coverage),
    '',
    safe.channels.length
      ? ['CHANNEL PERFORMANCE:', ...safe.channels.map(renderChannel)].join('\n')
      : 'CHANNEL PERFORMANCE: no channels connected.',
    '',
    renderPosts(safe.posts),
    '',
    renderBrief(safe.brief),
    '--- END DATA ---',
  ].join('\n');
}
