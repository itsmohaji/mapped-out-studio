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
const service = readFileSync(
  join(
    root,
    'libraries/nestjs-libraries/src/database/prisma/ai-orchestra/ai.orchestra.service.ts'
  ),
  'utf8'
);
const repository = readFileSync(
  join(
    root,
    'libraries/nestjs-libraries/src/database/prisma/ai-orchestra/ai.orchestra.repository.ts'
  ),
  'utf8'
);

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
    // The success path returns exactly { ok, output }.
    expect(service).toContain('return { ok: true as const, output: carried }');
  });
});
