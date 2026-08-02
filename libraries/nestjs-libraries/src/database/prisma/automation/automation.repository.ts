import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { AutomationEventInput, ChannelKey } from '@gitroom/nestjs-libraries/automation/automation.types';

const j = (v: any, fallback: any) => {
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

export interface WorkflowWrite {
  name?: string;
  description?: string | null;
  channel?: string;
  trigger?: string;
  triggerConfig?: any;
  conditions?: any;
  status?: string;
  customerId?: string | null;
}

@Injectable()
export class AutomationRepository {
  constructor(
    private _workflow: PrismaRepository<'automationWorkflow'>,
    private _node: PrismaRepository<'automationNode'>,
    private _contact: PrismaRepository<'automationContact'>,
    private _conversation: PrismaRepository<'automationConversation'>,
    private _event: PrismaRepository<'automationEvent'>,
    private _run: PrismaRepository<'automationRun'>,
    private _binding: PrismaRepository<'automationPostBinding'>,
    private _integration: PrismaRepository<'integration'>,
    private _tx: PrismaTransaction
  ) {}

  // ---------------------------------------------------------------- workflows

  list(orgId: string, customerId?: string | null) {
    return this._workflow.model.automationWorkflow.findMany({
      where: {
        orgId,
        deletedAt: null,
        // undefined means "every client"; an explicit null means the
        // organisation-wide workflows only. Those are different questions.
        ...(customerId === undefined ? {} : { customerId }),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { nodes: true, conversations: true } },
      },
    });
  }

  getOne(orgId: string, id: string) {
    return this._workflow.model.automationWorkflow.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        nodes: { orderBy: { position: 'asc' } },
        bindings: true,
        customer: { select: { id: true, name: true } },
      },
    });
  }

  create(orgId: string, userId: string | null, body: WorkflowWrite) {
    return this._workflow.model.automationWorkflow.create({
      data: {
        orgId,
        createdById: userId,
        name: body.name || 'Untitled automation',
        description: body.description ?? null,
        channel: body.channel || 'instagram',
        trigger: body.trigger || 'comment',
        triggerConfig: JSON.stringify(body.triggerConfig ?? {}),
        conditions: JSON.stringify(body.conditions ?? []),
        status: body.status || 'draft',
        customerId: body.customerId ?? null,
      },
    });
  }

  async update(orgId: string, id: string, body: WorkflowWrite) {
    const existing = await this._workflow.model.automationWorkflow.findFirst({
      where: { id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return null;

    return this._workflow.model.automationWorkflow.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.channel !== undefined ? { channel: body.channel } : {}),
        ...(body.trigger !== undefined ? { trigger: body.trigger } : {}),
        ...(body.triggerConfig !== undefined
          ? { triggerConfig: JSON.stringify(body.triggerConfig) }
          : {}),
        ...(body.conditions !== undefined
          ? { conditions: JSON.stringify(body.conditions) }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.customerId !== undefined ? { customerId: body.customerId } : {}),
      },
    });
  }

  async remove(orgId: string, id: string) {
    const existing = await this._workflow.model.automationWorkflow.findFirst({
      where: { id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return null;
    // Soft delete: a workflow with run history should stay auditable.
    return this._workflow.model.automationWorkflow.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'paused' },
    });
  }

  /**
   * Replace the whole node graph in one transaction.
   *
   * The builder always submits the complete graph, so a diff would be more code
   * for the same result. Ids are preserved by the caller where they exist, which
   * keeps a running conversation's cursor valid across an edit.
   */
  async replaceNodes(
    workflowId: string,
    nodes: Array<{
      id?: string;
      parentId: string | null;
      branchKey: string | null;
      kind: string;
      config: any;
      position: number;
    }>
  ) {
    return this._tx.model.$transaction(async (tx: any) => {
      await tx.automationNode.deleteMany({ where: { workflowId } });
      for (const n of nodes) {
        await tx.automationNode.create({
          data: {
            ...(n.id ? { id: n.id } : {}),
            workflowId,
            parentId: n.parentId,
            branchKey: n.branchKey,
            kind: n.kind,
            config: JSON.stringify(n.config ?? {}),
            position: n.position,
          },
        });
      }
      return tx.automationNode.findMany({ where: { workflowId }, orderBy: { position: 'asc' } });
    });
  }

  nodesFor(workflowId: string) {
    return this._node.model.automationNode.findMany({
      where: { workflowId },
      orderBy: { position: 'asc' },
    });
  }

  // ----------------------------------------------------------------- bindings

  /**
   * Bind a workflow to specific posts.
   *
   * `externalPostIds` are Instagram's own media ids — the same ids the comments
   * webhook reports — so a binding made from the account's real media is live
   * immediately, with no publish step to wait on.
   *
   * Deduped in code: the unique index is on (workflowId, postId), and postId is
   * null here, which Postgres treats as always-distinct. The index would not
   * stop a double-click from writing the same media twice.
   */
  async setBindings(
    orgId: string,
    workflowId: string,
    externalPostIds: string[],
    legacyPostIds: string[] = []
  ) {
    await this._binding.model.automationPostBinding.deleteMany({ where: { workflowId } });

    const external = Array.from(new Set((externalPostIds ?? []).filter(Boolean)));
    const legacy = Array.from(new Set((legacyPostIds ?? []).filter(Boolean)));
    if (!external.length && !legacy.length) return [];

    return this._binding.model.automationPostBinding.createMany({
      data: [
        ...external.map((externalPostId) => ({ orgId, workflowId, externalPostId })),
        ...legacy.map((postId) => ({ orgId, workflowId, postId })),
      ],
      skipDuplicates: true,
    });
  }

  /**
   * Fill in the platform's media id once a post is actually published.
   *
   * Until this runs the binding is inert: an inbound comment carries only the
   * platform id, so a binding that knows only our Post.id can never match.
   */
  resolveBinding(postId: string, externalPostId: string, integrationId: string) {
    return this._binding.model.automationPostBinding.updateMany({
      where: { postId },
      data: { externalPostId, integrationId },
    });
  }

  bindingsForWorkflows(workflowIds: string[]) {
    return this._binding.model.automationPostBinding.findMany({
      where: { workflowId: { in: workflowIds } },
    });
  }

  // ------------------------------------------------------------------- events

  /** Map a platform account id back to the integration that owns it. */
  integrationByExternalAccount(providerIdentifier: string, accountId: string) {
    return this._integration.model.integration.findFirst({
      where: { providerIdentifier, internalId: accountId, deletedAt: null, disabled: false },
    });
  }

  /**
   * Store an inbound event, or report that we have already seen it.
   *
   * The unique on (channel, externalId) is what stops a retried webhook from
   * sending a second private reply — and a private reply is one-per-comment
   * forever, so a duplicate does not just double-message, it burns the only
   * chance to reach that person.
   */
  async recordEvent(
    event: AutomationEventInput,
    ctx: { orgId: string | null; integrationId: string | null }
  ): Promise<{ id: string; duplicate: boolean }> {
    try {
      const row = await this._event.model.automationEvent.create({
        data: {
          orgId: ctx.orgId,
          integrationId: ctx.integrationId,
          channel: event.channel,
          kind: event.kind,
          externalId: event.externalId,
          accountId: event.accountId ?? null,
          payload: JSON.stringify(event.raw ?? event),
        },
        select: { id: true },
      });
      return { id: row.id, duplicate: false };
    } catch (e: any) {
      // P2002 = unique violation = we have seen this delivery before.
      if (e?.code === 'P2002') {
        const existing = await this._event.model.automationEvent.findFirst({
          where: { channel: event.channel, externalId: event.externalId },
          select: { id: true },
        });
        return { id: existing?.id ?? '', duplicate: true };
      }
      throw e;
    }
  }

  markEventProcessed(id: string, error?: string | null) {
    if (!id) return null;
    return this._event.model.automationEvent.update({
      where: { id },
      data: { processedAt: new Date(), error: error ?? null },
    });
  }

  recentEvents(orgId: string, take = 50) {
    return this._event.model.automationEvent.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ----------------------------------------------------------------- contacts

  async upsertContact(
    orgId: string,
    customerId: string | null,
    channel: ChannelKey,
    externalId: string,
    patch: { handle?: string | null; displayName?: string | null }
  ) {
    return this._contact.model.automationContact.upsert({
      where: { orgId_channel_externalId: { orgId, channel, externalId } },
      create: {
        orgId,
        customerId,
        channel,
        externalId,
        handle: patch.handle ?? null,
        displayName: patch.displayName ?? null,
        lastSeenAt: new Date(),
      },
      update: {
        lastSeenAt: new Date(),
        ...(patch.handle ? { handle: patch.handle } : {}),
        ...(patch.displayName ? { displayName: patch.displayName } : {}),
      },
    });
  }

  async mergeContactFields(id: string, fields: Record<string, string>, tags?: string[]) {
    const current = await this._contact.model.automationContact.findUnique({ where: { id } });
    if (!current) return null;
    const mergedTags = tags?.length
      ? Array.from(new Set([...j(current.tags, []), ...tags]))
      : j(current.tags, []);
    return this._contact.model.automationContact.update({
      where: { id },
      data: {
        fields: JSON.stringify({ ...j(current.fields, {}), ...fields }),
        tags: JSON.stringify(mergedTags),
      },
    });
  }

  countPriorConversations(contactId: string) {
    return this._conversation.model.automationConversation.count({ where: { contactId } });
  }

  // ------------------------------------------------------------ conversations

  openConversation(workflowId: string, contactId: string) {
    return this._conversation.model.automationConversation.findFirst({
      where: { workflowId, contactId, status: { in: ['running', 'waiting'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  createConversation(data: {
    orgId: string;
    workflowId: string;
    contactId: string;
    sourceEventId?: string | null;
    sourceCommentId?: string | null;
  }) {
    return this._conversation.model.automationConversation.create({
      data: {
        orgId: data.orgId,
        workflowId: data.workflowId,
        contactId: data.contactId,
        sourceEventId: data.sourceEventId ?? null,
        sourceCommentId: data.sourceCommentId ?? null,
        status: 'running',
      },
    });
  }

  updateConversation(
    id: string,
    data: {
      status?: string;
      cursorNodeId?: string | null;
      waitingSince?: Date | null;
      expiresAt?: Date | null;
      windowExpiresAt?: Date | null;
      variables?: Record<string, string>;
    }
  ) {
    return this._conversation.model.automationConversation.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.cursorNodeId !== undefined ? { cursorNodeId: data.cursorNodeId } : {}),
        ...(data.waitingSince !== undefined ? { waitingSince: data.waitingSince } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
        ...(data.windowExpiresAt !== undefined ? { windowExpiresAt: data.windowExpiresAt } : {}),
        ...(data.variables !== undefined ? { variables: JSON.stringify(data.variables) } : {}),
      },
    });
  }

  /** Conversations already waiting on a reply from this contact. */
  waitingConversationsFor(contactId: string) {
    return this._conversation.model.automationConversation.findMany({
      where: { contactId, status: 'waiting' },
      include: { workflow: true },
    });
  }

  // --------------------------------------------------------------------- runs

  createRun(data: { orgId: string; workflowId: string; conversationId?: string | null; eventId?: string | null }) {
    return this._run.model.automationRun.create({
      data: {
        orgId: data.orgId,
        workflowId: data.workflowId,
        conversationId: data.conversationId ?? null,
        eventId: data.eventId ?? null,
        status: 'running',
      },
    });
  }

  finishRun(id: string, status: string, steps: any[], reason?: string | null) {
    return this._run.model.automationRun.update({
      where: { id },
      data: {
        status,
        reason: reason ?? null,
        steps: JSON.stringify(steps ?? []),
        finishedAt: new Date(),
      },
    });
  }

  runsFor(orgId: string, workflowId?: string, take = 50) {
    return this._run.model.automationRun.findMany({
      where: { orgId, ...(workflowId ? { workflowId } : {}) },
      orderBy: { startedAt: 'desc' },
      take,
      include: { workflow: { select: { id: true, name: true } } },
    });
  }

  /** How many private replies we already sent for a comment. The 1-per-comment guard. */
  countPrivateRepliesForComment(workflowId: string, sourceCommentId: string) {
    return this._conversation.model.automationConversation.count({
      where: { workflowId, sourceCommentId },
    });
  }

  // --------------------------------------------------------- accounts + stats

  /** Connected channels, for the account picker. */
  connectedIntegrations(orgId: string) {
    return this._integration.model.integration.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        picture: true,
        providerIdentifier: true,
        profile: true,
        disabled: true,
        refreshNeeded: true,
        customerId: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** One integration, scoped to the org so an id from elsewhere cannot be read. */
  integrationById(orgId: string, integrationId: string) {
    return this._integration.model.integration.findFirst({
      where: { id: integrationId, organizationId: orgId, deletedAt: null },
    });
  }

  recentEventsForIntegration(integrationId: string, take = 10) {
    return this._event.model.automationEvent.findMany({
      where: { integrationId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  countEventsForIntegration(integrationId: string) {
    return this._event.model.automationEvent.count({ where: { integrationId } });
  }

  /** Latest run per workflow, so a card can say "last run 2 hours ago". */
  lastRunsByWorkflow(orgId: string) {
    return this._run.model.automationRun.groupBy({
      by: ['workflowId'],
      where: { orgId },
      _max: { startedAt: true },
    });
  }

  /**
   * Headline counters for one workflow (or the whole org).
   *
   * Derived from runs and conversations rather than stored counters — a stored
   * counter drifts the first time a run is retried or a conversation expires,
   * and nothing here is hot enough to need the denormalisation.
   */
  async statsFor(orgId: string, workflowId?: string) {
    const scope = { orgId, ...(workflowId ? { workflowId } : {}) };

    const [triggered, completed, blocked, conversations, replied, leads] = await Promise.all([
      this._run.model.automationRun.count({ where: scope }),
      this._run.model.automationRun.count({ where: { ...scope, status: 'completed' } }),
      this._run.model.automationRun.count({ where: { ...scope, status: 'blocked' } }),
      this._conversation.model.automationConversation.count({ where: scope }),
      // A conversation that moved past 'waiting' is one where a human replied.
      this._conversation.model.automationConversation.count({
        where: { ...scope, status: { in: ['running', 'completed'] }, waitingSince: null },
      }),
      this._contact.model.automationContact.count({
        where: { orgId, tags: { contains: 'lead' } },
      }),
    ]);

    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

    return {
      triggered,
      conversations,
      replied,
      leads,
      completed,
      blocked,
      // Reply rate is the honest engagement number: how many people actually
      // answered, not how many messages we managed to fire off.
      replyRate: pct(replied, conversations),
      completionRate: pct(completed, triggered),
    };
  }
}
