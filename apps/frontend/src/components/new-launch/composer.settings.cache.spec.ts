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
});
