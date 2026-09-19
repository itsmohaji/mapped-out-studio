/**
 * Guard for the Dashboard's duplicate requests (performance baseline 2026-09-19):
 * it fetched /integrations/list and the published posts list twice per load,
 * because a second component registered its own fetch under a different key.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const files = execSync('git ls-files apps/frontend/src', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.spec\.tsx?$/.test(f));
const src = (f: string) => readFileSync(f, 'utf8');

describe('dashboard requests', () => {
  it('only the shared hook registers SWR keys for the posts list', () => {
    const offenders = files.filter(
      (f) => !f.endsWith('dashboard/use.posts.list.ts') && /useSWR\(\s*['"`]\/posts\/list\?state=/.test(src(f))
    );
    expect(offenders).toEqual([]);
  });

  it('the Audience panel uses the shared channel list instead of fetching it again', () => {
    const s = src('apps/frontend/src/components/dashboard/audience.performance.tsx');
    expect(s).toContain('useIntegrationList()');
    expect(s).not.toMatch(/fetch\(\s*['"`]\/integrations\/list/);
  });

  it('task reminders share the Tasks page cache key', () => {
    expect(src('apps/frontend/src/components/tasks/use-task-reminders.ts')).toMatch(/useSWR<TaskRow\[\]>\(\s*'\/tasks'/);
  });
});
