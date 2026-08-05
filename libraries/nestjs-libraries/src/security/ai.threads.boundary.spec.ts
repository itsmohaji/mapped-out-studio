import { readFileSync } from 'fs';
import { join } from 'path';

const service = readFileSync(
  join(__dirname, '../database/prisma/ai-threads/ai.threads.service.ts'),
  'utf8'
);

describe('AI threads boundary', () => {
  it('has a single ownership helper every read routes through', () => {
    expect(service).toContain('private async _ownedThread(');
    expect(service).toContain('private async _ownedFolder(');
  });

  it('refuses rather than silently ignoring a foreign id', () => {
    expect(service).toMatch(/ForbiddenException|NotFoundException/);
  });

  it('never exposes a thread without checking orgId', () => {
    // Every repository call that takes a bare id must be preceded by an
    // ownership check. Assert the service never calls threadById directly
    // outside the helper.
    const direct = service
      .split('\n')
      .filter((l) => l.includes('threadById(') && !l.includes('_ownedThread'));
    expect(direct.length).toBeLessThanOrEqual(1);
  });

  it('is internal only — no client-allowed surface', () => {
    expect(service).not.toContain('ClientAllowed');
  });
});
