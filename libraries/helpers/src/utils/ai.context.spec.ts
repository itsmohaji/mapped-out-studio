import {
  ClientContext,
  coverageOf,
  hasEnoughData,
  isSecretKey,
  redact,
  renderContext,
  renderCoverage,
  stripHtml,
} from './ai.context';
import { CAPABILITIES } from './ai.capabilities';

const channel = (
  name: string,
  identifier: string,
  data: any[] | null
): any => ({ integration: { id: name, name, identifier }, data });

const ctx = (over: Partial<ClientContext> = {}): ClientContext => ({
  clientName: 'Epoque',
  timeframeDays: 30,
  channels: [],
  posts: [],
  brief: null,
  ...over,
});

const series = (...totals: number[]) =>
  totals.map((total, i) => ({ total, date: `2026-07-0${i + 1}` }));

describe('secret redaction', () => {
  it('recognises credential-shaped keys', () => {
    for (const k of [
      'token',
      'refreshToken',
      'accessToken',
      'clientSecret',
      'password',
      'apiKey',
      'api_key',
      'credential',
    ]) {
      expect(isSecretKey(k)).toBe(true);
    }
  });

  it('leaves ordinary keys alone', () => {
    for (const k of ['name', 'identifier', 'content', 'label', 'total']) {
      expect(isSecretKey(k)).toBe(false);
    }
  });

  it('strips secrets at any depth, including inside arrays', () => {
    const out: any = redact({
      name: 'ok',
      token: 'SECRET',
      nested: { refreshToken: 'SECRET', keep: 1 },
      list: [{ clientSecret: 'SECRET', keep: 2 }],
    });
    expect(out.name).toBe('ok');
    expect(out.token).toBeUndefined();
    expect(out.nested.refreshToken).toBeUndefined();
    expect(out.nested.keep).toBe(1);
    expect(out.list[0].clientSecret).toBeUndefined();
    expect(out.list[0].keep).toBe(2);
  });

  it('an integration token can never reach a rendered prompt', () => {
    const rendered = renderContext(
      ctx({
        channels: [
          {
            integration: {
              id: 'i1',
              name: 'IG',
              identifier: 'instagram',
              token: 'ya29.SUPERSECRET',
              refreshToken: 'r.SUPERSECRET',
            },
            data: [{ label: 'Reach', data: series(10) }],
          } as any,
        ],
      })
    );
    expect(rendered).not.toContain('SUPERSECRET');
    expect(rendered).toContain('IG');
  });
});

describe('post content', () => {
  it('reads as the audience read it, not as markup', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe(
      'Hello world'
    );
  });

  it('does not run two blocks into one word', () => {
    expect(stripHtml('<p>One</p><p>Two</p>')).toBe('One Two');
    expect(stripHtml('First<br/>Second')).toBe('First Second');
    expect(stripHtml('<li>a</li><li>b</li>')).toBe('a b');
  });

  it('decodes the entities the editor emits', () => {
    expect(stripHtml('<p>Tom&#39;s &amp; Jerry&nbsp;time</p>')).toBe(
      "Tom's & Jerry time"
    );
  });

  it('drops script and style content entirely', () => {
    expect(stripHtml('<p>ok</p><script>alert(1)</script>')).toBe('ok');
    expect(stripHtml('<style>.a{color:red}</style><p>ok</p>')).toBe('ok');
  });

  it('survives empty and malformed input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(undefined as any)).toBe('');
    expect(stripHtml('<p>unclosed')).toBe('unclosed');
  });
});

describe('coverage', () => {
  it('counts a channel that returned nothing as connected but not reporting', () => {
    const c = coverageOf(
      ctx({
        channels: [
          channel('A', 'instagram', [{ label: 'Reach', data: series(5) }]),
          channel('B', 'x', null),
          channel('C', 'linkedin', []),
        ],
      })
    );
    expect(c.channelsConnected).toBe(3);
    expect(c.channelsReporting).toBe(1);
  });

  it('a metric marked unavailable does not count as reporting', () => {
    const c = coverageOf(
      ctx({
        channels: [
          channel('A', 'x', [
            { label: 'Reach', data: series(5), available: false },
          ]),
        ],
      })
    );
    expect(c.channelsReporting).toBe(0);
  });

  it('a metric with an empty series does not count as reporting', () => {
    const c = coverageOf(
      ctx({ channels: [channel('A', 'x', [{ label: 'Reach', data: [] }])] })
    );
    expect(c.channelsReporting).toBe(0);
  });

  it('an empty brief object does not count as having a brief', () => {
    expect(coverageOf(ctx({ brief: {} })).hasBrief).toBe(false);
    expect(
      coverageOf(ctx({ brief: { audience: null, tone: '' } })).hasBrief
    ).toBe(false);
    expect(coverageOf(ctx({ brief: { tone: 'warm' } })).hasBrief).toBe(true);
  });
});

describe('sufficiency', () => {
  const cov = (channelsConnected: number, channelsReporting: number) => ({
    channelsConnected,
    channelsReporting,
    postsSampled: 0,
    timeframeDays: 30,
    hasBrief: false,
  });

  it('analysis refuses when nothing is reporting', () => {
    expect(hasEnoughData('analyze_account', cov(2, 0)).ok).toBe(false);
    expect(hasEnoughData('performance_recos', cov(2, 0)).ok).toBe(false);
  });

  it('analysis proceeds as soon as one channel reports', () => {
    expect(hasEnoughData('analyze_account', cov(3, 1)).ok).toBe(true);
  });

  it('distinguishes "no channels" from "channels that are silent"', () => {
    expect(hasEnoughData('analyze_account', cov(0, 0)).message).toMatch(
      /Connect a channel/i
    );
    expect(hasEnoughData('analyze_account', cov(2, 0)).message).toMatch(
      /None of the connected channels/i
    );
  });

  it('writing capabilities degrade instead of refusing', () => {
    expect(hasEnoughData('write_captions', cov(0, 0)).ok).toBe(true);
    expect(hasEnoughData('content_ideas', cov(0, 0)).ok).toBe(true);
  });

  // The gate used to keep its own list of keys, which drifted: two capabilities
  // declared `needsAnalytics` were never actually gated. It is derived now, and
  // this is what stops a third one from being added and quietly ungated.
  it('gates every capability the registry declares needsAnalytics', () => {
    const declared = CAPABILITIES.filter((c) => c.needsAnalytics);
    expect(declared.length).toBeGreaterThan(0);
    for (const c of declared) {
      expect(hasEnoughData(c.key, cov(2, 0)).ok).toBe(false);
      expect(hasEnoughData(c.key, cov(2, 1)).ok).toBe(true);
    }
  });

  it('does not gate capabilities the registry leaves unflagged', () => {
    for (const c of CAPABILITIES.filter((x) => !x.needsAnalytics)) {
      expect(hasEnoughData(c.key, cov(0, 0)).ok).toBe(true);
    }
  });

  it('refusal messages never leak internals', () => {
    const m = hasEnoughData('analyze_account', cov(1, 0)).message || '';
    for (const leak of ['skill', 'prompt', 'model', 'openai', 'gpt', 'provider']) {
      expect(m.toLowerCase()).not.toContain(leak);
    }
  });
});

describe('rendering', () => {
  it('states coverage in words the operator can check', () => {
    const line = renderCoverage({
      channelsConnected: 3,
      channelsReporting: 2,
      postsSampled: 14,
      timeframeDays: 30,
      hasBrief: true,
    });
    expect(line).toContain('3 channel(s) connected, 2 reporting');
    expect(line).toContain('14 published post(s) sampled over the last 30 days');
    expect(line).toContain('brand brief on file');
  });

  it('names a silent channel as not reporting rather than showing zeros', () => {
    const out = renderContext(ctx({ channels: [channel('X Page', 'x', null)] }));
    expect(out).toContain('X Page (x): not reporting analytics.');
    expect(out).not.toMatch(/X Page \(x\): .*0/);
  });

  it('uses the same headline maths as the dashboard', () => {
    // Sum for a total metric; mean for an "average" (percentage) metric.
    const out = renderContext(
      ctx({
        channels: [
          channel('IG', 'instagram', [
            { label: 'Reach', data: series(100, 200, 300) },
            { label: 'Engagement', data: series(2, 4), average: 1 },
          ]),
        ],
      })
    );
    expect(out).toContain('Reach: 600');
    expect(out).toContain('Engagement: 3.00%');
  });

  it('reports followers as the latest level, never the sum', () => {
    const out = renderContext(
      ctx({
        channels: [
          channel('IG', 'instagram', [
            { label: 'Followers', data: series(100, 110, 120) },
          ]),
        ],
      })
    );
    expect(out).toContain('followers now 120');
    expect(out).not.toContain('330');
  });

  it('includes a percentage change only when the platform supplied one', () => {
    const withChange = renderContext(
      ctx({
        channels: [
          channel('IG', 'instagram', [
            { label: 'Reach', data: series(10), percentageChange: 12 },
          ]),
        ],
      })
    );
    const without = renderContext(
      ctx({ channels: [channel('IG', 'instagram', [{ label: 'Reach', data: series(10) }])] })
    );
    expect(withChange).toContain('(change +12%)');
    expect(without).not.toContain('change');
  });

  it('says plainly when there is no brief, so the model does not invent a house style', () => {
    expect(renderContext(ctx())).toContain('BRAND BRIEF: none on file');
    expect(renderContext(ctx({ brief: { tone: 'Warm, confident' } }))).toContain(
      '- Tone: Warm, confident'
    );
  });

  it('says plainly when there are no posts', () => {
    expect(renderContext(ctx())).toContain(
      'RECENT PUBLISHED POSTS: none in this period.'
    );
  });

  it('caps how many posts and how much of each it hands over', () => {
    const posts = Array.from({ length: 40 }, (_, i) => ({
      platform: 'instagram',
      content: 'x'.repeat(500) + `#${i}`,
    }));
    const out = renderContext(ctx({ posts }));
    const lines = out.split('\n').filter((l) => l.startsWith('- [instagram'));
    expect(lines).toHaveLength(20);
    expect(lines[0].length).toBeLessThan(340);
  });

  it('collapses newlines in post content so one post stays one line', () => {
    const out = renderContext(
      ctx({ posts: [{ platform: 'x', content: 'line one\n\nline two' }] })
    );
    expect(out).toContain('line one line two');
  });

  it('fences the data so the model knows what it may rely on', () => {
    const out = renderContext(ctx());
    expect(out).toContain('--- DATA (the only facts you may use) ---');
    expect(out).toContain('--- END DATA ---');
  });

  it('handles a completely empty context without throwing', () => {
    expect(() => renderContext(ctx({ clientName: null }))).not.toThrow();
    expect(renderContext(ctx({ clientName: null }))).toContain(
      'CLIENT: not specified'
    );
  });
});
