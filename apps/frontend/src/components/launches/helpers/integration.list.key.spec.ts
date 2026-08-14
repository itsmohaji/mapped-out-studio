import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ONE SWR key, ONE fetcher.
 *
 * SWR keeps a single cache entry per key string and dedupes in-flight requests
 * by key REGARDLESS of which fetcher asked for them. So two components that both
 * call `useSWR('/integrations/list', …)` with different fetchers do not each get
 * their own shape — whichever request happens to fire first wins, and every
 * other component silently renders the other one's shape.
 *
 * That is exactly what broke the Calendar. Dashboard, Clients, Client-dashboard
 * and Accounts each returned the raw `{ integrations: [...] }` envelope while
 * `useIntegrationList` returned a plain array. On a hard refresh of /launches the
 * Calendar's fetcher won and the page was correct; navigate to Dashboard and back
 * and the envelope was in the cache instead. `orderBy()` on that object yields
 * `[[…]]` — ONE item that is itself an array — so the sidebar drew a single
 * nameless channel with a fallback avatar, and the grid drew no time slots at all
 * because `p.time` was undefined. Both halves of the reported symptom.
 *
 * A type cannot catch this: the components were typed correctly and each was
 * internally consistent. Only the shared key is wrong, and it is only visible
 * across files. Hence a source check.
 */

const FRONTEND_SRC = join(__dirname, '..', '..', '..');

/** The only module allowed to register this key. */
const OWNER = 'use.integration.list.tsx';

/**
 * Comments describing the rule are not violations of it — this very file, and
 * the four pages that were fixed, all quote the offending call in prose.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === 'node_modules' ? [] : walk(full);
    }
    return /\.tsx?$/.test(entry) ? [full] : [];
  });

describe('/integrations/list SWR key', () => {
  it('is registered by exactly one module', () => {
    // `useSWR('/integrations/list'` / `useSWR("/integrations/list"`, allowing for
    // the call being wrapped across lines by the formatter.
    const registration = /useSWR(?:<[^>]*>)?\(\s*['"]\/integrations\/list['"]/;

    const offenders = walk(FRONTEND_SRC)
      .filter((file) => !file.endsWith('.spec.ts') && !file.endsWith('.spec.tsx'))
      .filter((file) => registration.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(FRONTEND_SRC.length + 1))
      .filter((file) => !file.endsWith(OWNER));

    expect(offenders).toEqual([]);
  });

  it('still has its owner', () => {
    // Guards the guard: if the hook is renamed or moved, the check above would
    // pass vacuously while every page went back to fetching by hand.
    const owner = walk(FRONTEND_SRC).filter((file) => file.endsWith(OWNER));
    expect(owner).toHaveLength(1);
    expect(readFileSync(owner[0], 'utf8')).toContain("useSWR('/integrations/list'");
  });
});
