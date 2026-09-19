/**
 * Guard: third-party SDKs must not be imported statically by client code.
 *
 * Any static import puts the package into every page that reaches the module.
 * On 2026-09-19 Sentry (~570 KB), PostHog (~180 KB) and Stripe.js (plus its
 * tracking iframe) were shipped to every page while none was configured in
 * production. They now load only when configured; this keeps it that way.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOTS = ['apps/frontend/src', 'libraries/react-shared-libraries/src', 'libraries/helpers/src'];
const files = execSync(`git ls-files ${ROOTS.join(' ')}`, { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.spec\.tsx?$/.test(f));

const staticImports = (pkg: RegExp) =>
  files.filter((f) => {
    const src = readFileSync(f, 'utf8');
    return [...src.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm)].some((m) => pkg.test(m[1]));
  });

describe('no eagerly loaded third-party SDKs in client code', () => {
  it('Sentry is imported statically only by its lazily-loaded initialisers', () => {
    expect(staticImports(/^@sentry\//).filter((f) => !/sentry\/initialize\.sentry\./.test(f))).toEqual([]);
  });

  it('PostHog is never imported statically', () => {
    expect(staticImports(/^posthog-js/)).toEqual([]);
  });

  it('Stripe.js is only imported through its side-effect-free entry', () => {
    // `import type` is allowed (erased); the default entry injects Stripe.js on import.
    expect(staticImports(/^@stripe\/stripe-js$/)).toEqual([]);
  });
});
