/**
 * Block ⇄ node translation.
 *
 * The contract is round-tripping: whatever the builder saves must reopen as the
 * same cards. A break here silently shreds someone's workflow on the next save,
 * which is the worst possible failure for an editor.
 */

import {
  Block,
  collapseNodes,
  expandBlocks,
  renderButtons,
  splitButtons,
} from './automation.blockgraph';
import { BLOCKS, QUESTION_TEMPLATES, BUTTON_TEMPLATES } from './automation.blocks';

describe('renderButtons / splitButtons', () => {
  it('renders buttons as a numbered list', () => {
    expect(renderButtons('Pick one', ['A', 'B'])).toBe('Pick one\n\n1. A\n2. B');
  });

  it('leaves the message alone when there are no buttons', () => {
    expect(renderButtons('Hello', [])).toBe('Hello');
    expect(renderButtons('Hello', undefined)).toBe('Hello');
  });

  it('drops blank buttons rather than rendering empty options', () => {
    expect(renderButtons('Pick', ['A', '  ', 'B'])).toBe('Pick\n\n1. A\n2. B');
  });

  it('round-trips', () => {
    const body = renderButtons('What is your budget?', ['Under 500', '500–1000', '1000+']);
    const back = splitButtons(body);
    expect(back.text).toBe('What is your budget?');
    expect(back.buttons).toEqual(['Under 500', '500–1000', '1000+']);
  });

  it('does not mistake prose for buttons', () => {
    // A single numbered line is almost always a sentence, not a button set.
    const { text, buttons } = splitButtons('Step 1. Do the thing');
    expect(buttons).toEqual([]);
    expect(text).toBe('Step 1. Do the thing');
  });

  it('only treats a TRAILING run as buttons', () => {
    const body = 'Here are the steps:\n1. first\n2. second\n\nNow pick:\n1. Yes\n2. No';
    const { buttons } = splitButtons(body);
    expect(buttons).toEqual(['Yes', 'No']);
  });
});

describe('expandBlocks', () => {
  it('turns one Ask a Question card into the three engine steps it really is', () => {
    const blocks: Block[] = [
      {
        id: 'b1',
        kind: 'ask_question',
        config: { question: 'What is your name?', saveAs: 'first_name' },
      },
    ];
    const nodes = expandBlocks(blocks);
    expect(nodes.map((n) => n.kind)).toEqual(['send_dm', 'wait_reply', 'collect_field']);
    expect(nodes[2].config.field).toBe('first_name');
  });

  it('chains every node linearly', () => {
    const nodes = expandBlocks([
      { id: 'a', kind: 'send_message', config: { message: 'hi' } },
      { id: 'b', kind: 'ask_question', config: { question: 'name?', saveAs: 'first_name' } },
      { id: 'c', kind: 'create_lead', config: {} },
    ]);
    expect(nodes[0].parentId).toBeNull();
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i].parentId).toBe(nodes[i - 1].id);
    }
  });

  it('gives every node a stable id derived from its block', () => {
    const a = expandBlocks([{ id: 'b1', kind: 'ask_question', config: { saveAs: 'x' } }]);
    const b = expandBlocks([{ id: 'b1', kind: 'ask_question', config: { saveAs: 'x' } }]);
    expect(a.map((n) => n.id)).toEqual(b.map((n) => n.id));
  });

  it('marks every node with the block it came from', () => {
    const nodes = expandBlocks([{ id: 'b1', kind: 'ask_question', config: {} }]);
    for (const n of nodes) {
      expect(n.config._block.id).toBe('b1');
      expect(n.config._block.kind).toBe('ask_question');
    }
  });
});

describe('round trip', () => {
  const cases: Block[][] = [
    [{ id: 'a', kind: 'send_message', config: { message: 'Hello there' } }],
    [
      {
        id: 'a',
        kind: 'ask_question',
        config: {
          question: 'What is your budget?',
          buttons: ['Under 500', '500–1000', '1000+'],
          saveAs: 'budget',
          timeoutDays: 3,
        },
      },
    ],
    [{ id: 'a', kind: 'show_buttons', config: { message: 'Pick one', buttons: ['Yes', 'No'] } }],
    [{ id: 'a', kind: 'add_tag', config: { tags: ['vip', 'lead'] } }],
    [{ id: 'a', kind: 'create_lead', config: { fields: ['email', 'phone'], assignTo: null } }],
    [{ id: 'a', kind: 'notify_team', config: { message: 'New lead' } }],
    [{ id: 'a', kind: 'collect_information', config: { saveAs: 'company' } }],
    [
      { id: 'a', kind: 'send_message', config: { message: 'Hi' } },
      { id: 'b', kind: 'ask_question', config: { question: 'Email?', saveAs: 'email' } },
      { id: 'c', kind: 'create_lead', config: { fields: ['email'], assignTo: null } },
    ],
  ];

  it.each(cases)('survives expand → collapse (%#)', (...blocks) => {
    const input = blocks as unknown as Block[];
    const out = collapseNodes(expandBlocks(input));
    expect(out.map((b) => b.kind)).toEqual(input.map((b) => b.kind));
    expect(out.map((b) => b.id)).toEqual(input.map((b) => b.id));
    out.forEach((b, i) => {
      for (const [k, v] of Object.entries(input[i].config)) {
        expect(b.config[k]).toEqual(v);
      }
    });
  });

  it('survives every question template', () => {
    for (const t of QUESTION_TEMPLATES) {
      const block: Block = {
        id: t.key,
        kind: 'ask_question',
        config: { question: t.question, saveAs: t.saveAs, buttons: t.buttons ?? [] },
      };
      const [back] = collapseNodes(expandBlocks([block]));
      expect(back.config.question).toBe(t.question);
      expect(back.config.saveAs).toBe(t.saveAs);
      expect(back.config.buttons).toEqual(t.buttons ?? []);
    }
  });

  it('survives every button template', () => {
    for (const t of BUTTON_TEMPLATES) {
      const block: Block = {
        id: t.key,
        kind: 'show_buttons',
        config: { message: 'Choose:', buttons: t.buttons },
      };
      const [back] = collapseNodes(expandBlocks([block]));
      expect(back.config.buttons).toEqual(t.buttons);
    }
  });
});

describe('collapseNodes on legacy graphs', () => {
  it('never drops a node saved before blocks existed', () => {
    // Losing these would silently delete someone's steps on the next save.
    const legacy = [
      { id: 'n1', parentId: null, branchKey: null, kind: 'send_dm', config: { message: 'hi' }, position: 0 },
      { id: 'n2', parentId: 'n1', branchKey: null, kind: 'collect_field', config: { field: 'email' }, position: 1 },
      { id: 'n3', parentId: 'n2', branchKey: null, kind: 'create_lead', config: {}, position: 2 },
    ];
    const blocks = collapseNodes(legacy);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.kind)).toEqual([
      'send_message',
      'collect_information',
      'create_lead',
    ]);
    expect(blocks[1].config.saveAs).toBe('email');
  });

  it('handles an empty workflow', () => {
    expect(collapseNodes([])).toEqual([]);
    expect(expandBlocks([])).toEqual([]);
  });
});

describe('block catalogue', () => {
  it('uses no developer terminology in any label', () => {
    // The whole point of the block vocabulary. If a name needs a glossary it is
    // the wrong name.
    const banned = ['node', 'payload', 'webhook', 'json', 'api', 'boolean', 'config'];
    for (const b of BLOCKS) {
      const text = `${b.label} ${b.summary}`.toLowerCase();
      for (const word of banned) {
        expect(text).not.toContain(word);
      }
    }
  });

  it('every block expands to at least one engine node', () => {
    for (const b of BLOCKS) {
      const nodes = expandBlocks([{ id: 'x', kind: b.kind, config: {} }]);
      expect(nodes.length).toBeGreaterThan(0);
    }
  });
});

describe('template catalogue', () => {
  const { TEMPLATES, TEMPLATE_CATEGORIES } = require('./automation.templates');

  it('every template expands to a valid, linear engine graph', () => {
    for (const t of TEMPLATES) {
      const nodes = expandBlocks(
        t.blocks.map((b: any, i: number) => ({ id: `${t.key}-${i}`, kind: b.kind, config: b.config }))
      );
      expect(nodes[0]?.parentId ?? null).toBeNull();
      for (let i = 1; i < nodes.length; i++) {
        expect(nodes[i].parentId).toBe(nodes[i - 1].id);
      }
    }
  });

  it('every template round-trips back into the same blocks', () => {
    // A template that reopened as different cards than it created would make
    // the gallery quietly produce worse workflows than building by hand.
    for (const t of TEMPLATES) {
      const blocks = t.blocks.map((b: any, i: number) => ({
        id: `${t.key}-${i}`,
        kind: b.kind,
        config: b.config,
      }));
      const back = collapseNodes(expandBlocks(blocks));
      expect(back.map((b) => b.kind)).toEqual(blocks.map((b: any) => b.kind));
    }
  });

  it('every template sits in a declared category', () => {
    const known = new Set(TEMPLATE_CATEGORIES.map((c: any) => c.key));
    for (const t of TEMPLATES) {
      expect(known.has(t.category)).toBe(true);
    }
  });

  it('every category has at least one template', () => {
    for (const c of TEMPLATE_CATEGORIES) {
      expect(TEMPLATES.some((t: any) => t.category === c.key)).toBe(true);
    }
  });

  it('template keys are unique', () => {
    const keys = TEMPLATES.map((t: any) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only AI templates are marked coming soon', () => {
    // A non-AI template flagged "soon" would be offered and then silently do
    // nothing, with no provider to blame.
    for (const t of TEMPLATES) {
      if (t.comingSoon) expect(t.category).toBe('ai');
    }
  });

  it('no template quotes a conversion rate', () => {
    // We have no data for one, and an invented percentage is a number people
    // would plan budgets around.
    for (const t of TEMPLATES) {
      expect(`${t.description} ${t.tagline}`).not.toMatch(/\d+\s*%/);
    }
  });
});
