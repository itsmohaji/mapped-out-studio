/**
 * Guards for the composer's settings requests (performance baseline 2026-09-19:
 * 7–8 requests on EVERY composer open, each a ~165 ms round trip).
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const files = execSync('git ls-files apps/frontend/src', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.spec\.tsx?$/.test(f));
const src = (f: string) => readFileSync(f, 'utf8');

/** Every `useSWR('<key>', <fetcher>` registration in the app, as [file, key, fetcher]. */
const registrations = files.flatMap((f) =>
  [...src(f).matchAll(/useSWR(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z_][\w.]*)/g)].map((m) => [f, m[1], m[2]] as const)
);

describe('composer settings caching', () => {
  it('the settings the composer reads use the shared cache policy', () => {
    for (const f of [
      'apps/frontend/src/components/launches/tags.component.tsx',
      'apps/frontend/src/components/settings/shortlink-preference.component.tsx',
      'apps/frontend/src/components/third-parties/third-party.media.tsx',
      'apps/frontend/src/components/new-launch/dbu.association.panel.tsx',
    ]) {
      expect([f, src(f).includes('SETTINGS_SWR')]).toEqual([f, true]);
      expect([f, /revalidateOnMount:\s*true/.test(src(f))]).toEqual([f, false]);
    }
  });

  it('the DBU options are no longer fetched by hand on every mount', () => {
    const s = src('apps/frontend/src/components/new-launch/dbu.association.panel.tsx');
    expect(s).not.toMatch(/getJson\('\/dbu-options\/(enabled|clients)'\)/);
  });

  it('no SWR key is registered in different files with different fetchers', () => {
    // Shared on purpose: the same URL through a plain fetch-and-parse, so every
    // registration stores the same shape.
    const SAME_SHAPE = new Set(['/integrations/customers', 'sets', '/user/self', '/automation', 'integrations']);
    // One cache entry per key: two fetchers returning different shapes means
    // whichever loads first decides what everyone else sees.
    const byKey = new Map<string, Set<string>>();
    for (const [f, key, fetcher] of registrations) {
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key)!.add(`${f}#${fetcher}`);
    }
    const conflicts = [...byKey].filter(([k]) => !SAME_SHAPE.has(k)).filter(([, s]) => new Set([...s].map((x) => x.split('#')[0])).size > 1).map(([k, s]) => `${k}: ${[...s].join(', ')}`);
    expect(conflicts).toEqual([]);
  });
});
