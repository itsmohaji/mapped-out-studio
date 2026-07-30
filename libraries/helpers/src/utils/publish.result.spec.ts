import { isRealPublishId, validatePublishResult } from './publish.result';

describe('is this a real post id', () => {
  it('accepts ids platforms actually return', () => {
    for (const id of [
      '17920238475839201', // instagram media id
      'urn:li:share:7123456789', // linkedin
      '1815432109876543210', // x
      12345,
    ]) {
      expect(isRealPublishId(id)).toBe(true);
    }
  });

  it('rejects a missing id', () => {
    expect(isRealPublishId(undefined)).toBe(false);
    expect(isRealPublishId(null)).toBe(false);
    expect(isRealPublishId('')).toBe(false);
    expect(isRealPublishId('   ')).toBe(false);
  });

  it('rejects an absent value that has been through string interpolation', () => {
    // `${undefined}` is how a missing id reaches a URL and a database column.
    expect(isRealPublishId('undefined')).toBe(false);
    expect(isRealPublishId('null')).toBe(false);
    expect(isRealPublishId('NaN')).toBe(false);
  });

  it('rejects an object, which is what reading .id off an error body gives', () => {
    expect(isRealPublishId({})).toBe(false);
    expect(isRealPublishId({ error: { message: 'Invalid parameter' } })).toBe(
      false
    );
  });
});

describe('validating what a channel returned', () => {
  it('passes a genuine publish', () => {
    expect(
      validatePublishResult({
        postId: '17920238475839201',
        releaseURL: 'https://www.instagram.com/p/abc123/',
      }).ok
    ).toBe(true);
  });

  it('THE BUG: a hollow success is rejected, not written as published', () => {
    // Exactly what instagram.provider.ts produces when media_publish answers
    // 200 with no id: `{ postId: undefined, releaseURL: undefined,
    // status: 'success' }`. Before this guard that became
    // `state: PUBLISHED, releaseURL: undefined` and the customer was told it
    // had gone out.
    const hollow = {
      postId: undefined,
      releaseURL: undefined,
      status: 'success',
    };
    const verdict = validatePublishResult(hollow);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/not published/i);
  });

  it('rejects nothing at all', () => {
    expect(validatePublishResult(undefined).ok).toBe(false);
    expect(validatePublishResult(null).ok).toBe(false);
  });

  it('a missing permalink alone is NOT a failure', () => {
    // Some platforms genuinely return no URL. Failing on that would mark real,
    // successful posts as errors — the opposite mistake, equally damaging.
    expect(
      validatePublishResult({ postId: '123', releaseURL: undefined }).ok
    ).toBe(true);
    expect(validatePublishResult({ postId: '123', releaseURL: '' }).ok).toBe(
      true
    );
  });

  it('explains itself in words an operator can act on', () => {
    const reason = validatePublishResult({ postId: '' }).reason || '';
    expect(reason.length).toBeGreaterThan(20);
    expect(reason).not.toMatch(/undefined|null|TypeError/);
  });
});
