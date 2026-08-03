/**
 * Router tests. The expensive mistakes here are routing to a provider the owner
 * disabled, spending money somewhere they did not configure, or silently
 * falling back when they explicitly pinned something.
 */

import { AI_PROVIDERS, maskKey, providerMeta } from './ai.providers.registry';
import { ConfiguredProvider, allTasks, routeTask, routingTable } from './ai.router';

const p = (over: Partial<ConfiguredProvider> & { key: string }): ConfiguredProvider => ({
  enabled: true,
  priority: 10,
  hasKey: true,
  health: 'ok',
  models: [],
  ...over,
});

describe('provider registry', () => {
  it('every task-preferred provider actually exists', () => {
    // A typo in a preference list would silently degrade routing forever.
    const keys = new Set(AI_PROVIDERS.map((x) => x.key));
    for (const { task } of allTasks()) {
      const profile = require('./ai.router').taskProfile(task);
      for (const pref of profile.prefer) {
        expect(keys.has(pref)).toBe(true);
      }
    }
  });

  it('every preferred provider can actually do what the task needs', () => {
    for (const { task, needs } of allTasks()) {
      const profile = require('./ai.router').taskProfile(task);
      for (const pref of profile.prefer) {
        expect(providerMeta(pref)!.capabilities).toContain(needs);
      }
    }
  });

  it('masks a key down to four characters', () => {
    expect(maskKey('sk-abcdefghijklmnop')).toBe('••••••••mnop');
    expect(maskKey('ab')).toBe('••••');
    expect(maskKey(null)).toBeNull();
    expect(maskKey('')).toBeNull();
  });

  it('never returns the original secret from the mask', () => {
    const secret = 'sk-supersecretvalue1234';
    expect(maskKey(secret)).not.toContain('supersecret');
  });
});

describe('routeTask', () => {
  it('picks the preferred provider for a task', () => {
    const res = routeTask('caption', [p({ key: 'openai' }), p({ key: 'groq' })]);
    expect(res.provider).toBe('groq');
  });

  it('prefers reasoning providers for strategy', () => {
    const res = routeTask('strategy', [p({ key: 'groq' }), p({ key: 'openai' })]);
    expect(res.provider).toBe('openai');
  });

  it('never routes to a disabled provider', () => {
    const res = routeTask('caption', [p({ key: 'groq', enabled: false }), p({ key: 'openai' })]);
    expect(res.provider).toBe('openai');
  });

  it('never routes to a provider with no key', () => {
    const res = routeTask('caption', [p({ key: 'groq', hasKey: false }), p({ key: 'openai' })]);
    expect(res.provider).toBe('openai');
  });

  it('skips a provider whose last test failed', () => {
    const res = routeTask('caption', [p({ key: 'groq', health: 'error' }), p({ key: 'openai' })]);
    expect(res.provider).toBe('openai');
  });

  it('still uses a provider that has never been tested', () => {
    // 'unknown' means untested, not broken — refusing it would mean nothing
    // works until someone clicks Test.
    const res = routeTask('caption', [p({ key: 'groq', health: 'unknown' })]);
    expect(res.provider).toBe('groq');
  });

  it('never routes an image task to a text-only provider', () => {
    const res = routeTask('image', [p({ key: 'groq' }), p({ key: 'deepseek' })]);
    expect(res.provider).toBeNull();
    expect(res.reason).toMatch(/needs image/i);
  });

  it('routes an image task to a provider that can generate images', () => {
    const res = routeTask('image', [p({ key: 'groq' }), p({ key: 'gemini' })]);
    expect(res.provider).toBe('gemini');
  });

  it('distinguishes "nothing configured" from "nothing capable"', () => {
    expect(routeTask('caption', []).reason).toMatch(/no ai provider is enabled/i);
    expect(routeTask('image', [p({ key: 'groq' })]).reason).toMatch(/needs image/i);
  });

  it('falls back to owner priority when no preference applies', () => {
    const res = routeTask('caption', [
      p({ key: 'kimi', priority: 5 }),
      p({ key: 'glm', priority: 1 }),
    ]);
    expect(res.provider).toBe('glm');
  });

  it('is deterministic when preference and priority both tie', () => {
    const a = routeTask('caption', [p({ key: 'kimi' }), p({ key: 'glm' })]);
    const b = routeTask('caption', [p({ key: 'glm' }), p({ key: 'kimi' })]);
    expect(a.provider).toBe(b.provider);
  });

  it('uses the configured model over the registry default', () => {
    const res = routeTask('caption', [p({ key: 'groq', models: ['my-tuned-model'] })]);
    expect((res as any).model).toBe('my-tuned-model');
  });

  it('falls back to the registry default model', () => {
    const res = routeTask('caption', [p({ key: 'groq' })]);
    expect((res as any).model).toBe(providerMeta('groq')!.defaultModels[0]);
  });

  describe('explicit override', () => {
    it('honours a pinned provider', () => {
      const res = routeTask('caption', [p({ key: 'groq' }), p({ key: 'openai' })], {
        provider: 'openai',
      });
      expect(res.provider).toBe('openai');
    });

    it('FAILS rather than silently falling back when the pin is unusable', () => {
      // Quietly rerouting a pinned provider is how you get a surprise bill from
      // somewhere the caller never asked for.
      const res = routeTask('caption', [p({ key: 'groq', enabled: false }), p({ key: 'openai' })], {
        provider: 'groq',
      });
      expect(res.provider).toBeNull();
      expect(res.reason).toMatch(/disabled/i);
    });

    it('fails when the pinned provider is not configured at all', () => {
      const res = routeTask('caption', [p({ key: 'openai' })], { provider: 'anthropic' });
      expect(res.provider).toBeNull();
      expect(res.reason).toMatch(/not configured/i);
    });

    it('rejects a pin that cannot do the job', () => {
      const res = routeTask('image', [p({ key: 'groq' })], { provider: 'groq' });
      expect(res.provider).toBeNull();
      expect(res.reason).toMatch(/cannot do image/i);
    });
  });
});

describe('routingTable', () => {
  it('resolves every task and always explains itself', () => {
    const table = routingTable([p({ key: 'openai' }), p({ key: 'groq' })]);
    expect(table).toHaveLength(allTasks().length);
    for (const row of table) {
      expect(typeof row.reason).toBe('string');
      expect(row.reason.length).toBeGreaterThan(0);
    }
  });

  it('reports the tasks that cannot run with the current setup', () => {
    const table = routingTable([p({ key: 'groq' })]);
    const image = table.find((r) => r.task === 'image')!;
    expect(image.provider).toBeNull();
    expect(image.reason).toMatch(/image/i);
  });
});
