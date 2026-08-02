/**
 * Instagram channel adapter — the only file in the automation module that knows
 * Instagram exists.
 *
 * Targets the Instagram API with Instagram Login (`graph.instagram.com`), which
 * is what our `instagram-standalone` provider connects. That API needs no linked
 * Facebook Page, and its messaging endpoints live on graph.instagram.com rather
 * than graph.facebook.com — sending to the wrong host is a silent 400.
 *
 * Verified against Meta documentation on 2026-08-02.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { AutomationEventInput } from '../automation.types';

const GRAPH = 'https://graph.instagram.com';
const VERSION = 'v23.0';

/**
 * Verify X-Hub-Signature-256 against the RAW request body.
 *
 * It must be the raw bytes. Re-serialising the parsed JSON changes key order,
 * whitespace and unicode escaping, so the HMAC will not match and every genuine
 * webhook is rejected — a failure that looks exactly like a wrong secret.
 *
 * Returns false (never throws) on a malformed header, and compares in constant
 * time so the signature cannot be recovered a byte at a time.
 */
export function verifyInstagramSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  appSecret: string | undefined
): boolean {
  if (!rawBody || !signatureHeader || !appSecret) return false;

  const [algo, provided] = signatureHeader.split('=');
  if (algo !== 'sha256' || !provided) return false;

  try {
    const expected = createHmac('sha256', appSecret)
      .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8'))
      .digest('hex');

    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(provided, 'hex');
    // timingSafeEqual throws on a length mismatch, which would itself leak.
    if (a.length !== b.length || a.length === 0) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * The token Meta must echo back during the subscription handshake.
 *
 * An explicit INSTAGRAM_WEBHOOK_VERIFY_TOKEN always wins. Without one it is
 * DERIVED from the app secret, which means the webhook is fully configured the
 * moment Instagram OAuth is — no second secret to generate, paste, forget, or
 * leak, and no way for the two halves to drift out of sync.
 *
 * Derivation is a one-way HMAC over a fixed label, so holding the verify token
 * (which gets pasted into a browser form) reveals nothing about the app secret
 * that signs real payloads.
 */
export function resolveVerifyToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (explicit) return explicit;

  const secret = env.INSTAGRAM_APP_SECRET;
  if (!secret) return null;

  return (
    'mo_ig_' +
    createHmac('sha256', secret).update('instagram-webhook-verify:v1').digest('hex').slice(0, 40)
  );
}

/** Meta's GET handshake when you register the callback URL. */
export function verifyChallenge(
  query: Record<string, any>,
  expectedToken: string | undefined | null
): string | null {
  if (!expectedToken) return null;
  if (query?.['hub.mode'] !== 'subscribe') return null;

  const provided = query?.['hub.verify_token'];
  if (typeof provided !== 'string') return null;

  // Constant-time compare — this is a secret comparison on a public endpoint.
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expectedToken, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const challenge = query?.['hub.challenge'];
  return typeof challenge === 'string' ? challenge : null;
}

/**
 * Flatten an Instagram webhook into canonical events.
 *
 * One delivery can carry several entries, each with several changes, so this
 * always returns an array. Anything unrecognised is skipped rather than throwing
 * — a payload shape we do not handle must not stall the whole delivery.
 */
export function parseInstagramWebhook(payload: any): AutomationEventInput[] {
  const out: AutomationEventInput[] = [];
  if (!payload || payload.object !== 'instagram' || !Array.isArray(payload.entry)) {
    return out;
  }

  for (const entry of payload.entry) {
    const accountId = entry?.id ? String(entry.id) : null;

    for (const change of entry?.changes ?? []) {
      if (change?.field !== 'comments') continue;
      const v = change.value ?? {};
      const id = v.id ?? v.comment_id;
      if (!id) continue;

      // A reply we posted ourselves comes back through the same webhook. Acting
      // on it would let a flow answer its own reply forever.
      if (accountId && String(v.from?.id ?? '') === accountId) continue;

      out.push({
        channel: 'instagram',
        kind: 'comment',
        externalId: String(id),
        accountId,
        fromId: v.from?.id ? String(v.from.id) : null,
        fromHandle: v.from?.username ?? null,
        text: v.text ?? '',
        externalPostId: v.media?.id ? String(v.media.id) : null,
        commentId: String(id),
        // Meta sends seconds; everything downstream works in ms.
        timestamp: entry?.time ? Number(entry.time) * 1000 : Date.now(),
        raw: change,
      });
    }

    for (const m of entry?.messaging ?? []) {
      const mid = m?.message?.mid;
      if (!mid) continue;
      // Echoes are our own outbound messages reflected back.
      if (m?.message?.is_echo) continue;
      if (accountId && String(m?.sender?.id ?? '') === accountId) continue;

      const storyMention = (m.message?.attachments ?? []).some(
        (a: any) => a?.type === 'story_mention'
      );

      out.push({
        channel: 'instagram',
        kind: storyMention ? 'story_mention' : 'message',
        externalId: String(mid),
        accountId,
        fromId: m?.sender?.id ? String(m.sender.id) : null,
        fromHandle: null,
        text: m?.message?.text ?? '',
        externalPostId: null,
        commentId: null,
        timestamp: m?.timestamp ? Number(m.timestamp) : Date.now(),
        raw: m,
      });
    }
  }

  return out;
}

export interface SendResult {
  ok: boolean;
  externalId?: string;
  error?: string;
  /** True when retrying could plausibly succeed (rate limit, transient 5xx). */
  retryable?: boolean;
}

/**
 * Integration tokens are stored as `accessToken___extra` for some providers.
 * Sending the whole string as a bearer produces an opaque OAuth error, so every
 * call site must split first — the rest of the codebase does the same
 * (`instagram.provider.ts` splits on `___` before every Graph call).
 */
export function accessTokenOf(token: string): string {
  return (token || '').split('___')[0];
}

async function graphPost(path: string, token: string, body: any): Promise<SendResult> {
  try {
    const res = await fetch(`${GRAPH}/${VERSION}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessTokenOf(token)}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON error body; the raw text is still reported below */
    }

    if (!res.ok) {
      return {
        ok: false,
        error: json?.error?.message || text || `HTTP ${res.status}`,
        retryable: res.status === 429 || res.status >= 500,
      };
    }

    return { ok: true, externalId: json?.message_id ?? json?.id };
  } catch (e: any) {
    // A network failure is worth retrying; a rejected payload is not.
    return { ok: false, error: e?.message ?? 'network error', retryable: true };
  }
}

/**
 * Private reply: DM the author of a comment.
 *
 * One per comment, ever, within 7 days — the caller must check
 * `canPrivateReply` first. This function does not re-check, because the caller
 * holds the state (how many were already sent) that the decision needs.
 */
export function sendPrivateReply(
  igUserId: string,
  token: string,
  commentId: string,
  text: string
): Promise<SendResult> {
  return graphPost(`${igUserId}/messages`, token, {
    recipient: { comment_id: commentId },
    message: { text },
  });
}

/** Standard DM. Only valid inside the 24-hour messaging window. */
export function sendDirectMessage(
  igUserId: string,
  token: string,
  recipientId: string,
  text: string
): Promise<SendResult> {
  return graphPost(`${igUserId}/messages`, token, {
    recipient: { id: recipientId },
    message: { text },
  });
}

/** Public reply on the comment thread. Needs only the comments scope. */
export function replyToComment(
  commentId: string,
  token: string,
  text: string
): Promise<SendResult> {
  return graphPost(`${commentId}/replies`, token, { message: text });
}

/**
 * Subscribe this account to the webhook fields we need.
 *
 * Per-account, not app-level: connecting a new Instagram account and forgetting
 * this is the single most likely reason a workflow never fires. Meta verifying
 * the callback URL is NOT the same thing as an account being subscribed.
 */
export function subscribeAccount(
  igUserId: string,
  token: string,
  fields: string[]
): Promise<SendResult> {
  return graphPost(
    `${igUserId}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields.join(','))}`,
    token,
    {}
  );
}

async function graphGet(path: string, token: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(
    `${GRAPH}/${VERSION}/${path}${sep}access_token=${encodeURIComponent(accessTokenOf(token))}`
  );
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* fall through — the raw text is surfaced as the error below */
  }
  if (!res.ok) {
    const err = json?.error?.message || text || `HTTP ${res.status}`;
    throw new Error(err);
  }
  return json;
}

export interface InstagramMedia {
  id: string;
  caption: string;
  mediaType: string;
  thumbnail: string | null;
  permalink: string | null;
  timestamp: string | null;
  commentsCount: number | null;
}

/**
 * The account's own media, straight from Instagram.
 *
 * This is what the automation post picker must read. Posts published before the
 * account was connected — or from the Instagram app directly — exist only here;
 * our own Post table knows nothing about them.
 *
 * The id returned IS the media id the comments webhook reports, so a binding
 * made from this list is live immediately instead of waiting for a publish.
 */
export async function fetchInstagramMedia(
  igUserId: string,
  token: string,
  limit = 50
): Promise<InstagramMedia[]> {
  const fields =
    'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count';
  const json = await graphGet(
    `${igUserId}/media?fields=${fields}&limit=${Math.min(Math.max(limit, 1), 100)}`,
    token
  );

  return (json?.data ?? []).map((m: any) => ({
    id: String(m.id),
    caption: m.caption ?? '',
    mediaType: m.media_type ?? 'IMAGE',
    // A video has no usable media_url for a grid; thumbnail_url is the frame.
    thumbnail: m.thumbnail_url || m.media_url || null,
    permalink: m.permalink ?? null,
    timestamp: m.timestamp ?? null,
    commentsCount: typeof m.comments_count === 'number' ? m.comments_count : null,
  }));
}

/** Who the stored token actually belongs to — the token validity check. */
export function fetchInstagramProfile(token: string): Promise<any> {
  return graphGet('me?fields=user_id,username,name,account_type,media_count', token);
}

/** Which webhook fields this account is currently subscribed to. */
export function fetchSubscriptions(igUserId: string, token: string): Promise<any> {
  return graphGet(`${igUserId}/subscribed_apps`, token);
}
