import { z } from 'zod';

/**
 * The read boundary for connected channels.
 *
 * WHY THIS EXISTS. `Integration.postingTimes` is a plain `String` column, and the
 * list endpoint used to do a bare `JSON.parse(p.postingTimes)`. A row holding
 * valid-but-non-array JSON — `'{}'`, `'null'`, `'5'` — parses fine, so the endpoint
 * returned HTTP 200 with a perfectly well-formed `{ integrations: [...] }` envelope
 * in which one item's `time` was not an array. The Calendar then called
 * `p.time.flatMap(...)` and the whole page died with "filter is not a function".
 *
 * An earlier fix guaranteed the OUTER arrays and explicitly declined to check the
 * nested fields, which is exactly why the crash survived it. Guarding the call
 * sites instead would mean scattering `Array.isArray` through the UI forever, and
 * the next component to read `.time` would reintroduce the bug.
 *
 * So the contract is enforced ONCE, here, and both ends use it: the API normalises
 * on the way out, the browser normalises on the way in. The browser half is not
 * redundant — it also covers responses already cached by SWR before a deploy, and
 * any other client of the same API.
 *
 * The rule throughout: a malformed field is REPAIRED, never fatal. One broken
 * channel must not cost the operator the other nine.
 */

/** What the DB default has always been. Used when a schedule is unreadable. */
export const DEFAULT_POSTING_TIMES: PostingTime[] = [
  { time: 120 },
  { time: 400 },
  { time: 700 },
];

const MINUTES_IN_DAY = 24 * 60;

const postingTimeSchema = z.object({
  // Older rows stored the minute offset as a string; coerce rather than discard.
  time: z.coerce.number().int().min(0).max(MINUTES_IN_DAY),
});

/**
 * Declared rather than inferred. `z.coerce` widens the inferred INPUT type, so
 * `z.infer` yields `{ time?: number }`, which is not assignable to the
 * `{ time: number }[]` the UI declares. The parser only ever emits a number.
 */
export type PostingTime = { time: number };

/** Anything that arrives where an array of `{time}` was expected. */
export function parsePostingTimes(raw: unknown): PostingTime[] {
  let value: unknown = raw;

  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      // Truncated or hand-edited JSON. Fall through to the default.
      return [...DEFAULT_POSTING_TIMES];
    }
  }

  if (!Array.isArray(value)) return [...DEFAULT_POSTING_TIMES];

  const kept = value
    .map((entry) => postingTimeSchema.safeParse(entry))
    .filter((r): r is { success: true; data: { time: number } } => r.success)
    .map((r) => r.data);

  // An empty schedule and a corrupt schedule are different things. Returning []
  // here would silently mean "never post", which is worse than the default.
  return kept.length ? kept : [...DEFAULT_POSTING_TIMES];
}

/**
 * `additionalSettings` is also a raw JSON string column. Here an empty result IS
 * meaningful — "no extra settings" is the normal case — so it returns [].
 */
export function parseAdditionalSettings(raw: unknown): unknown[] {
  let value: unknown = raw;

  if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  return Array.isArray(value) ? value : [];
}

/** The editors the UI knows how to render. Anything else falls back to `normal`. */
const EDITORS = ['none', 'normal', 'markdown', 'html'] as const;
export type IntegrationEditor = (typeof EDITORS)[number];

export interface NormalizedIntegration {
  id: string;
  /** The platform's own account id. Sent by the list endpoint; used for refresh URLs. */
  internalId: string;
  name: string;
  identifier: string;
  picture: string;
  display: string;
  type: string;
  editor: IntegrationEditor;
  disabled: boolean;
  inBetweenSteps: boolean;
  refreshNeeded: boolean;
  changeProfilePicture: boolean;
  changeNickName: boolean;
  stripLinks: boolean;
  isCustomFields: boolean;
  customFields?: unknown;
  /**
   * Deliberately a STRING, matching the wire contract and the `Integrations`
   * type the UI declares. Several consumers JSON.parse it. What is guaranteed
   * is that it always parses to an array — never `undefined`, never `'{}'`.
   */
  additionalSettings: string;
  time: PostingTime[];
  customer?: { id: string; name?: string };
  /**
   * True when this channel cannot publish until a human intervenes — expired
   * token or disabled. Surfaced so the UI can mark it for reconnection instead
   * of failing, per the rule that one bad account never breaks the page.
   */
  needsAttention: boolean;
}

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' && v.trim() ? v : fallback;

/**
 * One list item → a usable channel, or `null` when it is beyond repair.
 *
 * Only a missing id is fatal: without it nothing can be selected, filtered or
 * posted to. Everything else has a sane substitute.
 */
export function normalizeIntegration(raw: unknown): NormalizedIntegration | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const id = str(r.id);
  if (!id) return null;

  const customerRaw = r.customer;
  const customer =
    customerRaw && typeof customerRaw === 'object' && !Array.isArray(customerRaw)
      ? (customerRaw as Record<string, unknown>)
      : null;
  const customerId = customer ? str(customer.id) : '';

  const disabled = r.disabled === true;
  const refreshNeeded = r.refreshNeeded === true;

  return {
    id,
    internalId: str(r.internalId),
    name: str(r.name, 'Unnamed channel'),
    identifier: str(r.identifier, 'unknown'),
    picture: str(r.picture, '/no-picture.jpg'),
    display: str(r.display),
    type: str(r.type),
    editor: (EDITORS as readonly string[]).includes(str(r.editor))
      ? (str(r.editor) as IntegrationEditor)
      : 'normal',
    disabled,
    inBetweenSteps: r.inBetweenSteps === true,
    refreshNeeded,
    changeProfilePicture: r.changeProfilePicture === true,
    changeNickName: r.changeNickName === true,
    stripLinks: r.stripLinks === true,
    isCustomFields: r.isCustomFields === true,
    ...(r.customFields !== undefined ? { customFields: r.customFields } : {}),
    // Re-serialised rather than passed through: guarantees the consumers that
    // JSON.parse this always get an array back, without changing the type.
    additionalSettings: JSON.stringify(parseAdditionalSettings(r.additionalSettings)),
    time: parsePostingTimes(r.time),
    ...(customerId
      ? { customer: { id: customerId, name: str(customer!.name) || undefined } }
      : {}),
    needsAttention: disabled || refreshNeeded,
  };
}

/**
 * The ONE way to read `/integrations/list`.
 *
 * Nine components were each doing `(await res.json()).integrations` by hand.
 * A single fix to the shared hook left the other eight untouched, so the same
 * crash stayed reachable from Onboarding, Reports, Plugs, Sets, Teams, Agents,
 * the standalone modal and the provider-continue flow. Duplicated logic is the
 * bug; this is the deduplication.
 */
export async function fetchIntegrationList(
  fetcher: (url: string) => Promise<{ json: () => Promise<unknown> }>,
  path = '/integrations/list'
): Promise<NormalizedIntegration[]> {
  try {
    const body = await (await fetcher(path)).json();
    return normalizeIntegrationList(body).integrations;
  } catch {
    // A network failure or a non-JSON error page must not take a page down.
    return [];
  }
}

export interface NormalizedIntegrationList {
  integrations: NormalizedIntegration[];
  /** Entries too broken to use. Non-zero means log it — it is never expected. */
  dropped: number;
}

/**
 * The whole `/integrations/list` response → something the UI can iterate without
 * checking anything. Accepts the envelope, a bare array, or garbage.
 */
export function normalizeIntegrationList(body: unknown): NormalizedIntegrationList {
  const raw =
    body && typeof body === 'object' && 'integrations' in (body as object)
      ? (body as { integrations: unknown }).integrations
      : null;

  if (!Array.isArray(raw)) return { integrations: [], dropped: 0 };

  const integrations: NormalizedIntegration[] = [];
  let dropped = 0;

  for (const entry of raw) {
    const normalized = normalizeIntegration(entry);
    if (normalized) integrations.push(normalized);
    else dropped++;
  }

  return { integrations, dropped };
}
