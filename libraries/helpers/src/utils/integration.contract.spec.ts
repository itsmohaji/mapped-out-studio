import {
  parsePostingTimes,
  parseAdditionalSettings,
  normalizeIntegration,
  normalizeIntegrationList,
  DEFAULT_POSTING_TIMES,
} from './integration.contract';

describe('parsePostingTimes', () => {
  it('parses a well-formed JSON string', () => {
    expect(parsePostingTimes('[{"time":120},{"time":400}]')).toEqual([
      { time: 120 },
      { time: 400 },
    ]);
  });

  it('accepts an already-parsed array', () => {
    expect(parsePostingTimes([{ time: 60 }])).toEqual([{ time: 60 }]);
  });

  // THE PRODUCTION CRASH. `Integration.postingTimes` is a plain String column, so a
  // row can hold valid JSON that is not an array. JSON.parse succeeds, the endpoint
  // returns HTTP 200, and the nested field reaches `.flatMap()` — which throws.
  // Every one of these used to produce a non-array and take the Calendar down.
  it.each([
    ['object', '{}'],
    ['null literal', 'null'],
    ['number', '5'],
    ['string', '"120"'],
    ['boolean', 'true'],
  ])('falls back to the default when the JSON is a %s', (_label, raw) => {
    expect(parsePostingTimes(raw)).toEqual(DEFAULT_POSTING_TIMES);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace', '   '],
    ['unparseable', '{not json'],
    ['truncated', '[{"time":12'],
    ['a plain object', { time: 5 } as unknown],
    ['a number', 7 as unknown],
  ])('falls back to the default for %s', (_label, raw) => {
    expect(parsePostingTimes(raw)).toEqual(DEFAULT_POSTING_TIMES);
  });

  it('drops malformed entries but keeps the good ones', () => {
    expect(
      parsePostingTimes('[{"time":120},{"nope":1},null,{"time":"x"},{"time":300}]')
    ).toEqual([{ time: 120 }, { time: 300 }]);
  });

  it('falls back when every entry is malformed rather than returning empty', () => {
    // An empty schedule and a corrupt schedule are different things. Returning []
    // would silently mean "never post", which is a worse failure than the default.
    expect(parsePostingTimes('[{"nope":1},null]')).toEqual(DEFAULT_POSTING_TIMES);
  });

  it('coerces a numeric-string time, because older rows stored it that way', () => {
    expect(parsePostingTimes('[{"time":"120"}]')).toEqual([{ time: 120 }]);
  });

  it('rejects times outside a day', () => {
    expect(parsePostingTimes('[{"time":-5},{"time":9999},{"time":120}]')).toEqual([
      { time: 120 },
    ]);
  });

  it('never throws, whatever it is given', () => {
    const nasty: unknown[] = [Symbol('x'), () => 1, NaN, Infinity, [], {}, 0n];
    for (const value of nasty) {
      expect(() => parsePostingTimes(value)).not.toThrow();
      expect(Array.isArray(parsePostingTimes(value))).toBe(true);
    }
  });

  it('always returns a non-empty array', () => {
    for (const value of [undefined, null, '', '{}', '[]', 'null']) {
      expect(parsePostingTimes(value).length).toBeGreaterThan(0);
    }
  });
});

describe('parseAdditionalSettings', () => {
  it('parses a well-formed array', () => {
    expect(parseAdditionalSettings('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it.each([
    ['object json', '{}'],
    ['null literal', 'null'],
    ['unparseable', '{oops'],
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
  ])('returns [] for %s', (_label, raw) => {
    expect(parseAdditionalSettings(raw)).toEqual([]);
  });

  it('never throws', () => {
    for (const value of [Symbol('x') as unknown, 5, {}, []]) {
      expect(() => parseAdditionalSettings(value)).not.toThrow();
    }
  });
});

const good = {
  id: 'i1',
  name: 'Époque',
  identifier: 'instagram',
  picture: '/p.jpg',
  display: 'Époque',
  type: 'social',
  editor: 'normal',
  inBetweenSteps: false,
  changeProfilePicture: false,
  changeNickName: false,
  additionalSettings: '[]',
  time: [{ time: 120 }],
};

describe('normalizeIntegration', () => {
  it('passes a healthy integration through', () => {
    const out = normalizeIntegration(good);
    expect(out).not.toBeNull();
    expect(out!.id).toBe('i1');
    expect(out!.time).toEqual([{ time: 120 }]);
    expect(out!.needsAttention).toBe(false);
  });

  // additionalSettings stays a STRING on the wire because the UI types it that
  // way and several consumers JSON.parse it. What is guaranteed is that it
  // always parses to an array.
  it('always yields an additionalSettings string that parses to an array', () => {
    for (const raw of ['[{"a":1}]', '{}', 'null', '{oops', '', undefined, null, 5]) {
      const out = normalizeIntegration({ ...good, additionalSettings: raw })!;
      expect(typeof out.additionalSettings).toBe('string');
      expect(Array.isArray(JSON.parse(out.additionalSettings))).toBe(true);
    }
  });

  it('falls back to a known editor rather than passing an unknown one to the UI', () => {
    expect(normalizeIntegration({ ...good, editor: 'html' })!.editor).toBe('html');
    expect(normalizeIntegration({ ...good, editor: 'wysiwyg' })!.editor).toBe('normal');
    expect(normalizeIntegration({ ...good, editor: undefined })!.editor).toBe('normal');
  });

  it('repairs a malformed time rather than dropping the account', () => {
    // One bad account must not cost the operator the other nine.
    const out = normalizeIntegration({ ...good, time: {} });
    expect(out).not.toBeNull();
    expect(Array.isArray(out!.time)).toBe(true);
    expect(out!.time).toEqual(DEFAULT_POSTING_TIMES);
  });

  it('flags a refresh-needed account as needing attention', () => {
    expect(normalizeIntegration({ ...good, refreshNeeded: true })!.needsAttention).toBe(
      true
    );
  });

  it('flags a disabled account as needing attention', () => {
    expect(normalizeIntegration({ ...good, disabled: true })!.needsAttention).toBe(true);
  });

  it('drops an entry with no usable id', () => {
    expect(normalizeIntegration({ ...good, id: undefined })).toBeNull();
    expect(normalizeIntegration({ ...good, id: '' })).toBeNull();
    expect(normalizeIntegration(null)).toBeNull();
    expect(normalizeIntegration('nope')).toBeNull();
  });

  it('substitutes a placeholder name rather than dropping a nameless account', () => {
    expect(normalizeIntegration({ ...good, name: undefined })!.name).toBeTruthy();
  });

  it('keeps customer only when it has an id', () => {
    expect(normalizeIntegration({ ...good, customer: { id: 'c1', name: 'X' } })!.customer)
      .toEqual({ id: 'c1', name: 'X' });
    expect(normalizeIntegration({ ...good, customer: {} })!.customer).toBeUndefined();
    expect(normalizeIntegration({ ...good, customer: 'oops' })!.customer).toBeUndefined();
  });
});

describe('normalizeIntegrationList', () => {
  it('returns the healthy accounts from a valid envelope', () => {
    const r = normalizeIntegrationList({ integrations: [good, { ...good, id: 'i2' }] });
    expect(r.integrations).toHaveLength(2);
    expect(r.dropped).toBe(0);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an object', { integrations: {} }],
    ['a bare object', {}],
    ['a string', 'nope'],
    ['a number', 7],
    ['an array at the top level', [good]],
    ['integrations: null', { integrations: null }],
    ['integrations: a string', { integrations: 'x' }],
  ])('returns an empty array for %s', (_label, body) => {
    const r = normalizeIntegrationList(body);
    expect(Array.isArray(r.integrations)).toBe(true);
    expect(r.integrations).toHaveLength(0);
  });

  // The regression test for the reported production crash.
  it('survives one malformed account and still returns the healthy ones', () => {
    const r = normalizeIntegrationList({
      integrations: [good, { ...good, id: 'bad', time: {} }, { ...good, id: 'i3' }],
    });
    expect(r.integrations).toHaveLength(3);
    for (const i of r.integrations) expect(Array.isArray(i.time)).toBe(true);
    // and the operation that used to throw now cannot
    expect(() => r.integrations.flatMap((i) => i.time.flatMap((t) => t.time))).not.toThrow();
  });

  it('drops unusable entries and counts them', () => {
    const r = normalizeIntegrationList({
      integrations: [good, null, 'x', { name: 'no id' }],
    });
    expect(r.integrations).toHaveLength(1);
    expect(r.dropped).toBe(3);
  });

  it('every returned integration has an array time — the invariant the UI relies on', () => {
    const r = normalizeIntegrationList({
      integrations: [
        { ...good, id: 'a', time: '{}' },
        { ...good, id: 'b', time: null },
        { ...good, id: 'c', time: 5 },
        { ...good, id: 'd', time: [{ time: 60 }] },
      ],
    });
    expect(r.integrations).toHaveLength(4);
    for (const i of r.integrations) {
      expect(Array.isArray(i.time)).toBe(true);
      expect(i.time.length).toBeGreaterThan(0);
    }
  });
});
