import {
  canRun,
  costMicros,
  creditsForRun,
  planAllows,
  remaining,
  skillPipeline,
  toClientCapability,
  CapabilityLike,
} from './ai.orchestra';

const cap = (over: Partial<CapabilityLike> = {}): CapabilityLike => ({
  key: 'content_ideas',
  name: 'Generate Content Ideas',
  enabled: true,
  minPlan: 'FREE',
  kind: 'text',
  skillKeys: 'strategist,copywriter',
  ...over,
});

const base = {
  orgPlan: 'PRO',
  entitlement: { monthlyCredits: 100, monthlyImages: 10 },
  usage: { creditsUsed: 0, imagesUsed: 0 },
  providerAvailable: true,
};

describe('planAllows', () => {
  it('allows an equal or higher plan', () => {
    expect(planAllows('PRO', 'STANDARD')).toBe(true);
    expect(planAllows('PRO', 'PRO')).toBe(true);
  });

  it('blocks a lower plan', () => {
    expect(planAllows('FREE', 'PRO')).toBe(false);
  });

  it('treats an UNKNOWN plan as the lowest, never the highest', () => {
    // An unrecognised value must not accidentally unlock paid capabilities.
    expect(planAllows('something-new', 'STANDARD')).toBe(false);
    expect(planAllows('something-new', 'FREE')).toBe(true);
  });
});

describe('skillPipeline', () => {
  it('splits and trims the ordered list', () => {
    expect(skillPipeline(cap({ skillKeys: ' a , b ,, c ' }))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('is empty when unconfigured', () => {
    expect(skillPipeline(cap({ skillKeys: '' }))).toEqual([]);
  });
});

describe('canRun', () => {
  it('allows a configured, enabled capability within plan and credits', () => {
    expect(canRun({ ...base, capability: cap() })).toEqual({ allowed: true });
  });

  it('refuses a disabled capability', () => {
    const d = canRun({ ...base, capability: cap({ enabled: false }) });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('capability_disabled');
  });

  it('refuses a capability with no skills wired up', () => {
    const d = canRun({ ...base, capability: cap({ skillKeys: '' }) });
    expect(d.reason).toBe('not_configured');
  });

  it('refuses when the plan is too low', () => {
    const d = canRun({
      ...base,
      orgPlan: 'FREE',
      capability: cap({ minPlan: 'PRO' }),
    });
    expect(d.reason).toBe('plan_too_low');
  });

  it('refuses when the provider is unavailable', () => {
    const d = canRun({ ...base, providerAvailable: false, capability: cap() });
    expect(d.reason).toBe('provider_unavailable');
  });

  it('refuses when text credits are exhausted', () => {
    const d = canRun({
      ...base,
      usage: { creditsUsed: 100, imagesUsed: 0 },
      capability: cap(),
    });
    expect(d.reason).toBe('no_credits');
  });

  it('meters images against their OWN limit, not the text credits', () => {
    const imageCap = cap({ kind: 'image' });
    // Text credits exhausted, image credits free -> an image run is still fine.
    expect(
      canRun({
        ...base,
        usage: { creditsUsed: 999, imagesUsed: 0 },
        capability: imageCap,
      }).allowed
    ).toBe(true);
    // Image credits exhausted -> refused, with the image-specific reason.
    expect(
      canRun({
        ...base,
        usage: { creditsUsed: 0, imagesUsed: 10 },
        capability: imageCap,
      }).reason
    ).toBe('no_image_credits');
  });

  it('never leaks skills, models or providers in a refusal message', () => {
    const messages = [
      canRun({ ...base, capability: cap({ enabled: false }) }),
      canRun({ ...base, orgPlan: 'FREE', capability: cap({ minPlan: 'PRO' }) }),
      canRun({ ...base, providerAvailable: false, capability: cap() }),
    ].map((d) => d.message || '');
    for (const m of messages) {
      expect(m).not.toMatch(/skill|prompt|openai|gpt|provider|model/i);
    }
  });
});

describe('remaining', () => {
  it('never goes negative', () => {
    expect(remaining(10, 25)).toBe(0);
    expect(remaining(10, 4)).toBe(6);
  });
});

describe('costMicros', () => {
  it('computes from the reported token counts', () => {
    // 1000 in + 1000 out on gpt-4o-mini = 150 + 600
    expect(costMicros('gpt-4o-mini', 1000, 1000)).toBe(750);
  });

  it('returns null when the provider reported NO usage', () => {
    expect(costMicros('gpt-4o-mini', null, null)).toBeNull();
  });

  it('returns null for a model with no known rate rather than guessing', () => {
    expect(costMicros('brand-new-model', 1000, 1000)).toBeNull();
  });
});

describe('creditsForRun', () => {
  it('charges at least one credit for any run', () => {
    expect(creditsForRun(0, 0)).toBe(1);
    expect(creditsForRun(10, 5)).toBe(1);
  });

  it('scales with tokens', () => {
    expect(creditsForRun(2000, 1000)).toBe(3);
  });
});

describe('toClientCapability', () => {
  it('exposes no skills, models or providers', () => {
    const out = toClientCapability(cap(), { allowed: true });
    expect(Object.keys(out).sort()).toEqual(
      ['available', 'kind', 'key', 'name', 'unavailableMessage'].sort()
    );
    expect(JSON.stringify(out)).not.toMatch(/skill|copywriter|strategist/i);
  });

  it('carries the client-safe reason when unavailable', () => {
    const out = toClientCapability(cap(), {
      allowed: false,
      reason: 'no_credits',
      message: 'You have used all of this month’s AI credits.',
    });
    expect(out.available).toBe(false);
    expect(out.unavailableMessage).toContain('credits');
  });
});
