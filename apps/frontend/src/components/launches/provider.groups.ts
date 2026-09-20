import { SUPPORTED_SOCIAL_PROVIDERS } from '@gitroom/nestjs-libraries/integrations/supported.providers';

/**
 * Add Channel is grouped by platform: one card per platform, and a choice only
 * where a platform really has more than one kind of account (owner, 2026-09-20).
 * Eleven flat cards — two of them both called "Instagram" — made people pick the
 * wrong one.
 *
 * Every label below describes what the provider can actually do, taken from its
 * scopes:
 *  - instagram-standalone: `instagram_business_*` via Instagram's own login. Needs
 *    a Business or Creator account; no Facebook Page involved.
 *  - instagram: `instagram_basic` + `pages_*` via Facebook login. The Instagram
 *    account must be a Business account connected to a Facebook Page.
 *  - linkedin: `w_member_social` — posts as the person.
 *  - linkedin-page: organization scopes — posts as a company page you administer.
 *  - facebook: `pages_manage_posts` — posts to a Page, chosen after signing in.
 */
export type ProviderOption = {
  identifier: string;
  label: string;
  description?: string;
};

export type ProviderGroup = {
  key: string;
  label: string;
  /** File in /icons/platforms (extension included: YouTube ships as .svg). */
  icon: string;
  options: ProviderOption[];
};

/** Order follows the owner's supported-channel list. */
const GROUPS: ProviderGroup[] = [
  { key: 'x', label: 'X', icon: 'x.png', options: [{ identifier: 'x', label: 'X' }] },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    icon: 'linkedin.png',
    options: [
      {
        identifier: 'linkedin',
        label: 'Personal profile',
        description: 'Post as yourself.',
      },
      {
        identifier: 'linkedin-page',
        label: 'Company Page',
        description: 'Post as a company page you administer.',
      },
    ],
  },
  {
    key: 'instagram',
    label: 'Instagram',
    icon: 'instagram-standalone.png',
    options: [
      {
        identifier: 'instagram-standalone',
        label: 'Instagram account',
        description:
          'Sign in with Instagram. Requires a Business or Creator account — no Facebook Page needed.',
      },
      {
        identifier: 'instagram',
        label: 'Instagram Business via Facebook',
        description:
          'Sign in with Facebook. The Instagram account must be a Business account connected to a Facebook Page.',
      },
    ],
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: 'facebook.png',
    options: [
      {
        identifier: 'facebook',
        label: 'Facebook Page',
        description: 'Post to a Facebook Page you administer. You pick the Page after signing in.',
      },
    ],
  },
  { key: 'threads', label: 'Threads', icon: 'threads.png', options: [{ identifier: 'threads', label: 'Threads' }] },
  { key: 'youtube', label: 'YouTube', icon: 'youtube.svg', options: [{ identifier: 'youtube', label: 'YouTube' }] },
  { key: 'tiktok', label: 'TikTok', icon: 'tiktok.png', options: [{ identifier: 'tiktok', label: 'TikTok' }] },
  { key: 'pinterest', label: 'Pinterest', icon: 'pinterest.png', options: [{ identifier: 'pinterest', label: 'Pinterest' }] },
  { key: 'wordpress', label: 'WordPress', icon: 'wordpress.png', options: [{ identifier: 'wordpress', label: 'WordPress' }] },
];

type ApiProvider = { identifier: string; name?: string };

/**
 * Groups what the API offers. Anything the API does not offer, or that the
 * caller filters out (the invite flow drops providers needing a browser
 * extension, an instance URL or custom fields), disappears — and a group left
 * with no options disappears with it. A supported provider that is not in a
 * group yet still shows, as its own card, so adding one to the backend can
 * never make it silently unreachable.
 */
export const buildProviderGroups = (
  available: ApiProvider[],
  canUse: (provider: ApiProvider) => boolean = () => true
): ProviderGroup[] => {
  const usable = new Map(
    available.filter((p) => canUse(p)).map((p) => [p.identifier, p])
  );

  const groups = GROUPS.map((group) => ({
    ...group,
    options: group.options.filter((o) => usable.has(o.identifier)),
  })).filter((group) => group.options.length > 0);

  const grouped = new Set(GROUPS.flatMap((g) => g.options.map((o) => o.identifier)));
  const ungrouped = (SUPPORTED_SOCIAL_PROVIDERS as readonly string[])
    .filter((id) => !grouped.has(id) && usable.has(id))
    .map((id) => ({
      key: id,
      label: (usable.get(id)!.name || id).replace(/\n/g, ' '),
      icon: `${id}.png`,
      options: [{ identifier: id, label: (usable.get(id)!.name || id).replace(/\n/g, ' ') }],
    }));

  return [...groups, ...ungrouped];
};
