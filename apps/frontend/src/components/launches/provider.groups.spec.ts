import { buildProviderGroups } from '@gitroom/frontend/components/launches/provider.groups';
import { SUPPORTED_SOCIAL_PROVIDERS } from '@gitroom/nestjs-libraries/integrations/supported.providers';

const api = (...ids: string[]) => ids.map((identifier) => ({ identifier, name: identifier }));
const all = api(...SUPPORTED_SOCIAL_PROVIDERS, 'reddit', 'telegram', 'bluesky');

describe('buildProviderGroups', () => {
  it('shows one card per platform, in the supported-list order', () => {
    expect(buildProviderGroups(all).map((g) => g.label)).toEqual([
      'X', 'LinkedIn', 'Instagram', 'Facebook', 'Threads', 'YouTube', 'TikTok', 'Pinterest', 'WordPress',
    ]);
  });

  it('asks for an account type only where the platform has more than one', () => {
    const multi = buildProviderGroups(all).filter((g) => g.options.length > 1).map((g) => g.label);
    expect(multi).toEqual(['LinkedIn', 'Instagram']);
  });

  it('offers the two Instagram routes with labels matching what each provider needs', () => {
    const ig = buildProviderGroups(all).find((g) => g.key === 'instagram')!;
    expect(ig.options.map((o) => [o.identifier, o.label])).toEqual([
      ['instagram-standalone', 'Instagram account'],
      ['instagram', 'Instagram Business via Facebook'],
    ]);
    expect(ig.options[0].description).toContain('Business or Creator');
    expect(ig.options[0].description).toContain('no Facebook Page needed');
    expect(ig.options[1].description).toContain('connected to a Facebook Page');
  });

  it('labels LinkedIn by who the post comes from', () => {
    const li = buildProviderGroups(all).find((g) => g.key === 'linkedin')!;
    expect(li.options.map((o) => o.label)).toEqual(['Personal profile', 'Company Page']);
  });

  it('never offers an unsupported platform', () => {
    const offered = buildProviderGroups(all).flatMap((g) => g.options.map((o) => o.identifier));
    expect(offered).not.toContain('reddit');
    expect(offered).not.toContain('telegram');
    expect(offered).not.toContain('bluesky');
    expect(offered.sort()).toEqual([...SUPPORTED_SOCIAL_PROVIDERS].sort());
  });

  it('drops what the API does not offer, and the group with it', () => {
    const groups = buildProviderGroups(api('instagram-standalone', 'x'));
    expect(groups.map((g) => g.label)).toEqual(['X', 'Instagram']);
    expect(groups.find((g) => g.key === 'instagram')!.options).toHaveLength(1);
  });

  it('honours the caller filter (the invite flow excludes WordPress, which needs a custom-fields form)', () => {
    const social = [
      { identifier: 'x', name: 'X' },
      { identifier: 'wordpress', name: 'WordPress', customFields: [{ key: 'domain' }] },
    ];
    const groups = buildProviderGroups(social, (p: any) => !p.customFields);
    expect(groups.map((g) => g.label)).toEqual(['X']);
  });

  it('shows a supported provider that nobody grouped yet, rather than hiding it', () => {
    const groups = buildProviderGroups(api('x', 'threads'));
    expect(groups.map((g) => g.key)).toContain('threads');
  });
});
