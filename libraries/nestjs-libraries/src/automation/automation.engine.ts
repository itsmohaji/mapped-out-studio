/**
 * The engine: which workflows fire, and what happens next.
 *
 * Pure. It takes an event, some rows, and a clock, and returns a decision. It
 * never touches a database or a platform — that is the caller's job, which is
 * what makes every rule in here testable without Instagram, Postgres or Temporal.
 */

import {
  AutomationEventInput,
  Condition,
  EngineStep,
  EvalContext,
  TriggerKind,
  WorkflowNode,
  WorkflowSummary,
} from './automation.types';
import { evaluateConditions } from './automation.matching';

/** Which trigger an inbound event could satisfy. */
export function triggerForEvent(event: AutomationEventInput): TriggerKind[] {
  switch (event.kind) {
    // A comment can drive either a comment trigger or a bare keyword trigger,
    // which is how "any mention of X anywhere" workflows work.
    case 'comment':
      return ['comment', 'keyword'];
    case 'message':
      return ['direct_message', 'keyword'];
    case 'story_mention':
      return ['story_mention'];
    case 'form':
      return ['form_submission'];
    case 'webhook':
      return ['webhook'];
    case 'manual':
      return ['manual'];
    default:
      return [];
  }
}

/**
 * Workflows that should run for this event.
 *
 * Cheap structural checks first (status, channel, trigger, post binding) so a
 * high-volume account is not evaluating regexes against every workflow it owns.
 */
export function matchWorkflows(
  event: AutomationEventInput,
  workflows: WorkflowSummary[],
  ctx: Omit<EvalContext, 'event'>
): WorkflowSummary[] {
  const triggers = triggerForEvent(event);
  if (!triggers.length) return [];

  return (workflows || []).filter((w) => {
    if (w.status !== 'active') return false;
    if (w.channel !== event.channel) return false;
    if (!triggers.includes(w.trigger)) return false;

    // A workflow bound to specific posts must only fire on those posts. No
    // bindings at all means "every post", which is the ManyChat default.
    //
    // Fail CLOSED when bindings exist but none has resolved to a platform id
    // yet: "I could not tell which post this is" must never be treated as
    // "therefore every post". That would DM everyone who comments anywhere.
    const bound = w.boundExternalPostIds ?? [];
    const boundCount = w.boundPostCount ?? bound.length;
    if (boundCount > 0) {
      if (!bound.length) return false;
      if (!event.externalPostId || !bound.includes(event.externalPostId)) return false;
    }

    return evaluateConditions(w.conditions ?? [], { ...ctx, event });
  });
}

/** Depth guard. A corrupt parent chain must not spin a worker forever. */
const MAX_TRAVERSAL = 200;

function childrenOf(nodes: WorkflowNode[], parentId: string | null, branchKey: string | null) {
  return nodes
    .filter((n) => n.parentId === parentId && (n.branchKey ?? null) === branchKey)
    .sort((a, b) => a.position - b.position);
}

/**
 * Decide the next step after `fromNodeId` (null = start of the workflow).
 *
 * Branch nodes are resolved internally — they have no side effect, so the engine
 * keeps descending until it reaches something worth doing, a suspension, or the
 * end of the graph. The caller only ever sees executable work.
 */
export function nextStep(
  nodes: WorkflowNode[],
  fromNodeId: string | null,
  ctx: EvalContext
): EngineStep {
  const all = nodes ?? [];
  let cursor = fromNodeId;
  const seen = new Set<string>();

  for (let i = 0; i < MAX_TRAVERSAL; i++) {
    const next = childrenOf(all, cursor, null)[0];
    if (!next) return { type: 'done' };

    if (seen.has(next.id)) {
      return { type: 'blocked', reason: 'Workflow contains a loop; stopped to avoid repeating.' };
    }
    seen.add(next.id);

    if (next.kind === 'branch') {
      const conditions = (next.config?.conditions ?? []) as Condition[];
      const took = evaluateConditions(conditions, ctx) ? 'match' : 'no_match';
      const branchChild = childrenOf(all, next.id, took)[0];
      if (!branchChild) return { type: 'done' };
      if (seen.has(branchChild.id)) {
        return { type: 'blocked', reason: 'Workflow contains a loop; stopped to avoid repeating.' };
      }
      // Descend into the chosen branch and re-evaluate from there.
      const step = stepFor(branchChild, ctx);
      if (step) return step;
      seen.add(branchChild.id);
      cursor = branchChild.id;
      continue;
    }

    const step = stepFor(next, ctx);
    if (step) return step;
    cursor = next.id;
  }

  return { type: 'blocked', reason: 'Workflow is too deep; stopped after 200 steps.' };
}

/** A node either suspends the run, or is executable work. */
function stepFor(node: WorkflowNode, ctx: EvalContext): EngineStep | null {
  if (node.kind === 'wait_reply') {
    const days = Number(node.config?.timeoutDays ?? 7);
    const ms = Number.isFinite(days) && days > 0 ? days * 24 * 60 * 60 * 1000 : null;
    return {
      type: 'suspend',
      reason: 'wait_reply',
      untilMs: ms === null ? null : ctx.now.getTime() + ms,
      node,
    };
  }

  if (node.kind === 'wait') {
    const minutes = Number(node.config?.minutes ?? 0);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      // A zero-length wait is a no-op, not an error — fall through to the next
      // node rather than suspending for nothing.
      return null;
    }
    return {
      type: 'suspend',
      reason: 'wait',
      untilMs: ctx.now.getTime() + minutes * 60 * 1000,
      node,
    };
  }

  if (node.kind === 'generate_ai_response') {
    // Registered so a workflow can be authored against it, but nothing depends
    // on it. Skip rather than fail the run.
    return null;
  }

  return { type: 'action', node };
}

/**
 * Variables available to templates on this step.
 *
 * Contact fields are the base layer, run variables win over them, and the
 * event's own facts win over both — a flow should always be able to say
 * {{comment_text}} and get THIS comment, not a stale one.
 */
export function buildVariables(ctx: EvalContext): Record<string, string> {
  const handle = ctx.event.fromHandle || '';
  return {
    ...(ctx.contact?.fields ?? {}),
    ...ctx.variables,
    handle,
    username: handle,
    // Best-effort display name. Never invent one: an empty string renders as
    // nothing, which reads better than "Hi there friend".
    first_name: (ctx.contact?.fields?.first_name || '').split(' ')[0] || '',
    comment_text: ctx.event.text || '',
    message_text: ctx.event.text || '',
    channel: ctx.event.channel,
  };
}
