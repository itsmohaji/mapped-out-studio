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

/** Meta's GET handshake when you register the callback URL. */
export function verifyChallenge(
  query: Record<string, any>,
  expectedToken: string | undefined
): string | null {
  if (!expectedToken) return null;
  if (query?.['hub.mode'] !== 'subscribe') return null;
  if (query?.['hub.verify_token'] !== expectedToken) return null;
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

async function graphPost(path: string, token: string, body: any): Promise<SendResult> {
  try {
    const res = await fetch(`${GRAPH}/${VERSION}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
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
 * this is the single most likely reason a workflow never fires.
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
