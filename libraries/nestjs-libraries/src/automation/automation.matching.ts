/**
 * Text normalisation and condition evaluation. Pure — no I/O, no clock of its
 * own (the caller passes `now`), so every rule here is unit-testable.
 *
 * This is where "Comment YES" is actually decided, and real comments are messy:
 * "YES", "yes!!", "Yes 🙌", " yes ", "Yés". All of those are a yes. "yesterday"
 * is not, and getting that wrong means DMing everyone who mentions their week.
 */

import { Condition, EvalContext } from './automation.types';

/**
 * Fold a comment down to comparable words.
 *
 * Order matters: decompose to strip diacritics before lowercasing, turn emoji
 * into separators rather than deleting them (so "yes🙌no" is two words, not
 * "yesno"), then reduce punctuation to spaces and collapse runs.
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[‍️]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Comments are capped at 2200 chars by Instagram, but a webhook is untrusted
 * input and a user-authored regex is a ReDoS vector. Bounding the haystack
 * bounds the blast radius of a catastrophic pattern.
 *
 * ponytail: length cap only. If staff-authored regexes ever become a real
 * problem, move matching to a worker with a hard timeout — don't hand-roll a
 * regex validator.
 */
const MAX_HAYSTACK = 2000;

export function matchesKeyword(
  text: string | null | undefined,
  values: string[],
  mode: 'equals' | 'contains' | 'regex'
): boolean {
  const list = (values || []).filter((v) => typeof v === 'string' && v.trim().length);
  if (!list.length) return false;

  if (mode === 'regex') {
    const raw = (text || '').slice(0, MAX_HAYSTACK);
    return list.some((pattern) => {
      try {
        return new RegExp(pattern, 'iu').test(raw);
      } catch {
        // An invalid pattern must not match everything, and must not throw and
        // take down the event processor.
        return false;
      }
    });
  }

  const haystack = normalizeText((text || '').slice(0, MAX_HAYSTACK));
  if (!haystack) return false;

  return list.some((value) => {
    const needle = normalizeText(value);
    if (!needle) return false;
    if (mode === 'equals') return haystack === needle;
    // Pad both sides so matching is on word boundaries: " yes " is in
    // " yes please " but not in " yesterday ".
    return ` ${haystack} `.includes(` ${needle} `);
  });
}

/**
 * Wall-clock parts for a timezone, without pulling in a date library.
 * Intl is already how the rest of this codebase does timezone work.
 */
function zonedParts(now: Date, timeZone: string): { day: number; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days.indexOf(get('weekday'));
    // Intl renders midnight as "24" in some ICU versions.
    const hour = parseInt(get('hour'), 10) % 24;
    const minute = parseInt(get('minute'), 10);
    if (day < 0 || Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return { day, minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function isWithinBusinessHours(
  now: Date,
  cfg: { timezone: string; days: number[]; start: string; end: string }
): boolean {
  const parts = zonedParts(now, cfg.timezone);
  const start = toMinutes(cfg.start);
  const end = toMinutes(cfg.end);
  if (!parts || start === null || end === null) return false;

  // An overnight range (22:00–06:00) belongs to the day it STARTED on, so
  // Friday 23:00 is inside a Friday shift even though the clock says Saturday
  // by the time it ends.
  if (end <= start) {
    if (parts.minutes >= start) return cfg.days.includes(parts.day);
    if (parts.minutes < end) return cfg.days.includes((parts.day + 6) % 7);
    return false;
  }

  if (!cfg.days.includes(parts.day)) return false;
  return parts.minutes >= start && parts.minutes < end;
}

function evaluateOne(condition: Condition, ctx: EvalContext): boolean {
  switch (condition.kind) {
    case 'keyword':
      return matchesKeyword(ctx.event.text, condition.values, condition.match);

    case 'language': {
      const lang = (ctx.language || '').toLowerCase().split('-')[0];
      if (!lang) return false;
      return condition.values.some((v) => (v || '').toLowerCase().split('-')[0] === lang);
    }

    case 'platform':
      return condition.values.includes(ctx.event.channel);

    case 'campaign':
      return !!ctx.campaignId && condition.campaignIds.includes(ctx.campaignId);

    case 'specific_post': {
      // Match on either identifier: the composer knows our Post.id, while an
      // inbound webhook only carries the platform's media id.
      const ours = ctx.postId;
      const theirs = ctx.event.externalPostId;
      return condition.postIds.some((id) => id === ours || id === theirs);
    }

    case 'business_hours': {
      const inside = isWithinBusinessHours(ctx.now, condition);
      return condition.inside === false ? !inside : inside;
    }

    case 'customer_type': {
      const c = ctx.contact;
      const type = !c || !(c.priorConversations ?? 0)
        ? 'new'
        : c.isLead
        ? 'lead'
        : 'returning';
      // "customer" is only ever true when something upstream tagged them one;
      // we have no billing signal on a social contact and will not invent one.
      const isCustomer = !!c?.tags?.includes('customer');
      return condition.values.some((v) => (v === 'customer' ? isCustomer : v === type));
    }

    case 'tags': {
      const tags = ctx.contact?.tags ?? [];
      const want = condition.values.map((v) => v.toLowerCase());
      const have = tags.map((t) => t.toLowerCase());
      if (condition.mode === 'all') return want.every((t) => have.includes(t));
      if (condition.mode === 'none') return !want.some((t) => have.includes(t));
      return want.some((t) => have.includes(t));
    }

    case 'variable': {
      const bag = { ...(ctx.contact?.fields ?? {}), ...ctx.variables };
      const actual = bag[condition.name];
      switch (condition.op) {
        case 'exists':
          return actual !== undefined && actual !== '';
        case 'not_exists':
          return actual === undefined || actual === '';
        case 'eq':
          return normalizeText(actual) === normalizeText(condition.value);
        case 'neq':
          return normalizeText(actual) !== normalizeText(condition.value);
        case 'contains':
          return normalizeText(actual).includes(normalizeText(condition.value));
        case 'gt':
        case 'lt': {
          const a = parseFloat(actual ?? '');
          const b = parseFloat(condition.value ?? '');
          if (Number.isNaN(a) || Number.isNaN(b)) return false;
          return condition.op === 'gt' ? a > b : a < b;
        }
        default:
          return false;
      }
    }

    default:
      // An unknown condition kind must never silently pass. A workflow saved by
      // a newer build than this worker should refuse to fire, not fire blind.
      return false;
  }
}

/** All conditions must hold. An empty list means "no restrictions". */
export function evaluateConditions(conditions: Condition[], ctx: EvalContext): boolean {
  if (!conditions?.length) return true;
  return conditions.every((c) => evaluateOne(c, ctx));
}

/**
 * Interpolate {{variable}} placeholders.
 *
 * An unknown placeholder collapses to an empty string rather than leaking
 * "{{first_name}}" into a customer-facing DM.
 */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  if (!body) return '';
  return body
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name: string) => vars?.[name] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
