/**
 * 2026-09-20: "Could not add provider. Please refresh the channel that needs to
 * be refreshed" — the owner was reconnecting, and nothing told him the wrong
 * account had authorised.
 */
import {
  isSameAccount,
  mergeReconnectAuth,
  reconnectMismatchMessage,
} from '@gitroom/nestjs-libraries/integrations/reconnect.guard';

describe('isSameAccount', () => {
  it('compares ids as strings, so a numeric id from the platform still matches', () => {
    expect(isSameAccount('17841460718490744', '17841460718490744')).toBe(true);
    expect(isSameAccount('17841460718490744', 17841460718490744 as any)).toBe(true);
    expect(isSameAccount('17841460718490744', '17841455124651794')).toBe(false);
  });
});

describe('reconnectMismatchMessage', () => {
  const info = {
    channelName: 'Mapped Out',
    provider: 'Instagram',
    expectedId: '17841460718490744',
    expectedUsername: 'mappedout',
    actualId: '17841455124651794',
    actualUsername: 'dbugroup',
  };

  it('names both accounts, the channel, and what to do about it', () => {
    const m = reconnectMismatchMessage(info);
    expect(m).toContain('@dbugroup');
    expect(m).toContain('"Mapped Out"');
    expect(m).toContain('@mappedout');
    expect(m).toContain('switch account on Instagram');
    expect(m).toContain('add it as a new channel');
  });

  it('falls back to ids when the platform gave no usernames', () => {
    const m = reconnectMismatchMessage({ ...info, actualUsername: null, expectedUsername: null });
    expect(m).toContain('account 17841455124651794');
    expect(m).toContain('account 17841460718490744');
  });

  it('never leaks a token: only what the caller passes appears', () => {
    expect(reconnectMismatchMessage(info)).not.toMatch(/token|Bearer|EAA|IGQ/i);
  });
});

describe('mergeReconnectAuth', () => {
  const auth = {
    id: 'user-1',
    accessToken: 'user-access',
    refreshToken: 'user-refresh',
    expiresIn: 5183944,
    name: 'Mohamed',
  };
  const reconnected = { id: 'page-9', accessToken: 'page-access', name: 'DBU Page' };

  it('keeps the page identity and page token, with the user refresh token and lifetime', () => {
    expect(mergeReconnectAuth(auth, reconnected)).toEqual({
      id: 'page-9',
      accessToken: 'page-access',
      refreshToken: 'user-refresh',
      expiresIn: 5183944,
      name: 'DBU Page',
    });
  });

  it('never stores an account id as the refresh token (the 2026-09-20 bug)', () => {
    const merged = mergeReconnectAuth(auth, reconnected);
    expect(merged.refreshToken).not.toBe('page-9');
    expect(merged.expiresIn).toBeDefined();
  });
});
