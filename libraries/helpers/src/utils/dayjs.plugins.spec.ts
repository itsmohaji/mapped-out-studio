import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * A dayjs plugin method that nothing registered is not a degraded feature — it
 * is a hard `TypeError: x.isoWeekday is not a function`, thrown at the moment a
 * user opens the view.
 *
 * `dayjs.extend()` is a global side effect, so whether a method exists depends
 * on whether some OTHER module has been evaluated first. Under Next's code
 * splitting that varies by route, which is what made the calendar crash look
 * random rather than reproducible.
 *
 * So: every plugin method used anywhere in the frontend must be registered by
 * the one setup module. This test fails the build when a new call site starts
 * using a method that is not covered.
 */

const root = join(__dirname, '../../../..');
const frontend = join(root, 'apps/frontend/src');
const SETUP = join(frontend, 'components/layout/dayjs.setup.ts');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * Method (or `startOf` unit) → the plugin that provides it.
 *
 * Only members that do NOT exist on stock dayjs are listed. `format`, `add`,
 * `startOf('day')` and friends need nothing and are deliberately absent.
 */
const NEEDS_PLUGIN: Array<{ pattern: RegExp; plugin: string; label: string }> = [
  { pattern: /\.isSameOrAfter\s*\(/, plugin: 'isSameOrAfter', label: '.isSameOrAfter()' },
  { pattern: /\.isSameOrBefore\s*\(/, plugin: 'isSameOrBefore', label: '.isSameOrBefore()' },
  { pattern: /\.isoWeekday\s*\(/, plugin: 'isoWeek', label: '.isoWeekday()' },
  { pattern: /\.isoWeek\s*\(/, plugin: 'isoWeek', label: '.isoWeek()' },
  { pattern: /['"`]isoWeek['"`]/, plugin: 'isoWeek', label: "startOf('isoWeek')" },
  { pattern: /\.weekOfYear\s*\(|\.week\s*\(/, plugin: 'weekOfYear', label: '.week()' },
  { pattern: /\.fromNow\s*\(|\.toNow\s*\(/, plugin: 'relativeTime', label: '.fromNow()' },
  { pattern: /\.tz\s*\(|\.tz\./, plugin: 'timezone', label: '.tz()' },
  { pattern: /dayjs\.utc\s*\(|\.utc\s*\(/, plugin: 'utc', label: '.utc()' },
  { pattern: /dayjs\.duration\s*\(/, plugin: 'duration', label: 'dayjs.duration()' },
];

describe('dayjs plugin registration', () => {
  const setup = readFileSync(SETUP, 'utf8');

  const files = walk(frontend).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.spec.ts') && f !== SETUP
  );

  it('registers every plugin the frontend actually uses', () => {
    const used = new Set<string>();
    const evidence: Record<string, string> = {};

    for (const file of files) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      // Only files that touch dayjs at all — `.utc(` and `.tz(` are common
      // enough elsewhere to produce noise otherwise.
      if (!/dayjs|newDayjs/.test(code)) continue;

      for (const { pattern, plugin, label } of NEEDS_PLUGIN) {
        if (pattern.test(code)) {
          used.add(plugin);
          evidence[plugin] = evidence[plugin] || `${label} in ${file.slice(frontend.length + 1)}`;
        }
      }
    }

    const missing = [...used]
      .filter((plugin) => !setup.includes(`dayjs/plugin/${plugin}`))
      .map((plugin) => `${plugin} — ${evidence[plugin]}`);

    expect(missing).toEqual([]);
  });

  it('registers utc before timezone, which depends on it', () => {
    const u = setup.indexOf('dayjs.extend(utc)');
    const tz = setup.indexOf('dayjs.extend(timezone)');
    expect(u).toBeGreaterThan(-1);
    expect(tz).toBeGreaterThan(u);
  });

  it('no component registers plugins on its own any more', () => {
    // A local `extend(isoWeek)` is how the old bug hid: the file that called
    // the method and the file that registered it drifted apart. One exception
    // is allowed — `localizedFormat` is a locale concern the calendar owns.
    const rogue = files
      .filter((f) => {
        const code = codeOnly(readFileSync(f, 'utf8'));
        const calls = code.match(/(?:dayjs\.)?extend\(\s*(\w+)\s*\)/g) || [];
        return calls.some((c) => !c.includes('localizedFormat'));
      })
      .map((f) => f.slice(frontend.length + 1));

    expect(rogue).toEqual([]);
  });
});
