import { Injectable, Logger } from '@nestjs/common';
import { AutomationRepository, WorkflowWrite } from './automation.repository';
import {
  ActionKind,
  AutomationEventInput,
  ChannelKey,
  Condition,
  EvalContext,
  WorkflowNode,
  WorkflowSummary,
} from '@gitroom/nestjs-libraries/automation/automation.types';
import {
  buildVariables,
  matchWorkflows,
  nextStep,
} from '@gitroom/nestjs-libraries/automation/automation.engine';
import { renderTemplate } from '@gitroom/nestjs-libraries/automation/automation.matching';
import {
  canPrivateReply,
  capabilitiesFor,
  validateWorkflow,
} from '@gitroom/nestjs-libraries/automation/automation.capabilities';
import {
  fetchInstagramMedia,
  fetchInstagramProfile,
  fetchSubscriptions,
  replyToComment,
  sendDirectMessage,
  sendPrivateReply,
  subscribeAccount,
  InstagramMedia,
} from '@gitroom/nestjs-libraries/automation/channels/instagram.channel';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import {
  TEMPLATES,
  templateByKey,
  templatesForChannel,
} from '@gitroom/nestjs-libraries/automation/automation.templates';
import { randomUUID } from 'crypto';

/**
 * A provider identifier is not a channel: `instagram-standalone` and
 * `instagram` are two ways to connect the same place, and workflows target the
 * channel. Anything unrecognised falls through to its own name so a new
 * provider shows up as unsupported rather than silently becoming Instagram.
 */
const PROVIDER_CHANNEL: Record<string, string> = {
  'instagram-standalone': 'instagram',
  instagram: 'instagram',
  facebook: 'facebook',
  threads: 'threads',
  tiktok: 'tiktok',
  linkedin: 'linkedin',
  'linkedin-page': 'linkedin',
};

export function channelForProvider(provider: string): string {
  return PROVIDER_CHANNEL[provider] ?? provider;
}

/** Integration.profile holds the handle for most providers. */
function parseUsername(profile?: string | null): string | null {
  if (!profile) return null;
  try {
    const parsed = JSON.parse(profile);
    return parsed?.username ?? parsed?.handle ?? null;
  } catch {
    // Most providers store it as a bare string, not JSON.
    return typeof profile === 'string' ? profile : null;
  }
}

const json = (v: any, fallback: any) => {
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

interface StepLog {
  node: string;
  kind: string;
  ok: boolean;
  detail?: string;
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  /**
   * Instagram media cache, keyed by integration.
   *
   * In-memory and 2 minutes on purpose. A DB table would need invalidation
   * rules, a migration and a cleanup job to solve a problem that is really just
   * "don't call Graph twice a second while someone scrolls a grid".
   *
   * ponytail: per-process. If the API is ever scaled past one instance this
   * becomes N caches, which is still correct, just less effective — move it to
   * Redis then, not before.
   */
  private static mediaCache = new Map<string, { at: number; posts: InstagramMedia[] }>();

  constructor(
    private _repo: AutomationRepository,
    private _notifications: NotificationService
  ) {}

  // ---------------------------------------------------------------- CRUD

  list(orgId: string, customerId?: string | null) {
    return this._repo.list(orgId, customerId);
  }

  getOne(orgId: string, id: string) {
    return this._repo.getOne(orgId, id);
  }

  create(orgId: string, userId: string | null, body: WorkflowWrite) {
    return this._repo.create(orgId, userId, body);
  }

  update(orgId: string, id: string, body: WorkflowWrite) {
    return this._repo.update(orgId, id, body);
  }

  remove(orgId: string, id: string) {
    return this._repo.remove(orgId, id);
  }

  saveGraph(orgId: string, workflowId: string, nodes: any[]) {
    return this._repo.replaceNodes(workflowId, nodes);
  }

  setBindings(
    orgId: string,
    workflowId: string,
    externalPostIds: string[],
    legacyPostIds: string[] = []
  ) {
    return this._repo.setBindings(orgId, workflowId, externalPostIds, legacyPostIds);
  }

  runs(orgId: string, workflowId?: string) {
    return this._repo.runsFor(orgId, workflowId);
  }

  stats(orgId: string, workflowId?: string) {
    return this._repo.statsFor(orgId, workflowId);
  }

  // ------------------------------------------------------------------- leads

  leads(orgId: string, filters: any) {
    return this._repo.listLeads(orgId, filters);
  }

  lead(orgId: string, id: string) {
    return this._repo.getLead(orgId, id);
  }

  updateLead(orgId: string, id: string, patch: any, actorId?: string) {
    // Attribution columns are write-once. Accepting them here would let a
    // careless PATCH rewrite where a lead came from, which is the one thing
    // this record exists to remember.
    const {
      sourcePlatform, sourceAccountId, sourceAccountName, sourceWorkflowId,
      sourceWorkflowName, sourceCampaignId, sourceKeyword, sourceComment,
      sourceConversationId, sourceScope, sourcePostId, sourcePostThumbnail,
      sourcePostCaption, sourcePostUrl, sourcePostDate, orgId: _o, id: _i,
      ...safe
    } = patch ?? {};
    return this._repo.updateLead(orgId, id, safe, actorId);
  }

  /**
   * Connected accounts with their automation counts, for the landing page.
   *
   * A provider identifier is not a channel — `instagram-standalone` and
   * `instagram` are two different connections to the same channel, and a
   * workflow targets the channel. Mapping here keeps that knowledge in one place.
   */
  async accounts(orgId: string) {
    const [integrations, workflows, lastRuns] = await Promise.all([
      this._repo.connectedIntegrations(orgId),
      this._repo.list(orgId, undefined),
      this._repo.lastRunsByWorkflow(orgId),
    ]);

    const lastRunBy = new Map(
      (lastRuns ?? []).map((r: any) => [r.workflowId, r._max?.startedAt ?? null])
    );

    return integrations.map((i: any) => {
      const channel = channelForProvider(i.providerIdentifier);
      const caps = capabilitiesFor(channel as ChannelKey);

      // A workflow belongs to this account when the channel matches and it is
      // either org-wide or scoped to the same client.
      const mine = (workflows ?? []).filter(
        (w: any) =>
          w.channel === channel && (!w.customerId || w.customerId === i.customerId)
      );

      const lastRun = mine
        .map((w: any) => lastRunBy.get(w.id))
        .filter(Boolean)
        .sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime())[0];

      const active = mine.filter((w: any) => w.status === 'active').length;

      return {
        integrationId: i.id,
        name: i.name,
        picture: i.picture,
        username: parseUsername(i.profile),
        provider: i.providerIdentifier,
        channel,
        customerId: i.customerId,
        customerName: i.customer?.name ?? null,
        automations: mine.length,
        activeAutomations: active,
        lastRunAt: lastRun ?? null,
        automatable: !!caps?.automatable,
        unavailableReason: caps?.unavailableReason ?? null,
        // Health is deliberately about things the user can fix, not internals.
        health: i.disabled
          ? 'disabled'
          : i.refreshNeeded
          ? 'reconnect'
          : !caps?.automatable
          ? 'unsupported'
          : active > 0
          ? 'running'
          : 'idle',
      };
    });
  }

  templates(channel?: string) {
    return channel ? templatesForChannel(channel as ChannelKey) : TEMPLATES;
  }

  /**
   * The connected account's real Instagram posts.
   *
   * Deliberately NOT our own Post table: posts published before the account was
   * connected, or straight from the Instagram app, exist only on Instagram. The
   * picker has to show what the user actually sees on their profile.
   *
   * Cached briefly in memory — opening the picker should not hammer Graph, but
   * a new post must show up without anyone clearing anything.
   */
  async instagramPosts(orgId: string, integrationId: string, force = false) {
    const integration = await this._repo.integrationById(orgId, integrationId);
    if (!integration) return null;

    const key = integration.id;
    const cached = AutomationService.mediaCache.get(key);
    if (!force && cached && Date.now() - cached.at < 120_000) {
      return { posts: cached.posts, cached: true };
    }

    try {
      const posts = await fetchInstagramMedia(integration.internalId, integration.token, 50);
      AutomationService.mediaCache.set(key, { at: Date.now(), posts });
      return { posts, cached: false };
    } catch (e: any) {
      // Serve a stale list rather than an empty one: an expired token should
      // not make the user's posts appear to vanish.
      if (cached) {
        return { posts: cached.posts, cached: true, error: e?.message ?? 'Instagram error' };
      }
      return { posts: [], cached: false, error: e?.message ?? 'Instagram error' };
    }
  }

  /**
   * End-to-end readiness for one account, in the order things actually fail.
   *
   * Each stage is checked against the live Instagram API using the stored
   * token, so this answers "is the token stored correctly", "is this account
   * subscribed", and "have any events arrived" with evidence rather than
   * configuration.
   */
  async diagnostics(orgId: string, integrationId: string) {
    const integration = await this._repo.integrationById(orgId, integrationId);
    if (!integration) return null;

    const out: any = {
      account: {
        id: integration.id,
        name: integration.name,
        platformId: integration.internalId,
        provider: integration.providerIdentifier,
        disabled: integration.disabled,
        refreshNeeded: integration.refreshNeeded,
      },
      token: { stored: !!integration.token, valid: false, detail: null as string | null },
      media: { readable: false, count: 0, detail: null as string | null },
      subscription: { subscribed: false, fields: [] as string[], detail: null as string | null },
      events: { received: 0, lastAt: null as string | null, lastKind: null as string | null },
    };

    if (!integration.token) {
      out.token.detail = 'No access token stored. Reconnect the account.';
      return out;
    }

    try {
      const me = await fetchInstagramProfile(integration.token);
      out.token.valid = true;
      out.token.detail = `Token belongs to @${me?.username ?? 'unknown'}`;
      out.account.username = me?.username ?? null;
      out.account.mediaCount = me?.media_count ?? null;
    } catch (e: any) {
      out.token.detail = e?.message ?? 'Token rejected by Instagram';
      // Everything below needs a working token; stop rather than emit three
      // more identical failures that all mean the same thing.
      return out;
    }

    try {
      const posts = await fetchInstagramMedia(integration.internalId, integration.token, 25);
      out.media.readable = true;
      out.media.count = posts.length;
      out.media.detail =
        posts.length === 0 ? 'Token works, but this account has no posts.' : null;
    } catch (e: any) {
      out.media.detail = e?.message ?? 'Could not read media';
    }

    try {
      const subs = await fetchSubscriptions(integration.internalId, integration.token);
      const fields = (subs?.data ?? []).flatMap((d: any) =>
        (d?.subscribed_fields ?? []).map((f: any) => (typeof f === 'string' ? f : f?.name))
      );
      out.subscription.fields = fields.filter(Boolean);
      out.subscription.subscribed = out.subscription.fields.length > 0;
      if (!out.subscription.subscribed) {
        out.subscription.detail =
          'This account is not subscribed to any webhook fields yet. Verifying the callback in Meta does not subscribe an account — use Subscribe below.';
      }
    } catch (e: any) {
      out.subscription.detail = e?.message ?? 'Could not read subscriptions';
    }

    const recent = await this._repo.recentEventsForIntegration(integration.id, 1);
    const total = await this._repo.countEventsForIntegration(integration.id);
    out.events.received = total;
    out.events.lastAt = recent[0]?.createdAt ?? null;
    out.events.lastKind = recent[0]?.kind ?? null;

    return out;
  }

  /** Subscribe this account to the webhook fields the automations need. */
  async subscribe(orgId: string, integrationId: string) {
    const integration = await this._repo.integrationById(orgId, integrationId);
    if (!integration) return null;
    const res = await subscribeAccount(integration.internalId, integration.token, [
      'comments',
      'messages',
    ]);
    return { ok: res.ok, detail: res.ok ? 'Subscribed.' : res.error };
  }

  /**
   * Create a workflow from a template.
   *
   * The template's steps are written as ordinary nodes, so a templated
   * automation is indistinguishable from a hand-built one the moment it exists
   * — there is no "template mode" for the engine to special-case.
   */
  async createFromTemplate(
    orgId: string,
    userId: string | null,
    body: { templateKey: string; channel: string; customerId?: string | null; name?: string }
  ) {
    const tpl = templateByKey(body.templateKey);
    if (!tpl) return null;

    const workflow = await this._repo.create(orgId, userId, {
      name: body.name || tpl.name,
      description: tpl.description,
      channel: body.channel || tpl.channels[0],
      trigger: tpl.trigger,
      status: 'draft',
      customerId: body.customerId ?? null,
      conditions: tpl.keywords?.length
        ? [{ kind: 'keyword', match: 'equals', values: tpl.keywords }]
        : [],
    });

    if (tpl.nodes.length) {
      // Linear chain: each node's parent is the one before it. Branch children
      // hang off the nearest preceding branch node instead.
      const ids = tpl.nodes.map(() => randomUUID());
      let lastMainId: string | null = null;
      let lastBranchId: string | null = null;

      const nodes = tpl.nodes.map((n, i) => {
        const branchKey = n.branchKey ?? null;
        const parentId = branchKey ? lastBranchId : lastMainId;
        if (n.kind === 'branch') lastBranchId = ids[i];
        if (!branchKey) lastMainId = ids[i];
        return {
          id: ids[i],
          parentId,
          branchKey,
          kind: n.kind,
          config: n.config ?? {},
          position: i,
        };
      });

      await this._repo.replaceNodes(workflow.id, nodes);
    }

    return this._repo.getOne(orgId, workflow.id);
  }

  events(orgId: string) {
    return this._repo.recentEvents(orgId);
  }

  /**
   * Validate before activating.
   *
   * A workflow can be SAVED in any state — half-built drafts are normal. It can
   * only be ACTIVATED if the channel actually supports every step, so the
   * failure surfaces to a human at the moment they turn it on rather than
   * silently at 3am when a comment arrives.
   */
  async validate(orgId: string, workflowId: string, grantedScopes: string[] = []) {
    const wf = await this._repo.getOne(orgId, workflowId);
    if (!wf) return null;
    return validateWorkflow(
      {
        channel: wf.channel as ChannelKey,
        trigger: wf.trigger as any,
        nodeKinds: (wf.nodes ?? []).map((n: any) => n.kind as ActionKind),
      },
      grantedScopes
    );
  }

  async setStatus(orgId: string, workflowId: string, status: string) {
    if (status === 'active') {
      const issues = (await this.validate(orgId, workflowId)) ?? [];
      const errors = issues.filter((i) => i.level === 'error');
      if (errors.length) {
        return { ok: false as const, issues: errors };
      }
    }
    const updated = await this._repo.update(orgId, workflowId, { status });
    return { ok: true as const, workflow: updated };
  }

  // ------------------------------------------------------------- ingestion

  /**
   * Entry point for every inbound platform event.
   *
   * Deliberately never throws: the webhook controller has already answered 200,
   * and one malformed event must not stop the rest of a batched delivery.
   */
  async ingest(event: AutomationEventInput): Promise<void> {
    let eventId = '';
    try {
      const integration = event.accountId
        ? await this._repo.integrationByExternalAccount(
            event.channel === 'instagram' ? 'instagram-standalone' : event.channel,
            event.accountId
          )
        : null;

      const recorded = await this._repo.recordEvent(event, {
        orgId: integration?.organizationId ?? null,
        integrationId: integration?.id ?? null,
      });
      eventId = recorded.id;

      // A retried delivery. Doing nothing here is the entire point of the
      // unique index: a private reply is one-per-comment forever.
      if (recorded.duplicate) return;

      if (!integration) {
        await this._repo.markEventProcessed(
          eventId,
          `No connected account matches platform id ${event.accountId}.`
        );
        return;
      }

      await this.route(event, eventId, integration);
      await this._repo.markEventProcessed(eventId, null);
    } catch (e: any) {
      this.logger.error(`automation ingest failed: ${e?.message}`, e?.stack);
      if (eventId) {
        await this._repo.markEventProcessed(eventId, e?.message ?? 'unknown error').catch(() => {});
      }
    }
  }

  private async route(event: AutomationEventInput, eventId: string, integration: any) {
    const orgId = integration.organizationId;
    const contact = event.fromId
      ? await this._repo.upsertContact(
          orgId,
          integration.customerId ?? null,
          event.channel,
          event.fromId,
          { handle: event.fromHandle ?? null }
        )
      : null;

    // An inbound message from someone we are already waiting on resumes their
    // conversation. It must NOT also start a fresh one, or a chatty contact ends
    // up in three parallel copies of the same flow.
    if (contact && event.kind === 'message') {
      const waiting = await this._repo.waitingConversationsFor(contact.id);
      if (waiting.length) {
        for (const conv of waiting) {
          await this.resume(conv, event, eventId, integration, contact);
        }
        return;
      }
    }

    const all = await this._repo.list(orgId, undefined);
    const bindings = await this._repo.bindingsForWorkflows(all.map((w: any) => w.id));

    const summaries: WorkflowSummary[] = all.map((w: any) => ({
      id: w.id,
      orgId: w.orgId,
      customerId: w.customerId,
      channel: w.channel,
      trigger: w.trigger,
      triggerConfig: json(w.triggerConfig, {}),
      conditions: json(w.conditions, []) as Condition[],
      status: w.status,
      boundExternalPostIds: bindings
        .filter((b: any) => b.workflowId === w.id && b.externalPostId)
        .map((b: any) => b.externalPostId as string),
      boundPostCount: bindings.filter((b: any) => b.workflowId === w.id).length,
    }));

    // A workflow scoped to a client only ever sees that client's channels.
    const scoped = summaries.filter(
      (w) => !w.customerId || w.customerId === (integration.customerId ?? null)
    );

    const ctx: Omit<EvalContext, 'event'> = {
      contact: contact
        ? {
            tags: json(contact.tags, []),
            fields: json(contact.fields, {}),
            createdAt: contact.createdAt,
            priorConversations: await this._repo.countPriorConversations(contact.id),
          }
        : null,
      variables: {},
      now: new Date(),
    };

    const matched = matchWorkflows(event, scoped, ctx);
    for (const wf of matched) {
      await this.startRun(wf, event, eventId, integration, contact, ctx);
    }
  }

  private async startRun(
    wf: WorkflowSummary,
    event: AutomationEventInput,
    eventId: string,
    integration: any,
    contact: any,
    ctx: Omit<EvalContext, 'event'>
  ) {
    if (!contact) return;

    // One conversation per comment. Guards against two workflows racing on the
    // same comment and both spending the single private reply.
    if (event.commentId) {
      const already = await this._repo.countPrivateRepliesForComment(wf.id, event.commentId);
      if (already > 0) return;
    }

    const run = await this._repo.createRun({
      orgId: wf.orgId,
      workflowId: wf.id,
      eventId,
    });

    let conversation;
    try {
      conversation = await this._repo.createConversation({
        orgId: wf.orgId,
        workflowId: wf.id,
        contactId: contact.id,
        sourceEventId: eventId,
        sourceCommentId: event.commentId ?? null,
      });
    } catch (e: any) {
      // Unique violation = another delivery of the same comment beat us here.
      if (e?.code === 'P2002') {
        await this._repo.finishRun(run.id, 'skipped', [], 'Already handled for this comment.');
        return;
      }
      throw e;
    }

    await this.execute(wf, conversation, run.id, event, integration, contact, ctx);
  }

  private async resume(
    conversation: any,
    event: AutomationEventInput,
    eventId: string,
    integration: any,
    contact: any
  ) {
    const wf = conversation.workflow;
    const summary: WorkflowSummary = {
      id: wf.id,
      orgId: wf.orgId,
      customerId: wf.customerId,
      channel: wf.channel,
      trigger: wf.trigger,
      triggerConfig: json(wf.triggerConfig, {}),
      conditions: json(wf.conditions, []),
      status: wf.status,
    };

    const run = await this._repo.createRun({
      orgId: wf.orgId,
      workflowId: wf.id,
      conversationId: conversation.id,
      eventId,
    });

    // Their reply opened the platform's messaging window; record when it shuts.
    const caps = capabilitiesFor(event.channel);
    await this._repo.updateConversation(conversation.id, {
      status: 'running',
      waitingSince: null,
      windowExpiresAt: caps?.messagingWindowMs
        ? new Date(Date.now() + caps.messagingWindowMs)
        : null,
    });

    const ctx: Omit<EvalContext, 'event'> = {
      contact: {
        tags: json(contact.tags, []),
        fields: json(contact.fields, {}),
        priorConversations: await this._repo.countPriorConversations(contact.id),
      },
      variables: json(conversation.variables, {}),
      now: new Date(),
    };

    await this.execute(summary, conversation, run.id, event, integration, contact, ctx);
  }

  // -------------------------------------------------------------- execution

  private async execute(
    wf: WorkflowSummary,
    conversation: any,
    runId: string,
    event: AutomationEventInput,
    integration: any,
    contact: any,
    baseCtx: Omit<EvalContext, 'event'>
  ) {
    const nodes: WorkflowNode[] = (await this._repo.nodesFor(wf.id)).map((n: any) => ({
      id: n.id,
      parentId: n.parentId,
      branchKey: n.branchKey,
      kind: n.kind as ActionKind,
      config: json(n.config, {}),
      position: n.position,
    }));

    const steps: StepLog[] = [];
    let cursor: string | null = conversation.cursorNodeId ?? null;
    let variables: Record<string, string> = { ...baseCtx.variables };

    // Bounded so a pathological graph cannot pin a worker. The engine already
    // detects loops; this is the belt to that pair of braces.
    for (let i = 0; i < 50; i++) {
      const ctx: EvalContext = { ...baseCtx, event, variables, now: new Date() };
      const step = nextStep(nodes, cursor, ctx);

      if (step.type === 'done') {
        await this._repo.updateConversation(conversation.id, {
          status: 'completed',
          cursorNodeId: cursor,
          variables,
        });
        await this._repo.finishRun(runId, 'completed', steps);
        return;
      }

      if (step.type === 'blocked') {
        await this._repo.updateConversation(conversation.id, { status: 'blocked', variables });
        await this._repo.finishRun(runId, 'blocked', steps, step.reason);
        return;
      }

      if (step.type === 'suspend') {
        await this._repo.updateConversation(conversation.id, {
          status: 'waiting',
          cursorNodeId: step.node.id,
          waitingSince: new Date(),
          expiresAt: step.untilMs ? new Date(step.untilMs) : null,
          variables,
        });
        steps.push({ node: step.node.id, kind: step.node.kind, ok: true, detail: 'waiting' });
        await this._repo.finishRun(runId, 'completed', steps, 'Waiting for a reply.');
        return;
      }

      const result = await this.runAction(
        step.node,
        { ...ctx, variables },
        { event, integration, contact, conversation, workflow: wf }
      );

      steps.push({
        node: step.node.id,
        kind: step.node.kind,
        ok: result.ok,
        detail: result.detail,
      });

      if (result.variables) variables = { ...variables, ...result.variables };

      if (!result.ok) {
        await this._repo.updateConversation(conversation.id, {
          status: 'blocked',
          cursorNodeId: step.node.id,
          variables,
        });
        await this._repo.finishRun(runId, 'blocked', steps, result.detail);
        return;
      }

      cursor = step.node.id;
    }

    await this._repo.finishRun(runId, 'blocked', steps, 'Stopped after 50 steps.');
  }

  /**
   * Execute one node.
   *
   * A failure returns ok:false with a human-readable reason rather than
   * throwing. "Instagram permits only 1 private reply per comment" belongs in
   * the run log where someone can read it, not in a stack trace.
   */
  private async runAction(
    node: WorkflowNode,
    ctx: EvalContext,
    env: {
      event: AutomationEventInput;
      integration: any;
      contact: any;
      conversation: any;
      workflow: WorkflowSummary;
    }
  ): Promise<{ ok: boolean; detail?: string; variables?: Record<string, string> }> {
    const vars = { ...buildVariables(ctx), ...ctx.variables };
    const text = renderTemplate(node.config?.message ?? node.config?.text ?? '', vars);
    const token = env.integration.token;
    const igUserId = env.integration.internalId;

    switch (node.kind) {
      case 'send_dm':
      case 'send_template': {
        if (!text) return { ok: false, detail: 'This step has no message text.' };

        // First contact after a comment must go out as a private reply — it is
        // the only way to open a thread with someone who has never DMed us.
        const viaComment = !!env.conversation?.sourceCommentId && !env.conversation?.windowExpiresAt;

        if (viaComment) {
          const allowed = canPrivateReply(env.event.channel, {
            commentCreatedAtMs: env.event.timestamp ?? Date.now(),
            nowMs: Date.now(),
            alreadySent: 0,
          });
          if (!allowed.ok) return { ok: false, detail: allowed.reason };

          const res = await sendPrivateReply(
            igUserId,
            token,
            env.conversation.sourceCommentId,
            text
          );
          return { ok: res.ok, detail: res.ok ? 'Private reply sent.' : res.error };
        }

        if (!env.contact?.externalId) {
          return { ok: false, detail: 'No recipient id for this contact.' };
        }
        const res = await sendDirectMessage(igUserId, token, env.contact.externalId, text);
        return { ok: res.ok, detail: res.ok ? 'Message sent.' : res.error };
      }

      case 'reply_comment': {
        if (!env.event.commentId) return { ok: false, detail: 'No comment to reply to.' };
        if (!text) return { ok: false, detail: 'This step has no reply text.' };
        const res = await replyToComment(env.event.commentId, token, text);
        return { ok: res.ok, detail: res.ok ? 'Comment reply posted.' : res.error };
      }

      case 'collect_field': {
        const field = node.config?.field;
        if (!field) return { ok: false, detail: 'This step has no field name.' };
        const value = (env.event.text ?? '').trim();
        if (!value) return { ok: true, detail: 'Nothing to store yet.' };
        await this._repo.mergeContactFields(env.contact.id, { [field]: value });
        return { ok: true, detail: `Saved ${field}.`, variables: { [field]: value } };
      }

      case 'add_tag': {
        const tags: string[] = node.config?.tags ?? [];
        if (!tags.length) return { ok: true, detail: 'No tags configured.' };
        await this._repo.mergeContactFields(env.contact.id, {}, tags);
        return { ok: true, detail: `Tagged ${tags.join(', ')}.` };
      }

      case 'create_lead': {
        await this._repo.mergeContactFields(env.contact.id, vars, ['lead']);

        // Attribution is captured HERE, once, at the moment the lead is born.
        // It cannot be reconstructed later: the post may be deleted, the
        // workflow renamed, the keyword changed. "Which post generated this
        // lead" is only answerable if we write it down now.
        const lead = await this.captureLead(node, ctx, env, vars);

        const pushed = await this.pushLeadToDbu(env, vars);
        return { ok: true, detail: lead ? `Lead captured. ${pushed}` : pushed };
      }

      case 'notify_team':
      case 'assign_manager': {
        const message = text || `New automation lead from @${vars.handle || 'a contact'}`;
        try {
          // In-app only. Email is deliberately off: a busy post can fire this
          // hundreds of times, and mailing the whole team per comment would be
          // the first thing anyone turns off. Make it an option when asked.
          await this._notifications.inAppNotification(
            env.workflow.orgId,
            'Automation',
            message,
            false
          );
          return { ok: true, detail: 'Team notified.' };
        } catch (e: any) {
          // A notification failure must not kill the lead we just captured.
          this.logger.warn(`automation notify failed: ${e?.message}`);
          return { ok: true, detail: `Lead captured; notification failed: ${e?.message}` };
        }
      }

      case 'call_webhook': {
        const url = node.config?.url;
        if (!url) return { ok: false, detail: 'This step has no URL.' };
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact: vars, workflowId: env.workflow.id }),
          });
          return { ok: res.ok, detail: res.ok ? 'Webhook called.' : `HTTP ${res.status}` };
        } catch (e: any) {
          return { ok: false, detail: e?.message ?? 'Webhook failed.' };
        }
      }

      case 'create_task':
        // Deliberately not wired to the Tasks module yet — see the spec's later
        // slices. Recording it as a no-op keeps the flow running.
        return { ok: true, detail: 'Task creation is not enabled yet; step skipped.' };

      default:
        return { ok: true, detail: `Unknown step "${node.kind}" skipped.` };
    }
  }

  /**
   * Write the lead plus an immutable snapshot of where it came from.
   *
   * The post details are COPIED, not joined. A join answers "what does that
   * post say now", which is the wrong question for attribution — the post can
   * be edited or deleted and the lead must still name it a year later.
   *
   * Best-effort: a lead that fails to file must never break the conversation
   * the contact is still having with us.
   */
  private async captureLead(
    node: WorkflowNode,
    ctx: EvalContext,
    env: any,
    vars: Record<string, string>
  ): Promise<boolean> {
    try {
      const workflow = await this._repo.getOne(env.workflow.orgId, env.workflow.id);
      const bindings = workflow?.bindings ?? [];
      const mediaId = env.event?.externalPostId ?? null;

      // Reuse the media cache rather than calling Graph mid-conversation: the
      // picker populated it, and a lead is not worth an extra round trip.
      let post: any = null;
      if (mediaId && env.integration?.id) {
        const cached = AutomationService.mediaCache.get(env.integration.id);
        post = (cached?.posts ?? []).find((p: any) => p.id === mediaId) ?? null;
      }

      const keyword = (() => {
        const kw = (workflow ? json(workflow.conditions, []) : []).find(
          (c: any) => c?.kind === 'keyword'
        );
        const values: string[] = kw?.values ?? [];
        const text = (env.event?.text ?? '').toLowerCase();
        // Which of the configured keywords actually fired, not just the first.
        return values.find((v) => text.includes(String(v).toLowerCase())) ?? values[0] ?? null;
      })();

      await this._repo.createLead({
        orgId: env.workflow.orgId,
        customerId: env.workflow.customerId ?? env.integration?.customerId ?? null,
        contactId: env.contact?.id ?? null,
        fullName: vars.first_name || vars.full_name || null,
        handle: env.contact?.handle ?? vars.handle ?? null,
        email: vars.email ?? null,
        phone: vars.phone ?? null,
        fields: vars,
        assignedUserId: node.config?.assignTo ?? null,

        sourcePlatform: env.event?.channel ?? null,
        sourceAccountId: env.integration?.id ?? null,
        sourceAccountName: env.integration?.name ?? null,
        sourceWorkflowId: env.workflow.id,
        sourceWorkflowName: workflow?.name ?? null,
        sourceKeyword: keyword,
        sourceComment: env.conversation?.sourceCommentId ? env.event?.text ?? null : null,
        sourceConversationId: env.conversation?.id ?? null,
        // How the automation was targeted, not how this one comment arrived.
        sourceScope: bindings.length ? 'specific_post' : 'all_posts',
        sourcePostId: mediaId,
        sourcePostThumbnail: post?.thumbnail ?? null,
        sourcePostCaption: post?.caption ?? null,
        sourcePostUrl: post?.permalink ?? null,
        sourcePostDate: post?.timestamp ? new Date(post.timestamp) : null,
      });

      return true;
    } catch (e: any) {
      this.logger.warn(`lead capture failed: ${e?.message}`);
      return false;
    }
  }

  /**
   * Push a qualified lead into DBU's CRM over the existing signed channel.
   *
   * Best-effort by design: the contact is already saved locally, so a DBU
   * outage (its deploys pause the DB for minutes at a time) must never lose the
   * lead or fail the flow.
   */
  private async pushLeadToDbu(env: any, vars: Record<string, string>): Promise<string> {
    const url = process.env.DBU_WEBHOOK_URL;
    const secret = process.env.DBU_INTEGRATION_SECRET;
    if (!url || !secret || !env.integration?.dbuClientId) {
      return 'Lead saved. DBU CRM push not configured for this client.';
    }

    try {
      const { createHmac } = await import('crypto');
      const body = {
        event: 'automation.lead',
        client_id: env.integration.dbuClientId,
        source: `automation:${env.workflow.id}`,
        contact: {
          handle: vars.handle ?? null,
          channel: env.event.channel,
          external_id: env.contact?.externalId ?? null,
          fields: vars,
        },
      };
      const ts = Date.now().toString();
      const canonical = (v: any): string =>
        v === null || typeof v !== 'object'
          ? JSON.stringify(v)
          : Array.isArray(v)
          ? '[' + v.map(canonical).join(',') + ']'
          : '{' +
            Object.keys(v)
              .sort()
              .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
              .join(',') +
            '}';
      const sig = createHmac('sha256', secret).update(`${ts}.${canonical(body)}`).digest('hex');

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MO-Timestamp': ts,
          'X-MO-Signature': sig,
        },
        body: JSON.stringify(body),
      });
      return res.ok ? 'Lead saved and pushed to DBU CRM.' : `Lead saved. DBU push failed (${res.status}).`;
    } catch (e: any) {
      return `Lead saved. DBU push failed: ${e?.message}`;
    }
  }
}
