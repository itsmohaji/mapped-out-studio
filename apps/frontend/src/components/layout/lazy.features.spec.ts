/**
 * Guards for features that must load only when opened (performance baseline
 * 2026-09-19): the composer was bundled into the Calendar, the media library
 * into every page via the layout, and Farcaster into the Calendar and login.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const files = execSync('git ls-files apps/frontend/src; git ls-files --others --exclude-standard apps/frontend/src', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.spec\.tsx?$/.test(f));
const src = (f: string) => readFileSync(f, 'utf8');
/** Files with a STATIC value import of `mod` (type-only imports are erased). */
const importers = (mod: string) =>
  files.filter((f) =>
    [...src(f).matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm)].some((m) => m[1] === mod)
  );

describe('expensive features load on demand', () => {
  it('only the lazy wrapper imports the composer directly', () => {
    expect(importers('@gitroom/frontend/components/new-launch/add.edit.modal')).toEqual([]);
  });

  it('the site layout does not import the media library', () => {
    expect(src('apps/frontend/src/components/new-layout/layout.component.tsx')).not.toContain(
      "components/media/media.component'"
    );
  });
});

  it('Farcaster / Neynar is never imported statically outside its own modules', () => {
    const own = /(wrapcaster\.provider|farcaster\.provider|nayner\.auth\.button)\.tsx$/;
    const offenders = files.filter((f) => !own.test(f) && /from\s+['"]@neynar\//.test(src(f)));
    expect(offenders).toEqual([]);
    // Farcaster's own modules may import each other: they all sit inside the lazy chunk.
    const outside = (list: string[]) => list.filter((f) => !own.test(f));
    expect(outside(importers('@gitroom/frontend/components/launches/web3/providers/wrapcaster.provider'))).toEqual([]);
    expect(outside(importers('@gitroom/frontend/components/auth/providers/farcaster.provider'))).toEqual([]);
  });
