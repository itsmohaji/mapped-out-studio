import { capabilitySpec } from './ai.capabilities';
import {
  ENABLED_CAPABILITIES,
  SHARED_RULES,
  SKILL_INSTRUCTIONS,
  instructionFor,
  isStub,
} from './ai.skills';

describe('skill instructions', () => {
  it('covers all seven internal specialists', () => {
    expect(SKILL_INSTRUCTIONS.map((s) => s.key).sort()).toEqual(
      [
        'analyst',
        'art_director',
        'copywriter',
        'creative_director',
        'final_reviewer',
        'performance_analyst',
        'strategist',
      ].sort()
    );
  });

  it('none of them is still a stub', () => {
    for (const s of SKILL_INSTRUCTIONS) {
      expect(isStub(s.instruction)).toBe(false);
      expect(s.instruction.length).toBeGreaterThan(200);
    }
  });

  it('every instruction carries the shared rules', () => {
    for (const s of SKILL_INSTRUCTIONS) {
      expect(s.instruction).toContain(SHARED_RULES);
    }
  });

  it('recognises the placeholders the foundation shipped with', () => {
    expect(
      isStub('You are the Copywriter. (Stub instruction — pending prompt engineering.)')
    ).toBe(true);
    expect(isStub('')).toBe(false);
    expect(isStub(null)).toBe(false);
  });
});

describe('the no-invented-numbers rule', () => {
  it('is stated in every instruction, not just the analytical ones', () => {
    // A copywriter citing a made-up follower count is as damaging as an
    // analyst doing it.
    for (const s of SKILL_INSTRUCTIONS) {
      expect(s.instruction).toMatch(/DATA block/);
      expect(s.instruction).toMatch(/never estimate|Never estimate/i);
    }
  });

  it('tells the model that "not measured" is an acceptable answer', () => {
    expect(SHARED_RULES).toMatch(/not measured/i);
  });

  it('forbids claiming anything was scheduled or published', () => {
    expect(SHARED_RULES).toMatch(/scheduled/i);
    expect(SHARED_RULES).toMatch(/published/i);
    expect(SHARED_RULES).toMatch(/DRAFT/);
  });

  it('forbids the model naming its own role or the model itself', () => {
    expect(SHARED_RULES).toMatch(/Never mention your own role/i);
  });

  it('resists an instruction-override attempt in user input', () => {
    expect(SHARED_RULES).toMatch(/override anything else/i);
  });
});

describe('enabled capabilities', () => {
  it('every enabled capability has a real brief and output shape', () => {
    // The invariant, rather than a snapshot of the list: a capability may only
    // be switched on once it knows what it is producing. Before the registry,
    // "monthly plan" and "campaign strategy" both ran the generic strategist
    // and returned the same shapeless essay, which is why they stayed off.
    for (const key of Object.keys(ENABLED_CAPABILITIES)) {
      const spec = capabilitySpec(key);
      expect({ key, hasSpec: !!spec }).toEqual({ key, hasSpec: true });
      expect(spec!.brief.length).toBeGreaterThan(80);
      expect(spec!.sections.length).toBeGreaterThan(1);
    }
  });

  it('keeps image generation OFF until there is an image provider', () => {
    // A beautiful card whose button refuses is worse than a card that says it
    // is coming. Nano Banana is registered but reports itself unavailable.
    expect(ENABLED_CAPABILITIES.generate_images).toBeUndefined();
  });

  it('the capability pipelines agree with the registry', () => {
    // Two lists that must not drift: the registry draws the card, this decides
    // what actually runs.
    for (const [key, pipeline] of Object.entries(ENABLED_CAPABILITIES)) {
      expect({ key, skills: pipeline }).toEqual({
        key,
        skills: capabilitySpec(key)!.skills,
      });
    }
  });

  it('every skill an enabled capability uses has a real instruction', () => {
    // The guard that matters: a capability can never go live pointing at a stub.
    for (const [capability, pipeline] of Object.entries(ENABLED_CAPABILITIES)) {
      expect(pipeline.length).toBeGreaterThan(0);
      for (const skill of pipeline) {
        const instruction = instructionFor(skill);
        // Named in the assertion value so a failure says which pair broke.
        expect({ capability, skill, hasInstruction: !!instruction }).toEqual({
          capability,
          skill,
          hasInstruction: true,
        });
        expect(isStub(instruction)).toBe(false);
      }
    }
  });

  it('routes both writing capabilities through a reviewer or a second pass', () => {
    expect(ENABLED_CAPABILITIES.write_captions).toContain('final_reviewer');
    expect(ENABLED_CAPABILITIES.performance_recos).toContain('final_reviewer');
  });

  it('gives the reviewer the corrected draft as its whole output', () => {
    // If the reviewer returns a critique, the operator gets a critique instead
    // of a caption — the output of the last skill IS what is shown.
    const reviewer = instructionFor('final_reviewer') || '';
    expect(reviewer).toMatch(/CORRECTED DRAFT ONLY/);
    expect(reviewer).toMatch(/not a critique/i);
  });

  it('holds the copywriter to real per-channel limits', () => {
    const copy = instructionFor('copywriter') || '';
    expect(copy).toContain('280');
    expect(copy).toContain('2200');
    expect(copy).toContain('3000');
  });
});
