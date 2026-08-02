/**
 * Ingress tests. This is untrusted input from the public internet, so the
 * signature check and the parser are the two places a mistake is expensive.
 */

import { createHmac } from 'crypto';
import {
  parseInstagramWebhook,
  verifyChallenge,
  verifyInstagramSignature,
} from './instagram.channel';

const SECRET = 'app-secret';
const sign = (body: string, secret = SECRET) =>
  'sha256=' + createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('hex');

describe('verifyInstagramSignature', () => {
  const body = JSON.stringify({ object: 'instagram', entry: [] });

  it('accepts a correctly signed body', () => {
    expect(verifyInstagramSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('accepts the raw body as a Buffer', () => {
    expect(verifyInstagramSignature(Buffer.from(body, 'utf8'), sign(body), SECRET)).toBe(true);
  });

  it('rejects a body signed with a different secret', () => {
    expect(verifyInstagramSignature(body, sign(body, 'wrong'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const good = sign(body);
    expect(verifyInstagramSignature(body + ' ', good, SECRET)).toBe(false);
  });

  it('rejects when anything is missing', () => {
    expect(verifyInstagramSignature(undefined, sign(body), SECRET)).toBe(false);
    expect(verifyInstagramSignature(body, undefined, SECRET)).toBe(false);
    // No configured secret must fail closed, never open.
    expect(verifyInstagramSignature(body, sign(body), undefined)).toBe(false);
    expect(verifyInstagramSignature(body, sign(body), '')).toBe(false);
  });

  it('rejects malformed signature headers without throwing', () => {
    for (const header of ['', 'sha256=', 'nonsense', 'sha1=abcd', 'sha256=zzzz', '=abc']) {
      expect(verifyInstagramSignature(body, header, SECRET)).toBe(false);
    }
  });

  it('rejects a signature of the wrong length', () => {
    expect(verifyInstagramSignature(body, 'sha256=ab', SECRET)).toBe(false);
  });
});

describe('verifyChallenge', () => {
  it('echoes the challenge when the token matches', () => {
    const q = { 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '12345' };
    expect(verifyChallenge(q, 'tok')).toBe('12345');
  });

  it('refuses a wrong token, a wrong mode, or no configured token', () => {
    const base = { 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': 'x' };
    expect(verifyChallenge({ ...base, 'hub.verify_token': 'nope' }, 'tok')).toBeNull();
    expect(verifyChallenge({ ...base, 'hub.mode': 'unsubscribe' }, 'tok')).toBeNull();
    expect(verifyChallenge(base, undefined)).toBeNull();
    expect(verifyChallenge({}, 'tok')).toBeNull();
  });
});

describe('parseInstagramWebhook', () => {
  const commentPayload = {
    object: 'instagram',
    entry: [
      {
        id: 'ig-account-1',
        time: 1_754_000_000,
        changes: [
          {
            field: 'comments',
            value: {
              id: 'comment-1',
              text: 'YES',
              from: { id: 'igsid-9', username: 'aperson' },
              media: { id: 'media-7' },
            },
          },
        ],
      },
    ],
  };

  it('flattens a comment into a canonical event', () => {
    const [e] = parseInstagramWebhook(commentPayload);
    expect(e).toMatchObject({
      channel: 'instagram',
      kind: 'comment',
      externalId: 'comment-1',
      accountId: 'ig-account-1',
      fromId: 'igsid-9',
      fromHandle: 'aperson',
      text: 'YES',
      externalPostId: 'media-7',
      commentId: 'comment-1',
    });
  });

  it('converts Meta seconds into milliseconds', () => {
    const [e] = parseInstagramWebhook(commentPayload);
    expect(e.timestamp).toBe(1_754_000_000_000);
  });

  it('ignores our own comment, so a flow cannot answer itself forever', () => {
    const selfComment = {
      object: 'instagram',
      entry: [
        {
          id: 'ig-account-1',
          time: 1,
          changes: [
            {
              field: 'comments',
              value: { id: 'c', text: 'thanks!', from: { id: 'ig-account-1' } },
            },
          ],
        },
      ],
    };
    expect(parseInstagramWebhook(selfComment)).toHaveLength(0);
  });

  it('parses a direct message', () => {
    const [e] = parseInstagramWebhook({
      object: 'instagram',
      entry: [
        {
          id: 'ig-account-1',
          messaging: [
            {
              sender: { id: 'igsid-9' },
              recipient: { id: 'ig-account-1' },
              timestamp: 1_754_000_000_000,
              message: { mid: 'm1', text: 'hello' },
            },
          ],
        },
      ],
    });
    expect(e).toMatchObject({ kind: 'message', externalId: 'm1', text: 'hello' });
  });

  it('ignores message echoes of our own sends', () => {
    const events = parseInstagramWebhook({
      object: 'instagram',
      entry: [
        {
          id: 'ig-account-1',
          messaging: [
            { sender: { id: 'ig-account-1' }, message: { mid: 'm2', text: 'hi', is_echo: true } },
          ],
        },
      ],
    });
    expect(events).toHaveLength(0);
  });

  it('recognises a story mention', () => {
    const [e] = parseInstagramWebhook({
      object: 'instagram',
      entry: [
        {
          id: 'ig-account-1',
          messaging: [
            {
              sender: { id: 'igsid-9' },
              message: { mid: 'm3', attachments: [{ type: 'story_mention' }] },
            },
          ],
        },
      ],
    });
    expect(e.kind).toBe('story_mention');
  });

  it('returns every event from a batched delivery', () => {
    const batched = {
      object: 'instagram',
      entry: [
        commentPayload.entry[0],
        {
          id: 'ig-account-1',
          time: 2,
          changes: [
            {
              field: 'comments',
              value: { id: 'comment-2', text: 'YES', from: { id: 'igsid-8' } },
            },
          ],
        },
      ],
    };
    expect(parseInstagramWebhook(batched).map((e) => e.externalId)).toEqual([
      'comment-1',
      'comment-2',
    ]);
  });

  it('skips shapes it does not handle instead of throwing', () => {
    expect(parseInstagramWebhook(null)).toEqual([]);
    expect(parseInstagramWebhook({})).toEqual([]);
    expect(parseInstagramWebhook({ object: 'page', entry: [] })).toEqual([]);
    expect(parseInstagramWebhook({ object: 'instagram', entry: 'nope' })).toEqual([]);
    expect(
      parseInstagramWebhook({
        object: 'instagram',
        entry: [{ id: 'a', changes: [{ field: 'story_insights', value: {} }] }],
      })
    ).toEqual([]);
    // A comment with no id cannot be deduped or replied to, so it is dropped.
    expect(
      parseInstagramWebhook({
        object: 'instagram',
        entry: [{ id: 'a', changes: [{ field: 'comments', value: { text: 'hi' } }] }],
      })
    ).toEqual([]);
  });
});
