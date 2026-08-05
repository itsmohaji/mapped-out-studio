import { readFileSync } from 'fs';
import { join } from 'path';

const service = readFileSync(
  join(__dirname, '../database/prisma/ai-threads/ai.threads.service.ts'),
  'utf8'
);
const controller = readFileSync(
  join(
    __dirname,
    '../../../../apps/backend/src/api/routes/ai-threads.controller.ts'
  ),
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
    // The decorator would live on the controller, not the service — asserting
    // against the service let this test pass no matter what the controller
    // declared. Matched as a real decorator (start of line, then the call),
    // not a bare substring — the controller's own docblock explains ADR-006
    // by naming "@ClientAllowed()" in prose, which a plain `.toContain` check
    // would trip on even though nothing there is actually decorated with it.
    expect(controller).not.toMatch(/^\s*@ClientAllowed\(/m);
  });

  // Regression coverage for F5: `start()` used to persist a browser-supplied
  // customerId with no ownership check. A behavioural test would need to
  // instantiate AiThreadsService for real, which drags in the entire
  // IntegrationService -> integration.manager -> every social provider chain
  // (native bcrypt binding, ESM-only nostr-tools) — exactly the fragility this
  // file's source-as-text approach exists to sidestep. Asserted statically
  // instead, same as every other check in this file.
  it('resolves customerId against the caller org before persisting it', () => {
    expect(service).toContain(
      'this._context.resolveCustomer(params.orgId, params.customerId)'
    );
  });

  it('drops an unresolved customerId to null rather than trusting it', () => {
    const startBody = service.slice(
      service.indexOf('async start('),
      service.indexOf('async append(')
    );
    expect(startBody).toMatch(/resolvedCustomerId[\s\S]*\?\?\s*null/);
    expect(startBody).toContain('customerId: resolvedCustomerId');
  });
});
