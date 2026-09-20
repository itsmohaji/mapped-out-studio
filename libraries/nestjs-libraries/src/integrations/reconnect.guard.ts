/**
 * Reconnecting a channel must land on the SAME platform account — otherwise a
 * reconnect would silently point an existing channel at someone else's account.
 *
 * The check itself is right; its message was not. "Please refresh the channel
 * that needs to be refreshed" is what the owner saw while doing exactly that
 * (2026-09-20), because nothing said which account had authorised or which
 * channel was expected. Account ids are shown as the platform shows them; no
 * token ever appears here.
 */
export const reconnectMismatchMessage = (info: {
  channelName?: string;
  provider: string;
  expectedId: string;
  expectedUsername?: string | null;
  actualId: string;
  actualUsername?: string | null;
}) => {
  const who = (username?: string | null, id?: string) =>
    username ? `@${username}` : `account ${id}`;
  const channel = info.channelName ? `"${info.channelName}"` : 'that channel';

  return (
    `You signed in to ${who(info.actualUsername, info.actualId)}, but ${channel} ` +
    `is connected to ${who(info.expectedUsername, info.expectedId)}. ` +
    `Reconnecting only works with the same ${info.provider} account: ` +
    `switch account on ${info.provider} (or sign out there), then press reconnect again. ` +
    `To use ${who(info.actualUsername, info.actualId)} instead, add it as a new channel.`
  );
};

/** True when the account that just authorised is the one the channel expects. */
export const isSameAccount = (expectedId: string, actualId: string) =>
  String(expectedId) === String(actualId);

/**
 * A two-step provider's reconnect (Facebook page, Instagram Business, LinkedIn
 * page, YouTube, GMB): `reConnect` returns the page/company identity and ITS
 * access token, but no refresh token and no lifetime — those belong to the user
 * token from `authenticate`. Keeping them is what makes the NEXT automatic
 * refresh possible; before 2026-09-20 the channel's account id was stored as
 * the refresh token and the lifetime was dropped.
 */
export const mergeReconnectAuth = <
  A extends { accessToken: string; refreshToken?: string; expiresIn?: number },
  N extends { id: string; accessToken: string }
>(
  auth: A,
  reconnected: N
) => ({
  ...auth,
  ...reconnected,
  refreshToken: auth.refreshToken,
  expiresIn: auth.expiresIn,
});
