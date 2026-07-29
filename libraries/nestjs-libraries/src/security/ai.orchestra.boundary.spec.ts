import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * AI Orchestra's hard rule: **AI never publishes.**
 *
 * The flow must stay: AI generation -> internal review -> DBU portal client
 * approval -> scheduling -> publishing.
 *
 * That is enforced structurally, not by convention — the orchestrator has no
 * reference to anything that can post, schedule, or reach an integration token.
 * This test fails the build the moment someone wires one in.
 */
const root = join(__dirname, '../../../..');
const read = (p: string) =>
  readFileSync(join(root, 'libraries/nestjs-libraries/src', p), 'utf8');

const service = read(
  'database/prisma/ai-orchestra/ai.orchestra.service.ts'
);
const repository = read(
  'database/prisma/ai-orchestra/ai.orchestra.repository.ts'
);
const contextService = read(
  'database/prisma/ai-orchestra/ai.context.service.ts'
);
const contextRepository = read(
  'database/prisma/ai-orchestra/ai.context.repository.ts'
);

/**
 * Comments in these files legitimately discuss the very things the code must
 * not do ("never select `token`"), so assertions run against code only.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const FORBIDDEN = [
  'PostsService',
  'PostsRepository',
  'IntegrationService',
  'IntegrationsRepository',
  'posts.service',
  'posts.repository',
  'integration.service',
  'workflow',
  'temporal',
];

describe('AI Orchestra publishing boundary', () => {
  it('the orchestrator cannot reach anything that publishes or schedules', () => {
    for (const token of FORBIDDEN) {
      expect(service.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it('its repository only touches AI tables, never posts or integrations', () => {
    expect(repository).not.toMatch(/PrismaRepository<'post'>/);
    expect(repository).not.toMatch(/PrismaRepository<'integration'>/);
    for (const model of ['aiSkill', 'aiCapability', 'aiRun', 'aiEntitlement']) {
      expect(repository).toContain(model);
    }
  });

  it('refusals are recorded, so "why did nothing happen" is answerable', () => {
    expect(service).toContain("status: 'refused'");
    expect(service).toContain('refusedReason');
  });

  it('a run returns content only — no post id, no schedule', () => {
    // The success path returns the text and a description of the data it was
    // based on. Nothing that could identify or reach a post.
    expect(service).toContain(
      'return { ok: true as const, output: carried, coverage }'
    );
    for (const leak of ['postId', 'post.id', 'integrationId', 'publishDate']) {
      expect(codeOnly(service)).not.toContain(leak);
    }
  });
});

/**
 * Phase 2 added a data path so skills work from real numbers instead of
 * inventing them. Reading must not quietly become a route to writing, so the
 * boundary is EXTENDED here rather than relaxed to accommodate it.
 */
describe('AI Orchestra context layer', () => {
  it('the context path cannot publish or schedule either', () => {
    for (const token of [
      'PostsService',
      'posts.service',
      'PostsRepository',
      'createPost',
      'workflow',
      'temporal',
    ]) {
      expect(codeOnly(contextService).toLowerCase()).not.toContain(
        token.toLowerCase()
      );
    }
  });

  it('borrows exactly one thing from the integration service: analytics', () => {
    // IntegrationService is the codebase's only route to live platform numbers,
    // so the context layer may hold it — but the moment it calls anything other
    // than checkAnalytics, that is a new capability nobody reviewed.
    const calls = (codeOnly(contextService).match(/_integrations\.\w+/g) || [])
      .map((c) => c.replace('_integrations.', ''))
      .filter((v, i, a) => a.indexOf(v) === i);
    expect(calls).toEqual(['checkAnalytics']);
  });

  it('the context repository is strictly read-only', () => {
    const code = codeOnly(contextRepository);
    for (const write of ['.create(', '.update(', '.delete(', '.upsert(', '.createMany(']) {
      expect(code).not.toContain(write);
    }
  });

  it('never selects a credential into a prompt', () => {
    // An Integration row carries token, refreshToken and customInstanceDetails.
    // Explicit selects are what keeps them out; a wildcard include would walk a
    // live credential straight into a language model.
    const code = codeOnly(contextRepository);
    expect(code).not.toMatch(/\btoken\b/i);
    expect(code).not.toMatch(/refreshToken/i);
    expect(code).not.toMatch(/customInstanceDetails/i);
    expect(code).not.toMatch(/integration:\s*true/);
  });

  it('scopes every read to one organisation', () => {
    const code = codeOnly(contextRepository);
    const queries = (code.match(/\.(findMany|findFirst|findUnique)\(/g) || [])
      .length;
    const scoped = (code.match(/\borgId\b|\borganizationId\b/g) || []).length;
    expect(queries).toBeGreaterThan(0);
    // Tenant isolation is a property of the query, not of the caller.
    expect(scoped).toBeGreaterThanOrEqual(queries);
  });

  it('refuses a client id belonging to another organisation', () => {
    // Falling through to the whole workspace would be a cross-tenant leak
    // dressed up as a default.
    expect(service).toContain("refusedReason: 'unknown_customer'");
    expect(codeOnly(contextService)).toMatch(/customer(Id)?,?\s*$|orgId/m);
  });

  it('refuses rather than guessing when there is no data to analyse', () => {
    expect(service).toContain("refusedReason: 'insufficient_data'");
    expect(service).toContain('hasEnoughData');
  });

  it('gives every skill the data, not just the first', () => {
    // Otherwise the Final Reviewer checks a draft against nothing.
    expect(service).toContain('contextBlock');
    expect(service).not.toContain('input: carried,');
  });
});
