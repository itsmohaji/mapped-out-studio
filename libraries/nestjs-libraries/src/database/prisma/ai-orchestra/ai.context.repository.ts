import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/**
 * AI Orchestra — the ONLY place the context layer touches the database.
 *
 * Two invariants, both asserted by `ai.orchestra.boundary.spec.ts`:
 *
 *  1. **Read-only.** No create, update, delete or upsert appears in this file at
 *     all. Brand-brief writes live with the other admin configuration in
 *     `AiOrchestraRepository`, so the run path cannot mutate anything.
 *  2. **Explicit selects only.** Never `include: { integration: true }` — an
 *     Integration row carries `token`, `refreshToken` and
 *     `customInstanceDetails`, and a wildcard select would walk a live
 *     credential straight into a prompt.
 *
 * Every query filters on the organisation id. Tenant isolation is a property of
 * the query, not of the caller.
 */
@Injectable()
export class AiContextRepository {
  constructor(
    private _integration: PrismaRepository<'integration'>,
    private _post: PrismaRepository<'post'>,
    private _customer: PrismaRepository<'customer'>,
    private _brief: PrismaRepository<'aiBrandBrief'>
  ) {}

  /** Connected, live channels. Optionally narrowed to one client. */
  channels(orgId: string, customerId?: string | null) {
    return this._integration.model.integration.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        disabled: false,
        ...(customerId ? { customerId } : {}),
      },
      select: {
        id: true,
        name: true,
        providerIdentifier: true,
        customerId: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * The account's own published writing — real evidence of how it actually
   * sounds, rather than an asserted house style.
   */
  publishedPosts(
    orgId: string,
    since: Date,
    customerId?: string | null,
    take = 20
  ) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        state: 'PUBLISHED',
        publishDate: { gte: since },
        // A thread is one unit; children repeat the group, so only the head is
        // sampled.
        parentPostId: null,
        integration: {
          deletedAt: null,
          ...(customerId ? { customerId } : {}),
        },
      },
      select: {
        content: true,
        publishDate: true,
        integration: { select: { providerIdentifier: true, name: true } },
      },
      orderBy: { publishDate: 'desc' },
      take,
    });
  }

  customer(orgId: string, customerId: string) {
    return this._customer.model.customer.findFirst({
      where: { id: customerId, orgId, deletedAt: null },
      select: { id: true, name: true },
    });
  }

  customers(orgId: string) {
    return this._customer.model.customer.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Brief for this client, else the organisation-wide one, else none. Resolved
   * here rather than in the service so the fallback is a single query pair and
   * cannot be got wrong at a call site.
   *
   * Brief *writes* deliberately live in `AiOrchestraRepository` with the other
   * admin configuration, so that this file — the one on the run path — stays
   * provably read-only.
   */
  async briefFor(orgId: string, customerId?: string | null) {
    if (customerId) {
      const own = await this._brief.model.aiBrandBrief.findFirst({
        where: { orgId, customerId, deletedAt: null },
      });
      if (own) return own;
    }
    return this._brief.model.aiBrandBrief.findFirst({
      where: { orgId, customerId: null, deletedAt: null },
    });
  }
}
