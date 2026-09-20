/**
 * Owner decision 2026-09-20: only these 11 channels are a supported product.
 * Hiding must not touch channels that are already connected.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SUPPORTED_SOCIAL_PROVIDERS,
  UNSUPPORTED_PROVIDER_MESSAGE,
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

describe('refusing an unsupported provider', () => {
  // Every entry point that gates on the allow-list. A bare `throw new Error`
  // here becomes HTTP 500 "Internal server error", which reads as a broken
  // server rather than a product limit (owner, 2026-09-20).
  const ENTRY_POINTS = [
    'apps/backend/src/api/routes/integrations.controller.ts',
    'apps/backend/src/api/routes/no.auth.integrations.controller.ts',
    'apps/backend/src/api/routes/enterprise.controller.ts',
    'apps/backend/src/public-api/routes/v1/public.integrations.controller.ts',
  ];
  const source = (f: string) => readFileSync(join(__dirname, '../../../..', f), 'utf8');

  it('says so plainly', () => {
    expect(UNSUPPORTED_PROVIDER_MESSAGE).toBe('This provider is not supported in Mapped Out.');
  });

  it.each(ENTRY_POINTS)('%s answers 4xx with that message, never a bare Error', (file) => {
    const s = source(file);
    expect(s).toContain('getAllowedSocialsIntegrations');
    expect(s).toContain('UNSUPPORTED_PROVIDER_MESSAGE');
    expect(s).not.toContain("throw new Error('Integration not allowed')");
    expect(s).toMatch(/BadRequestException\(UNSUPPORTED_PROVIDER_MESSAGE\)|HttpException\(\{ msg: UNSUPPORTED_PROVIDER_MESSAGE \}, 400\)/);
  });
});
