import {
  CAPABILITIES,
  assistantCapabilities,
  capabilitySpec,
  outputContract,
  parseStructured,
} from './ai.capabilities';
import { SKILL_INSTRUCTIONS } from './ai.skills';

const spec = (key: string) => capabilitySpec(key)!;

describe('the capability registry', () => {
  it('covers every card in the product brief', () => {
    const keys = CAPABILITIES.map((c) => c.key);
    for (const k of [
      'analyze_account',
      'write_captions',
      'monthly_plan',
      'campaign_strategy',
      'content_ideas',
      'target_audience',
      'recommend_budget',
      'performance_recos',
    ]) {
      expect(keys).toContain(k);
    }
  });

  it('every capability points at skills that actually exist', () => {
    // A capability naming a skill that was never written would render a card
    // whose button silently does nothing.
    const known = new Set(SKILL_INSTRUCTIONS.map((s) => s.key));
    for (const c of CAPABILITIES) {
      expect(c.skills.length).toBeGreaterThan(0);
      for (const skill of c.skills) {
        expect(known.has(skill)).toBe(true);
      }
    }
  });

  it('every capability is renderable as a card', () => {
    for (const c of CAPABILITIES) {
      expect(c.icon).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.blurb).toBeTruthy();
      expect(c.action).toBeTruthy();
      expect(c.inputHint).toBeTruthy();
      expect(c.sections.length).toBeGreaterThan(0);
    }
  });

  it('section keys are unique within a capability', () => {
    // A duplicate key would silently drop one section at render time.
    for (const c of CAPABILITIES) {
      const keys = c.sections.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('capability keys are unique', () => {
    const keys = CAPABILITIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every brief forbids inventing what it was not given', () => {
    // These four are the ones most likely to fabricate a number: a plan wants
    // dates, a campaign wants an offer, a budget wants money.
    for (const key of [
      'monthly_plan',
      'campaign_strategy',
      'recommend_budget',
      'target_audience',
    ]) {
      expect(spec(key).brief.toLowerCase()).toMatch(
        /never|do not invent|rather than inventing|hypothesis/
      );
    }
  });

  it('the budget brief refuses to invent currency amounts', () => {
    expect(spec('recommend_budget').brief).toMatch(/percentage/i);
    expect(spec('recommend_budget').brief).toMatch(/never invent a currency/i);
  });
});

describe('outputContract', () => {
  it('names every section so the model knows the shape', () => {
    const s = spec('monthly_plan');
    const contract = outputContract(s);
    for (const section of s.sections) {
      expect(contract).toContain(`"${section.key}"`);
    }
  });

  it('forbids markdown and code fences', () => {
    const contract = outputContract(spec('analyze_account'));
    expect(contract).toMatch(/no markdown/i);
    expect(contract).toMatch(/code fence/i);
  });
});

describe('parseStructured', () => {
  const s = spec('analyze_account');

  it('reads a clean JSON answer into sections', () => {
    const out = parseStructured(
      JSON.stringify({
        summary: 'Engagement is up.',
        findings: ['Reach +12%', 'Saves flat'],
        kpis: [{ label: 'Growth score', value: '61/100' }],
      }),
      s
    );
    expect(out.degraded).toBe(false);
    expect(out.sections.map((x) => x.key)).toEqual([
      'summary',
      'findings',
      'kpis',
    ]);
    expect(out.sections[0].text).toBe('Engagement is up.');
    expect(out.sections[1].items).toEqual(['Reach +12%', 'Saves flat']);
    expect(out.sections[2].metrics).toEqual([
      { label: 'Growth score', value: '61/100' },
    ]);
  });

  it('survives a model that fences the JSON', () => {
    const out = parseStructured('```json\n{"summary":"All good"}\n```', s);
    expect(out.degraded).toBe(false);
    expect(out.sections[0].text).toBe('All good');
  });

  it('survives a model that chats before and after the JSON', () => {
    const out = parseStructured(
      'Sure! Here is the analysis:\n{"summary":"All good"}\nHope that helps!',
      s
    );
    expect(out.degraded).toBe(false);
    expect(out.sections[0].text).toBe('All good');
  });

  it('NEVER loses the answer when the reply is not JSON at all', () => {
    // The whole point: a degraded answer beats a blank card, which is
    // indistinguishable from the feature being broken.
    const out = parseStructured('The account is doing fine, honestly.', s);
    expect(out.degraded).toBe(true);
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].text).toContain('doing fine');
  });

  it('falls back when the JSON is valid but has none of our keys', () => {
    const out = parseStructured('{"somethingElse":"hello"}', s);
    expect(out.degraded).toBe(true);
    expect(out.sections[0].text).toContain('somethingElse');
  });

  it('returns no sections for an empty reply rather than throwing', () => {
    expect(parseStructured('', s).sections).toEqual([]);
    expect(parseStructured(null as any, s).sections).toEqual([]);
  });

  it('accepts a list that came back as one newline string', () => {
    const out = parseStructured(
      JSON.stringify({ findings: '- Reach up\n- Saves flat' }),
      s
    );
    expect(out.sections[0].items).toEqual(['Reach up', 'Saves flat']);
  });

  it('accepts a list of objects instead of strings', () => {
    const out = parseStructured(
      JSON.stringify({
        findings: [{ title: 'Reach', text: 'up 12%' }],
      }),
      s
    );
    expect(out.sections[0].items).toEqual(['Reach — up 12%']);
  });

  it('accepts metrics given as a plain object', () => {
    const out = parseStructured(
      JSON.stringify({ kpis: { Reach: '12k', Saves: '340' } }),
      s
    );
    expect(out.sections[0].metrics).toEqual([
      { label: 'Reach', value: '12k' },
      { label: 'Saves', value: '340' },
    ]);
  });

  it('reads a schedule, which the planner depends on', () => {
    const out = parseStructured(
      JSON.stringify({
        schedule: [
          { when: 'Mon 3 Mar', what: 'Instagram Reel — behind the scenes' },
        ],
      }),
      spec('monthly_plan')
    );
    const section = out.sections.find((x) => x.key === 'schedule')!;
    expect(section.schedule).toEqual([
      { when: 'Mon 3 Mar', what: 'Instagram Reel — behind the scenes' },
    ]);
  });

  it('drops an empty section instead of rendering an empty heading', () => {
    const out = parseStructured(
      JSON.stringify({ summary: 'Fine.', problems: [] }),
      s
    );
    expect(out.sections.map((x) => x.key)).toEqual(['summary']);
  });

  it('strips bullet characters the model adds anyway', () => {
    const out = parseStructured(
      JSON.stringify({
        findings: ['• Reach up', '- Saves flat', '* Shares down'],
      }),
      s
    );
    expect(out.sections[0].items).toEqual([
      'Reach up',
      'Saves flat',
      'Shares down',
    ]);
  });
});

describe('capability surface', () => {
  it('keeps caption writing off the assistant page', () => {
    expect(assistantCapabilities().map((c) => c.key)).not.toContain(
      'write_captions'
    );
  });

  it('every capability declares a surface', () => {
    for (const c of CAPABILITIES) {
      expect(['assistant', 'composer']).toContain(c.surface || 'assistant');
    }
  });

  it('returns every capability that is not composer-only', () => {
    const expected = CAPABILITIES.filter((c) => c.surface !== 'composer').map(
      (c) => c.key
    );
    expect(assistantCapabilities().map((c) => c.key)).toEqual(expected);
    expect(expected.length).toBe(CAPABILITIES.length - 1);
  });
});
