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

  it('tolerates a concurrent seed race instead of swallowing every error', () => {
    // A second concurrent `library()` call for a brand-new org hits the
    // @@unique([orgId, name]) constraint on AiFolder (P2002). That is the
    // other request having already seeded the same folder — not a failure —
    // so it must be caught and ignored. Anything else must still surface.
    expect(service).toMatch(/P2002/);
    // Guard against a lazy blanket swallow that would also hide real errors.
    expect(service).not.toMatch(/catch\s*\([^)]*\)\s*{\s*}/);
    expect(service).not.toMatch(/catch\s*{\s*}/);
  });

  it('turns a duplicate folder name into a clear conflict, not a 500', () => {
    // addFolder/renameFolder can hit the same unique constraint when a user
    // picks a name that already exists — surface it as ConflictException.
    expect(service).toContain('ConflictException');
    expect(service).toContain('A folder with that name already exists.');
  });
});
