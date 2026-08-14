import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `/enterprise/*` must stay unmounted.
 *
 * Its routes authenticate on nothing but a JWT signed with the shared
 * `JWT_SECRET` — no session, no org membership — and the payload names its own
 * organisation by `apiKey`. `/enterprise/delete-channel` then deletes that
 * channel and every post on it.
 *
 * Re-registering the controller is one word in a list, easy to do while merging
 * upstream and impossible to see in a diff review of an unrelated change. This
 * fails the build if it comes back.
 */
describe('EnterpriseController', () => {
  const moduleSource = readFileSync(
    join(__dirname, 'api.module.ts'),
    'utf8'
  );

  /** Comments explaining the rule are not the rule being broken. */
  const code = moduleSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('is not in the controllers array', () => {
    expect(code).not.toContain('EnterpriseController');
  });

  it('is not imported', () => {
    expect(code).not.toMatch(/import\s+\{[^}]*EnterpriseController/);
  });
});
