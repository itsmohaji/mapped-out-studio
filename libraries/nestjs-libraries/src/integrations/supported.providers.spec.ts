/**
 * Owner decision 2026-09-20: only these 11 channels are a supported product.
 * Hiding must not touch channels that are already connected.
 */
import {
  SUPPORTED_SOCIAL_PROVIDERS,
  isSupportedProvider,
} from '@gitroom/nestjs-libraries/integrations/supported.providers';

describe('supported providers', () => {
  it('is exactly the agreed set', () => {
    expect([...SUPPORTED_SOCIAL_PROVIDERS].sort()).toEqual(
      [
        'facebook',
        'instagram',
        'instagram-standalone',
        'linkedin',
        'linkedin-page',
        'pinterest',
        'threads',
        'tiktok',
        'wordpress',
        'x',
        'youtube',
      ].sort()
    );
  });

  it.each(['reddit', 'telegram', 'gmb', 'bluesky', 'mastodon', 'medium', 'skool', 'listmonk', 'mewe', 'vk', 'discord', 'slack', 'nostr', 'farcaster', 'whop', 'moltbook', 'lemmy', 'kick', 'twitch', 'dribbble', 'hashnode', 'dev-to'])(
    'refuses %s',
    (id) => expect(isSupportedProvider(id)).toBe(false)
  );
});
