/**
 * Channel capability registry — the contract that makes "channel-agnostic" real.
 *
 * The engine never assumes a platform can do something. It asks here, and a
 * workflow that references an unsupported capability fails validation AT SAVE
 * TIME with a plain reason, rather than silently doing nothing at 3am.
 *
 * Every figure below was verified against vendor documentation on 2026-08-02.
 * See docs/superpowers/specs/2026-08-02-automation-module-design.md.
 */

import { ActionKind, ChannelKey, TriggerKind } from './automation.types';

export interface ChannelCapabilities {
  channel: ChannelKey;
  label: string;
  /** False = the platform offers no automation API at all. UI greys it out. */
  automatable: boolean;
  /** Shown verbatim to the user when automatable is false. */
  unavailableReason?: string;
  triggers: TriggerKind[];
  actions: ActionKind[];
  /** Scopes an integration must hold. Missing ones become a re-authorize prompt. */
  requiredScopes: string[];
  /** Scopes needed only for the messaging half — gated on Meta App Review. */
  messagingScopes: string[];
  /** ms the platform lets us send freely after an inbound message. 0 = no window. */
  messagingWindowMs: number;
  privateReply?: {
    /** ms after the comment during which one private reply may be sent. */
    windowMs: number;
    /** Private replies permitted per comment, for all time. */
    maxPerComment: number;
    /** Does sending one open the messaging window? */
    opensMessagingWindow: boolean;
  };
}

const DAY = 24 * 60 * 60 * 1000;

const INSTAGRAM: ChannelCapabilities = {
  channel: 'instagram',
  label: 'Instagram',
  automatable: true,
  triggers: ['comment', 'direct_message', 'story_mention', 'keyword', 'manual'],
  actions: [
    'send_dm',
    'reply_comment',
    'send_template',
    'wait',
    'wait_reply',
    'branch',
    'collect_field',
    'create_lead',
    'create_task',
    'notify_team',
    'assign_manager',
    'call_webhook',
    'add_tag',
    'delay_until',
    'business_hours',
    'split',
    'merge',
    'goto',
    'exit',
    'ai_reply',
    'ai_qualify',
    'ai_translate',
    'ai_summarize',
  ],
  requiredScopes: ['instagram_business_basic', 'instagram_business_manage_comments'],
  messagingScopes: ['instagram_business_manage_messages'],
  messagingWindowMs: DAY,
  privateReply: {
    // 7 days from comment creation. Instagram Live is stricter (broadcast only)
    // and is not a supported trigger, so the simple figure is honest here.
    windowMs: 7 * DAY,
    // One. Ever. Not per day. Burning it on a duplicate webhook delivery means
    // that lead can never be reached again — which is why ingress dedupes.
    maxPerComment: 1,
    // It does NOT open a window. The contact must reply before we may send again.
    opensMessagingWindow: false,
  },
};

const FACEBOOK: ChannelCapabilities = {
  channel: 'facebook',
  label: 'Facebook',
  automatable: true,
  triggers: ['comment', 'direct_message', 'keyword', 'manual'],
  actions: [...INSTAGRAM.actions],
  requiredScopes: ['pages_manage_metadata', 'pages_read_engagement', 'pages_show_list'],
  messagingScopes: ['pages_messaging'],
  messagingWindowMs: DAY,
  privateReply: { windowMs: 7 * DAY, maxPerComment: 1, opensMessagingWindow: false },
};

const WHATSAPP: ChannelCapabilities = {
  channel: 'whatsapp',
  label: 'WhatsApp',
  automatable: true,
  // No comment concept on WhatsApp — offering one would be a dead trigger.
  triggers: ['direct_message', 'keyword', 'form_submission', 'webhook', 'manual'],
  actions: [
    'send_dm',
    'send_template',
    'wait',
    'wait_reply',
    'branch',
    'collect_field',
    'create_lead',
    'create_task',
    'notify_team',
    'assign_manager',
    'call_webhook',
    'add_tag',
    'delay_until',
    'business_hours',
    'split',
    'merge',
    'goto',
    'exit',
    'ai_reply',
    'ai_qualify',
    'ai_translate',
    'ai_summarize',
  ],
  requiredScopes: ['whatsapp_business_messaging'],
  messagingScopes: ['whatsapp_business_messaging'],
  // Outside this window only pre-approved templates may be sent.
  messagingWindowMs: DAY,
};

const WEBSITE: ChannelCapabilities = {
  channel: 'website',
  label: 'Website Chat',
  automatable: true,
  triggers: ['direct_message', 'keyword', 'form_submission', 'webhook', 'manual'],
  actions: [...WHATSAPP.actions],
  requiredScopes: [],
  messagingScopes: [],
  // We own this surface, so there is no platform-imposed window.
  messagingWindowMs: 0,
};

/**
 * TikTok and LinkedIn are registered precisely so the UI can show them as
 * unavailable WITH the reason, instead of pretending or omitting them.
 */
const TIKTOK: ChannelCapabilities = {
  channel: 'tiktok',
  label: 'TikTok',
  automatable: false,
  unavailableReason:
    'TikTok has no public API for reading, replying to, or moderating comments, and exposes no direct-message API at all. Comment data is available only through the Research API, restricted to approved academic researchers. Automation is not possible today.',
  triggers: [],
  actions: [],
  requiredScopes: [],
  messagingScopes: [],
  messagingWindowMs: 0,
};

const LINKEDIN: ChannelCapabilities = {
  channel: 'linkedin',
  label: 'LinkedIn',
  automatable: false,
  unavailableReason:
    'LinkedIn has no general messaging API — the partner-only Messages API requires a non-automated member action for every message, which cannot be driven by a workflow. The Comments API exists but sits behind the Community Management API, which is restricted to registered organizations under a two-tier review.',
  triggers: [],
  actions: [],
  requiredScopes: [],
  messagingScopes: [],
  messagingWindowMs: 0,
};

const REGISTRY: Record<ChannelKey, ChannelCapabilities> = {
  instagram: INSTAGRAM,
  facebook: FACEBOOK,
  whatsapp: WHATSAPP,
  website: WEBSITE,
  tiktok: TIKTOK,
  linkedin: LINKEDIN,
};

export function capabilitiesFor(channel: ChannelKey): ChannelCapabilities | null {
  return REGISTRY[channel] ?? null;
}

export function allCapabilities(): ChannelCapabilities[] {
  return Object.values(REGISTRY);
}

/** Actions that cannot run without the messaging scopes / an open window. */
const MESSAGING_ACTIONS: ActionKind[] = ['send_dm', 'send_template', 'wait_reply'];

/**
 * Nodes that need an AI provider. They are offered and saveable, but the engine
 * skips them until a router exists — an author should be able to lay out the
 * flow they want before the capability lands.
 */
export const AI_ACTIONS: ActionKind[] = [
  'ai_reply',
  'ai_qualify',
  'ai_translate',
  'ai_summarize',
  'generate_ai_response',
];

export function isMessagingAction(kind: ActionKind): boolean {
  return MESSAGING_ACTIONS.includes(kind);
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

/**
 * Validate a workflow against what its channel can actually do.
 *
 * `grantedScopes` is what the connected integration really holds. Missing
 * messaging scopes are a WARNING, not an error: the owner should be able to
 * build and save the DM half while Meta App Review is pending, and have it start
 * working the moment access is granted — without editing the workflow.
 */
export function validateWorkflow(
  workflow: { channel: ChannelKey; trigger: TriggerKind; nodeKinds: ActionKind[] },
  grantedScopes: string[] = []
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const caps = capabilitiesFor(workflow.channel);

  if (!caps) {
    return [{ level: 'error', message: `Unknown channel "${workflow.channel}".` }];
  }

  if (!caps.automatable) {
    return [
      {
        level: 'error',
        message: `${caps.label} does not support automation. ${caps.unavailableReason}`,
      },
    ];
  }

  if (!caps.triggers.includes(workflow.trigger)) {
    issues.push({
      level: 'error',
      message: `${caps.label} does not support the "${workflow.trigger}" trigger.`,
    });
  }

  for (const kind of new Set(workflow.nodeKinds)) {
    if (AI_ACTIONS.includes(kind)) {
      issues.push({
        level: 'warning',
        message:
          'AI responses are not enabled yet. This step will be skipped and the flow will continue.',
      });
      continue;
    }
    if (!caps.actions.includes(kind)) {
      issues.push({
        level: 'error',
        message: `${caps.label} does not support the "${kind}" action.`,
      });
    }
  }

  const missing = caps.requiredScopes.filter((s) => !grantedScopes.includes(s));
  if (grantedScopes.length && missing.length) {
    issues.push({
      level: 'error',
      message: `This account is missing ${missing.join(
        ', '
      )}. Reconnect it to grant the missing permissions.`,
    });
  }

  const usesMessaging = workflow.nodeKinds.some(isMessagingAction);
  const missingMessaging = caps.messagingScopes.filter((s) => !grantedScopes.includes(s));
  if (usesMessaging && grantedScopes.length && missingMessaging.length) {
    issues.push({
      level: 'warning',
      message: `Direct messaging needs ${missingMessaging.join(
        ', '
      )}, which requires Meta App Review (Advanced Access). You can save this workflow now — the messaging steps will start running as soon as access is granted and the account is reconnected.`,
    });
  }

  return issues;
}

/**
 * Can we send a private reply to this comment right now?
 *
 * Returns a reason rather than a bare false, because "you already used the one
 * private reply this comment ever gets" and "this comment is 8 days old" need
 * very different responses from a human reading the run log.
 */
export function canPrivateReply(
  channel: ChannelKey,
  opts: { commentCreatedAtMs: number; nowMs: number; alreadySent: number }
): { ok: boolean; reason?: string } {
  // One flat shape rather than a discriminated union: the backend tsconfig runs
  // without strictNullChecks, which degrades boolean-literal narrowing, so
  // `if (!r.ok) use(r.reason)` fails to compile at every call site.
  const caps = capabilitiesFor(channel);
  if (!caps?.privateReply) {
    return { ok: false, reason: `${caps?.label ?? channel} does not support private replies.` };
  }
  if (opts.alreadySent >= caps.privateReply.maxPerComment) {
    return {
      ok: false,
      reason: `A private reply was already sent for this comment. ${caps.label} permits only ${caps.privateReply.maxPerComment} per comment, ever.`,
    };
  }
  const age = opts.nowMs - opts.commentCreatedAtMs;
  if (age > caps.privateReply.windowMs) {
    const days = Math.round(caps.privateReply.windowMs / DAY);
    return {
      ok: false,
      reason: `This comment is older than the ${days}-day private reply window.`,
    };
  }
  if (age < 0) {
    return { ok: false, reason: 'Comment timestamp is in the future; refusing to send.' };
  }
  return { ok: true };
}

/** Is the free-form messaging window still open? */
export function isMessagingWindowOpen(
  channel: ChannelKey,
  lastInboundAtMs: number | null,
  nowMs: number
): boolean {
  const caps = capabilitiesFor(channel);
  if (!caps) return false;
  // 0 means the platform imposes no window (our own website chat).
  if (caps.messagingWindowMs === 0) return true;
  if (!lastInboundAtMs) return false;
  return nowMs - lastInboundAtMs < caps.messagingWindowMs;
}
