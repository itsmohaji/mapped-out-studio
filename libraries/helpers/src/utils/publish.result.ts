/**
 * Did the platform actually publish?
 *
 * A post is marked PUBLISHED off the back of whatever a provider returns. Every
 * provider builds that return by reading an `id` out of a JSON response, and
 * none of them check the field was there. When a platform answers 200 with a
 * body that has no id — or the code reads `id` off an error object — the
 * provider still returns `status: 'success'`, the post is written as PUBLISHED
 * with an empty link, the customer is told it went out, and nothing was ever
 * posted.
 *
 * That is the worst failure this system can have: it is silent, and it is a
 * lie. So the id is validated at the point the state is written, which covers
 * every provider at once rather than trusting twenty of them to be careful.
 */

/**
 * Values that reach here as a "post id" when something upstream went missing.
 * `'undefined'` and `'null'` are strings on purpose: an absent value that has
 * been through string interpolation arrives looking like this, and it is
 * exactly as meaningless as the real thing.
 */
const NOT_AN_ID = new Set(['', 'undefined', 'null', 'nan', 'false', '0']);

export function isRealPublishId(postId?: unknown): boolean {
  if (postId === null || postId === undefined) return false;
  if (typeof postId === 'object') return false;
  const s = String(postId).trim();
  if (!s) return false;
  return !NOT_AN_ID.has(s.toLowerCase());
}

export interface PublishResultLike {
  postId?: unknown;
  releaseURL?: unknown;
}

/**
 * A missing releaseURL alone is NOT a failure — several platforms genuinely do
 * not hand back a permalink. A missing post id always is: without it we cannot
 * prove anything was published, and we can never find the post again.
 */
export function validatePublishResult(result?: PublishResultLike | null): {
  ok: boolean;
  reason?: string;
} {
  if (!result) {
    return { ok: false, reason: 'the channel returned no result at all' };
  }
  if (!isRealPublishId(result.postId)) {
    return {
      ok: false,
      reason:
        'the channel accepted the request but returned no post id, so the post was not published',
    };
  }
  return { ok: true };
}
