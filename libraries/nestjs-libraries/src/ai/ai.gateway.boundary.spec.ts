import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * The router must actually be USED.
 *
 * A router that exists, is tested, and that nothing calls is worse than no
 * router: the settings screen tells the owner routing is configurable while
 * every real call still goes to one hardcoded provider. That is exactly the
 * state this codebase was in, so it is pinned here rather than left to review.
 *
 * Two properties, both statically checkable:
 *   1. Exactly one file talks to an AI provider over the wire.
 *   2. Nothing upstream of it names a provider or a model.
 */

const src = join(__dirname, '../..', 'src');
const GATEWAY = 'ai/ai.gateway.service.ts';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const files = walk(src).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

const rel = (f: string) => f.slice(src.length + 1).replace(/\\/g, '/');

/**
 * Comments legitimately discuss the things the code must not do ("never name a
 * provider"), so every assertion runs against code only.
 */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const read = (f: string) => codeOnly(readFileSync(f, 'utf8'));

describe('AI gateway boundary', () => {
  /**
   * Upstream Postiz features that still hold the single legacy OpenAI key.
   *
   * They predate the router and are NOT covered by it: they do not route, do
   * not meter, and do not spend credits. Listed rather than ignored so the debt
   * is visible and countable — this array may shrink, never grow. A NEW file
   * reaching a provider directly fails the build.
   */
  const LEGACY_DIRECT_CALLERS = [
    'openai/openai.service.ts',
    'openai/ai.keys.service.ts',
    'agent/agent.graph.service.ts',
    'agent/agent.graph.insert.service.ts',
    'database/prisma/autopost/autopost.service.ts',
  ];

  it('nothing new reaches a provider without going through the router', () => {
    // A completion always budgets tokens; a capability probe (the settings
    // page's Test Connection) does not. That is what separates a real spend
    // from a health check without hardcoding either file.
    const isCompletion = (code: string) =>
      code.includes('/chat/completions') ||
      code.includes('chat.completions.create') ||
      code.includes('chat.completions.parse') ||
      code.includes('images.generate') ||
      (code.includes('anthropic-version') && code.includes('max_tokens'));

    const offenders = files
      .filter((f) => isCompletion(read(f)))
      .map(rel)
      .filter((f) => f !== GATEWAY && !LEGACY_DIRECT_CALLERS.includes(f));

    expect(offenders).toEqual([]);
  });

  it('the legacy list is real — every file on it still exists', () => {
    // Otherwise the debt list rots into a lie and stops constraining anything.
    const present = new Set(files.map(rel));
    for (const f of LEGACY_DIRECT_CALLERS) {
      expect(present.has(f)).toBe(true);
    }
  });

  it('AI Orchestra asks for a task and never for a provider', () => {
    const service = read(
      join(src, 'database/prisma/ai-orchestra/ai.orchestra.service.ts')
    );

    // The bug this replaces: `getProvider('openai')`, in three places.
    expect(service).not.toContain('getProvider');
    expect(service).not.toMatch(/provider:\s*'openai'/);
    expect(service).not.toContain('aiKeyStore');

    // And it positively routes.
    expect(service).toContain('taskForSkill');
    expect(service).toContain('_gateway.generate');
  });

  it('the assist surface routes too, and pins nothing', () => {
    const assist = read(join(src, 'database/prisma/ai/ai.assist.service.ts'));
    expect(assist).toContain('_gateway.generate');
    for (const pinned of ['gpt-', 'claude-', 'llama', 'gemini-', 'openai', 'groq']) {
      expect(assist.toLowerCase()).not.toContain(pinned);
    }
  });

  it('every gateway call is metered, including the failures', () => {
    const gateway = read(join(src, GATEWAY));
    // Three outcomes, three meter calls: a refusal, an error and a success all
    // have to be answerable from the run log.
    for (const status of ["status: 'ok'", "status: 'error'", "status: 'refused'"]) {
      expect(gateway).toContain(status);
    }
    expect(gateway).toContain('logRun');
    expect(gateway).toContain('creditsForTask');
  });

  it('credits are charged only for work that succeeded', () => {
    const gateway = read(join(src, GATEWAY));
    // A refused or failed run records itself but must not bill for it.
    expect(gateway).toContain("credits: p.status === 'ok'");
  });

  it('a key never leaves the resolver except into a request header', () => {
    const gateway = read(join(src, GATEWAY));
    // The reason string travels into logs and, indirectly, into a message. A
    // key concatenated into one would end up in the run log forever.
    expect(gateway).not.toMatch(/reason.*apiKey|apiKey.*reason/);
    // It must not be logged directly either.
    expect(gateway).not.toMatch(/logger\.\w+\([^)]*apiKey/);
  });
});
