/**
 * Engine tests. These cover the decisions that are expensive to get wrong:
 * keyword matching against real-world comment noise, the platform limits that
 * govern private replies, and graph traversal that must never loop.
 */

import {
  capabilitiesFor,
  canPrivateReply,
  isMessagingWindowOpen,
  validateWorkflow,
} from './automation.capabilities';
import {
  evaluateConditions,
  isWithinBusinessHours,
  matchesKeyword,
  normalizeText,
  renderTemplate,
} from './automation.matching';
import { buildVariables, matchWorkflows, nextStep, triggerForEvent } from './automation.engine';
import {
  AutomationEventInput,
  Condition,
  EvalContext,
  WorkflowNode,
  WorkflowSummary,
} from './automation.types';

const NOW = new Date('2026-08-02T12:00:00.000Z');

function commentEvent(over: Partial<AutomationEventInput> = {}): AutomationEventInput {
  return {
    channel: 'instagram',
    kind: 'comment',
    externalId: 'c1',
    accountId: 'ig-acct',
    fromId: 'igsid-1',
    fromHandle: 'someone',
    text: 'YES',
    externalPostId: 'media-1',
    commentId: 'c1',
    timestamp: NOW.getTime(),
    ...over,
  };
}

function ctx(over: Partial<EvalContext> = {}): EvalContext {
  return { event: commentEvent(), variables: {}, now: NOW, ...over };
}

describe('normalizeText', () => {
  it('folds case, punctuation, emoji and diacritics', () => {
    expect(normalizeText('YES')).toBe('yes');
    expect(normalizeText('  yes!!  ')).toBe('yes');
    expect(normalizeText('Yés')).toBe('yes');
    expect(normalizeText('Yes 🙌')).toBe('yes');
  });

  it('treats emoji as a separator, not as nothing', () => {
    // Deleting the emoji outright would fuse this into the single word "yesno".
    expect(normalizeText('yes🙌no')).toBe('yes no');
  });

  it('survives empty and nullish input', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('matchesKeyword', () => {
  it('matches the real ways people type YES', () => {
    for (const text of ['YES', 'yes', 'Yes!', ' yes ', 'Yes 🙌', 'yes.', 'Yés']) {
      expect(matchesKeyword(text, ['YES'], 'equals')).toBe(true);
    }
  });

  it('does not match a word that merely starts with the keyword', () => {
    // The bug that DMs everyone who mentions their week.
    expect(matchesKeyword('yesterday was great', ['YES'], 'contains')).toBe(false);
    expect(matchesKeyword('eyes', ['YES'], 'contains')).toBe(false);
  });

  it('matches the keyword inside a sentence in contains mode', () => {
    expect(matchesKeyword('ok yes please send it', ['YES'], 'contains')).toBe(true);
    expect(matchesKeyword('ok yes please send it', ['YES'], 'equals')).toBe(false);
  });

  it('matches multi-word keywords on word boundaries', () => {
    expect(matchesKeyword('please send me the price list', ['price list'], 'contains')).toBe(true);
    expect(matchesKeyword('pricelist', ['price list'], 'contains')).toBe(false);
  });

  it('returns false rather than throwing on an invalid regex', () => {
    expect(matchesKeyword('anything', ['('], 'regex')).toBe(false);
  });

  it('does not match when no keywords are configured', () => {
    expect(matchesKeyword('yes', [], 'equals')).toBe(false);
    expect(matchesKeyword('yes', ['   '], 'equals')).toBe(false);
  });
});

describe('isWithinBusinessHours', () => {
  const cfg = { timezone: 'Asia/Bahrain', days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00' };

  it('is inside during a working afternoon', () => {
    // 12:00 UTC = 15:00 Bahrain on a Sunday, which is a working day there.
    expect(isWithinBusinessHours(new Date('2026-08-02T12:00:00Z'), cfg)).toBe(true);
  });

  it('is outside before opening', () => {
    expect(isWithinBusinessHours(new Date('2026-08-02T04:00:00Z'), cfg)).toBe(false);
  });

  it('is outside on a non-working day', () => {
    // 2026-08-01 is a Saturday, which is not in days.
    expect(isWithinBusinessHours(new Date('2026-08-01T12:00:00Z'), cfg)).toBe(false);
  });

  it('handles an overnight shift belonging to the day it started', () => {
    const night = { timezone: 'Asia/Bahrain', days: [5], start: '22:00', end: '06:00' };
    // Friday 23:00 Bahrain = Friday 20:00 UTC.
    expect(isWithinBusinessHours(new Date('2026-07-31T20:00:00Z'), night)).toBe(true);
    // Saturday 02:00 Bahrain still belongs to the Friday shift.
    expect(isWithinBusinessHours(new Date('2026-07-31T23:00:00Z'), night)).toBe(true);
    // Saturday 12:00 Bahrain is outside it entirely.
    expect(isWithinBusinessHours(new Date('2026-08-01T09:00:00Z'), night)).toBe(false);
  });

  it('is false for an unparseable timezone or time rather than throwing', () => {
    expect(isWithinBusinessHours(NOW, { ...cfg, timezone: 'Not/AZone' })).toBe(false);
    expect(isWithinBusinessHours(NOW, { ...cfg, start: '9am' })).toBe(false);
  });
});

describe('evaluateConditions', () => {
  it('passes when there are no conditions', () => {
    expect(evaluateConditions([], ctx())).toBe(true);
  });

  it('requires every condition to hold', () => {
    const conds: Condition[] = [
      { kind: 'keyword', match: 'equals', values: ['YES'] },
      { kind: 'platform', values: ['facebook'] },
    ];
    expect(evaluateConditions(conds, ctx())).toBe(false);
  });

  it('matches a specific post by either our id or the platform id', () => {
    const byPlatform: Condition[] = [{ kind: 'specific_post', postIds: ['media-1'] }];
    expect(evaluateConditions(byPlatform, ctx())).toBe(true);

    const byOurs: Condition[] = [{ kind: 'specific_post', postIds: ['post-abc'] }];
    expect(evaluateConditions(byOurs, ctx({ postId: 'post-abc' }))).toBe(true);
    expect(evaluateConditions(byOurs, ctx())).toBe(false);
  });

  it('evaluates tag modes', () => {
    const contact = { tags: ['vip', 'bahrain'], fields: {} };
    const any: Condition[] = [{ kind: 'tags', mode: 'any', values: ['VIP'] }];
    const all: Condition[] = [{ kind: 'tags', mode: 'all', values: ['vip', 'qatar'] }];
    const none: Condition[] = [{ kind: 'tags', mode: 'none', values: ['blocked'] }];
    expect(evaluateConditions(any, ctx({ contact }))).toBe(true);
    expect(evaluateConditions(all, ctx({ contact }))).toBe(false);
    expect(evaluateConditions(none, ctx({ contact }))).toBe(true);
  });

  it('treats a first-time commenter as new', () => {
    const isNew: Condition[] = [{ kind: 'customer_type', values: ['new'] }];
    expect(evaluateConditions(isNew, ctx())).toBe(true);
    expect(
      evaluateConditions(isNew, ctx({ contact: { tags: [], fields: {}, priorConversations: 3 } }))
    ).toBe(false);
  });

  it('compares variables numerically only when both sides are numbers', () => {
    const gt: Condition[] = [{ kind: 'variable', name: 'budget', op: 'gt', value: '100' }];
    expect(evaluateConditions(gt, ctx({ variables: { budget: '250' } }))).toBe(true);
    expect(evaluateConditions(gt, ctx({ variables: { budget: '50' } }))).toBe(false);
    expect(evaluateConditions(gt, ctx({ variables: { budget: 'lots' } }))).toBe(false);
  });

  it('refuses to fire on an unknown condition kind', () => {
    // A workflow saved by a newer build must not fire blind on an older worker.
    const weird = [{ kind: 'from_the_future' } as unknown as Condition];
    expect(evaluateConditions(weird, ctx())).toBe(false);
  });
});

describe('Instagram platform limits', () => {
  it('allows a private reply to a fresh, untouched comment', () => {
    expect(
      canPrivateReply('instagram', {
        commentCreatedAtMs: NOW.getTime() - 60_000,
        nowMs: NOW.getTime(),
        alreadySent: 0,
      })
    ).toEqual({ ok: true });
  });

  it('refuses a second private reply to the same comment', () => {
    const r = canPrivateReply('instagram', {
      commentCreatedAtMs: NOW.getTime(),
      nowMs: NOW.getTime(),
      alreadySent: 1,
    });
    expect(r.ok).toBe(false);
    expect((r as any).reason).toMatch(/only 1 per comment/i);
  });

  it('refuses once the comment is past the 7-day window', () => {
    const eightDays = 8 * 24 * 60 * 60 * 1000;
    const r = canPrivateReply('instagram', {
      commentCreatedAtMs: NOW.getTime() - eightDays,
      nowMs: NOW.getTime(),
      alreadySent: 0,
    });
    expect(r.ok).toBe(false);
    expect((r as any).reason).toMatch(/7-day/);
  });

  it('knows a private reply does not open the messaging window', () => {
    // The whole shape of the flow depends on this being false.
    expect(capabilitiesFor('instagram')!.privateReply!.opensMessagingWindow).toBe(false);
  });

  it('closes the messaging window 24h after the last inbound message', () => {
    const justUnder = NOW.getTime() - (24 * 60 * 60 * 1000 - 1000);
    const justOver = NOW.getTime() - (24 * 60 * 60 * 1000 + 1000);
    expect(isMessagingWindowOpen('instagram', justUnder, NOW.getTime())).toBe(true);
    expect(isMessagingWindowOpen('instagram', justOver, NOW.getTime())).toBe(false);
    expect(isMessagingWindowOpen('instagram', null, NOW.getTime())).toBe(false);
  });

  it('treats our own website chat as always open', () => {
    expect(isMessagingWindowOpen('website', null, NOW.getTime())).toBe(true);
  });
});

describe('validateWorkflow', () => {
  it('rejects a TikTok workflow with the real reason', () => {
    const issues = validateWorkflow({ channel: 'tiktok', trigger: 'comment', nodeKinds: ['send_dm'] });
    expect(issues[0].level).toBe('error');
    expect(issues[0].message).toMatch(/no public API/i);
  });

  it('rejects a LinkedIn workflow', () => {
    const issues = validateWorkflow({ channel: 'linkedin', trigger: 'comment', nodeKinds: [] });
    expect(issues[0].level).toBe('error');
  });

  it('rejects a comment trigger on WhatsApp, which has no comments', () => {
    const issues = validateWorkflow({
      channel: 'whatsapp',
      trigger: 'comment',
      nodeKinds: ['send_dm'],
    });
    expect(issues.some((i) => i.level === 'error' && /trigger/.test(i.message))).toBe(true);
  });

  it('accepts the Instagram comment-to-DM shape', () => {
    const issues = validateWorkflow({
      channel: 'instagram',
      trigger: 'comment',
      nodeKinds: ['send_dm', 'wait_reply', 'create_lead', 'notify_team'],
    });
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('warns but does not block when the messaging scope is missing', () => {
    // The owner must be able to build the DM half while App Review is pending.
    const issues = validateWorkflow(
      { channel: 'instagram', trigger: 'comment', nodeKinds: ['send_dm'] },
      ['instagram_business_basic', 'instagram_business_manage_comments']
    );
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(0);
    const warn = issues.find((i) => i.level === 'warning');
    expect(warn!.message).toMatch(/instagram_business_manage_messages/);
    expect(warn!.message).toMatch(/App Review/i);
  });

  it('errors when a comment scope is missing, since that half should work today', () => {
    const issues = validateWorkflow(
      { channel: 'instagram', trigger: 'comment', nodeKinds: ['reply_comment'] },
      ['instagram_business_basic']
    );
    expect(issues.some((i) => i.level === 'error' && /Reconnect/.test(i.message))).toBe(true);
  });
});

describe('matchWorkflows', () => {
  const base: WorkflowSummary = {
    id: 'w1',
    orgId: 'org',
    customerId: 'cust',
    channel: 'instagram',
    trigger: 'comment',
    triggerConfig: {},
    conditions: [{ kind: 'keyword', match: 'equals', values: ['YES'] }],
    status: 'active',
  };

  const rest = { variables: {}, now: NOW };

  it('fires on a matching comment', () => {
    expect(matchWorkflows(commentEvent(), [base], rest).map((w) => w.id)).toEqual(['w1']);
  });

  it('does not fire on a draft or paused workflow', () => {
    expect(matchWorkflows(commentEvent(), [{ ...base, status: 'draft' }], rest)).toHaveLength(0);
    expect(matchWorkflows(commentEvent(), [{ ...base, status: 'paused' }], rest)).toHaveLength(0);
  });

  it('does not fire on a different channel', () => {
    expect(
      matchWorkflows(commentEvent({ channel: 'facebook' }), [base], rest)
    ).toHaveLength(0);
  });

  it('does not fire when the keyword does not match', () => {
    expect(matchWorkflows(commentEvent({ text: 'nope' }), [base], rest)).toHaveLength(0);
  });

  it('respects a post binding', () => {
    const bound = { ...base, boundExternalPostIds: ['media-9'] };
    expect(matchWorkflows(commentEvent(), [bound], rest)).toHaveLength(0);
    expect(matchWorkflows(commentEvent({ externalPostId: 'media-9' }), [bound], rest)).toHaveLength(1);
  });

  it('fires on every post when no binding is set', () => {
    expect(matchWorkflows(commentEvent({ externalPostId: 'anything' }), [base], rest)).toHaveLength(1);
  });

  it('does NOT fire on every post while a binding is still unresolved', () => {
    // A binding created at compose time has our Post.id but not yet the
    // platform's media id. Treating that as "no restriction" would DM everyone
    // who comments on anything — the opposite of what the user asked for.
    const pending = { ...base, boundExternalPostIds: [], boundPostCount: 1 };
    expect(matchWorkflows(commentEvent({ externalPostId: 'media-1' }), [pending], rest)).toHaveLength(0);
    expect(matchWorkflows(commentEvent({ externalPostId: 'other' }), [pending], rest)).toHaveLength(0);
  });

  it('fires once that binding resolves to the platform id', () => {
    const resolved = { ...base, boundExternalPostIds: ['media-1'], boundPostCount: 1 };
    expect(matchWorkflows(commentEvent({ externalPostId: 'media-1' }), [resolved], rest)).toHaveLength(1);
    expect(matchWorkflows(commentEvent({ externalPostId: 'other' }), [resolved], rest)).toHaveLength(0);
  });

  it('maps event kinds to the triggers they can satisfy', () => {
    expect(triggerForEvent(commentEvent())).toContain('comment');
    expect(triggerForEvent(commentEvent({ kind: 'message' }))).toContain('direct_message');
  });
});

describe('nextStep', () => {
  const nodes: WorkflowNode[] = [
    { id: 'n1', parentId: null, branchKey: null, kind: 'send_dm', config: {}, position: 0 },
    { id: 'n2', parentId: 'n1', branchKey: null, kind: 'wait_reply', config: { timeoutDays: 7 }, position: 0 },
    {
      id: 'n3',
      parentId: 'n2',
      branchKey: null,
      kind: 'branch',
      config: { conditions: [{ kind: 'keyword', match: 'contains', values: ['interested'] }] },
      position: 0,
    },
    { id: 'n4', parentId: 'n3', branchKey: 'match', kind: 'create_lead', config: {}, position: 0 },
    { id: 'n5', parentId: 'n3', branchKey: 'no_match', kind: 'add_tag', config: {}, position: 0 },
  ];

  it('starts at the first root node', () => {
    const step = nextStep(nodes, null, ctx());
    expect(step).toMatchObject({ type: 'action', node: { id: 'n1' } });
  });

  it('suspends on wait_reply with the configured timeout', () => {
    const step = nextStep(nodes, 'n1', ctx());
    expect(step.type).toBe('suspend');
    expect((step as any).reason).toBe('wait_reply');
    expect((step as any).untilMs).toBe(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it('resolves a branch internally and returns the matching side', () => {
    const step = nextStep(nodes, 'n2', ctx({ event: commentEvent({ text: 'yes im interested' }) }));
    expect(step).toMatchObject({ type: 'action', node: { id: 'n4' } });
  });

  it('takes the no_match side when the branch fails', () => {
    const step = nextStep(nodes, 'n2', ctx({ event: commentEvent({ text: 'not for me' }) }));
    expect(step).toMatchObject({ type: 'action', node: { id: 'n5' } });
  });

  it('reports done at the end of the graph', () => {
    expect(nextStep(nodes, 'n4', ctx())).toEqual({ type: 'done' });
  });

  it('skips a zero-length wait instead of suspending for nothing', () => {
    const withWait: WorkflowNode[] = [
      { id: 'a', parentId: null, branchKey: null, kind: 'wait', config: { minutes: 0 }, position: 0 },
      { id: 'b', parentId: 'a', branchKey: null, kind: 'notify_team', config: {}, position: 0 },
    ];
    expect(nextStep(withWait, null, ctx())).toMatchObject({ type: 'action', node: { id: 'b' } });
  });

  it('skips the AI step rather than failing the run', () => {
    const withAi: WorkflowNode[] = [
      { id: 'a', parentId: null, branchKey: null, kind: 'generate_ai_response', config: {}, position: 0 },
      { id: 'b', parentId: 'a', branchKey: null, kind: 'send_dm', config: {}, position: 0 },
    ];
    expect(nextStep(withAi, null, ctx())).toMatchObject({ type: 'action', node: { id: 'b' } });
  });

  it('stops on a loop instead of spinning forever', () => {
    const looped: WorkflowNode[] = [
      { id: 'a', parentId: null, branchKey: null, kind: 'wait', config: { minutes: 0 }, position: 0 },
      { id: 'b', parentId: 'a', branchKey: null, kind: 'wait', config: { minutes: 0 }, position: 0 },
      { id: 'a2', parentId: 'b', branchKey: null, kind: 'wait', config: { minutes: 0 }, position: 0 },
      { id: 'b2', parentId: 'a2', branchKey: null, kind: 'wait', config: { minutes: 0 }, position: 0 },
    ];
    // Close the cycle: b2's child is a, which was already visited.
    looped.push({ id: 'a', parentId: 'b2', branchKey: null, kind: 'wait', config: {}, position: 0 });
    const step = nextStep(looped, null, ctx());
    expect(step.type === 'done' || step.type === 'blocked').toBe(true);
  });

  it('returns done for an empty workflow', () => {
    expect(nextStep([], null, ctx())).toEqual({ type: 'done' });
  });
});

describe('renderTemplate / buildVariables', () => {
  it('interpolates known variables', () => {
    expect(renderTemplate('Hi {{first_name}}, thanks!', { first_name: 'Sara' })).toBe(
      'Hi Sara, thanks!'
    );
  });

  it('never leaks a raw placeholder into a customer-facing message', () => {
    expect(renderTemplate('Hi {{first_name}}, thanks!', {})).toBe('Hi , thanks!');
    expect(renderTemplate('Hi {{first_name}}!', {})).not.toMatch(/\{\{/);
  });

  it('exposes the comment text and handle to templates', () => {
    const vars = buildVariables(ctx());
    expect(vars.comment_text).toBe('YES');
    expect(vars.handle).toBe('someone');
  });

  it('lets the live event win over stale contact fields', () => {
    const vars = buildVariables(
      ctx({ contact: { tags: [], fields: { comment_text: 'an old comment' } } })
    );
    expect(vars.comment_text).toBe('YES');
  });
});
