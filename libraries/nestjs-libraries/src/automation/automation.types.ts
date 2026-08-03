/**
 * Automation module — canonical types.
 *
 * Everything the engine reasons about is expressed here, and none of it mentions
 * a specific platform. Instagram lives in an adapter; the engine only ever sees
 * an AutomationEventInput and a ChannelKey.
 */

export type ChannelKey =
  | 'instagram'
  | 'facebook'
  | 'whatsapp'
  | 'website'
  | 'tiktok'
  | 'linkedin';

export type TriggerKind =
  | 'comment'
  | 'direct_message'
  | 'story_mention'
  | 'keyword'
  | 'form_submission'
  | 'webhook'
  | 'manual';

export type ActionKind =
  | 'send_dm'
  | 'reply_comment'
  | 'send_template'
  | 'wait'
  | 'wait_reply'
  | 'branch'
  | 'collect_field'
  | 'create_lead'
  | 'create_task'
  | 'notify_team'
  | 'assign_manager'
  | 'call_webhook'
  | 'add_tag'
  // Flow control. Real engine behaviour, buildable and testable today.
  | 'delay_until'
  | 'business_hours'
  | 'split'
  | 'merge'
  | 'goto'
  | 'exit'
  // AI nodes. Registered so a workflow can be authored against them, but they
  // report themselves unavailable until an AI provider/router exists. Same
  // honest pattern as TikTok declaring zero capability rather than pretending.
  | 'ai_reply'
  | 'ai_qualify'
  | 'ai_translate'
  | 'ai_summarize'
  | 'generate_ai_response';

/**
 * "New follower" is deliberately absent from TriggerKind.
 *
 * No platform we support exposes a follower webhook — not Instagram, not
 * Facebook. Listing it in the UI would produce a trigger that silently never
 * fires, which is worse than not offering it. If a platform ships one, it is a
 * one-line addition here plus a capability flag.
 */

export interface AutomationEventInput {
  channel: ChannelKey;
  kind: 'comment' | 'message' | 'story_mention' | 'form' | 'webhook' | 'manual';
  /** Platform's own id for this event. The ingress dedupe key. */
  externalId: string;
  /** Platform account that received it (IG user id). Maps to an Integration. */
  accountId?: string | null;
  /** Author's platform id — who we would reply to. */
  fromId?: string | null;
  fromHandle?: string | null;
  text?: string | null;
  /** Platform id of the media the comment sits on. */
  externalPostId?: string | null;
  /** Present only for comment events; the handle for a private reply. */
  commentId?: string | null;
  /** Platform timestamp in ms. Used for the private-reply 7-day window. */
  timestamp?: number | null;
  raw?: unknown;
}

export type Condition =
  | { kind: 'keyword'; match: 'equals' | 'contains' | 'regex'; values: string[] }
  | { kind: 'language'; values: string[] }
  | { kind: 'platform'; values: ChannelKey[] }
  | { kind: 'campaign'; campaignIds: string[] }
  | { kind: 'specific_post'; postIds: string[] }
  | {
      kind: 'business_hours';
      timezone: string;
      /** 0=Sunday … 6=Saturday */
      days: number[];
      start: string;
      end: string;
      /** true = fire INSIDE hours, false = fire OUTSIDE them */
      inside?: boolean;
    }
  | { kind: 'customer_type'; values: Array<'new' | 'returning' | 'lead' | 'customer'> }
  | { kind: 'tags'; mode: 'any' | 'all' | 'none'; values: string[] }
  | {
      kind: 'variable';
      name: string;
      op: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'exists' | 'not_exists';
      value?: string;
    };

export interface ContactSnapshot {
  tags: string[];
  fields: Record<string, string>;
  createdAt?: Date | null;
  /** Has this contact been pushed to the CRM as a lead already? */
  isLead?: boolean;
  /** Interactions before this event. 0 = first contact. */
  priorConversations?: number;
  optedOutAt?: Date | null;
}

export interface EvalContext {
  event: AutomationEventInput;
  contact?: ContactSnapshot | null;
  variables: Record<string, string>;
  now: Date;
  campaignId?: string | null;
  /** Mapped Out Post.id resolved from event.externalPostId, if bound. */
  postId?: string | null;
  language?: string | null;
}

export interface WorkflowNode {
  id: string;
  parentId: string | null;
  /** Which edge out of the parent this node hangs off. null = the default path. */
  branchKey: string | null;
  kind: ActionKind;
  config: Record<string, any>;
  position: number;
}

export interface WorkflowSummary {
  id: string;
  orgId: string;
  customerId: string | null;
  channel: ChannelKey;
  trigger: TriggerKind;
  triggerConfig: Record<string, any>;
  conditions: Condition[];
  status: string;
  /** Platform post ids this workflow is bound to. Empty = every post. */
  boundExternalPostIds?: string[];
  /**
   * How many post bindings exist at all, resolved or not.
   *
   * A binding is created at compose time with only our own Post.id; the
   * platform's media id arrives when the post publishes. Without this count the
   * two states are indistinguishable, and a workflow scoped to one post would
   * fire on EVERY post until its binding resolved.
   */
  boundPostCount?: number;
}

/** What the engine decided to do next. */
export type EngineStep =
  | { type: 'action'; node: WorkflowNode }
  | { type: 'suspend'; reason: 'wait_reply' | 'wait'; untilMs: number | null; node: WorkflowNode }
  | { type: 'done' }
  | { type: 'blocked'; reason: string };
