import { Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { AiContextRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-orchestra/ai.context.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { ClientContext, stripHtml } from '@gitroom/helpers/utils/ai.context';

export const DEFAULT_TIMEFRAME_DAYS = 30;
const ALLOWED_TIMEFRAMES = [7, 30, 90];

/**
 * Assembles everything a skill is allowed to know about a client.
 *
 * It reads and only reads. It holds no reference to the posting service, to a
 * workflow or to a scheduler, so adding it to the orchestrator does not create
 * the code path that AI Orchestra exists to prevent. `IntegrationService` is
 * used for exactly one thing — `checkAnalytics`, the codebase's only route to
 * live platform numbers — and `ai.orchestra.boundary.spec.ts` pins that.
 */
@Injectable()
export class AiContextService {
  constructor(
    private _repo: AiContextRepository,
    private _integrations: IntegrationService
  ) {}

  /** Clients the operator can pick between when running a capability. */
  customers(orgId: string) {
    return this._repo.customers(orgId);
  }

  static normaliseTimeframe(days?: number | null): number {
    const n = Number(days);
    return ALLOWED_TIMEFRAMES.includes(n) ? n : DEFAULT_TIMEFRAME_DAYS;
  }

  /**
   * Resolves the client. Returns null when the id does not belong to this
   * organisation — the caller turns that into a refusal rather than quietly
   * falling through to the whole workspace, which would be a cross-tenant leak
   * dressed up as a default.
   */
  async resolveCustomer(orgId: string, customerId?: string | null) {
    if (!customerId) return { ok: true as const, customer: null };
    const customer = await this._repo.customer(orgId, customerId);
    if (!customer) return { ok: false as const, customer: null };
    return { ok: true as const, customer };
  }

  async build(params: {
    org: Organization;
    customerId?: string | null;
    customerName?: string | null;
    timeframeDays?: number | null;
  }): Promise<ClientContext> {
    const { org, customerId, customerName } = params;
    const timeframeDays = AiContextService.normaliseTimeframe(
      params.timeframeDays
    );

    const since = new Date();
    since.setDate(since.getDate() - timeframeDays);

    const [channels, posts, brief] = await Promise.all([
      this._repo.channels(org.id, customerId),
      this._repo.publishedPosts(org.id, since, customerId),
      this._repo.briefFor(org.id, customerId),
    ]);

    // One channel failing to answer must not lose the others. A channel that
    // throws or returns nothing is carried through as "not reporting", never as
    // a zero — a zero would silently drag an average down and make the answer
    // lie.
    const blocks = await Promise.all(
      channels.map(async (c) => {
        let data: any[] | null = null;
        try {
          const res = await this._integrations.checkAnalytics(
            org,
            c.id,
            String(timeframeDays)
          );
          data = Array.isArray(res) ? res : null;
        } catch {
          data = null;
        }
        return {
          integration: {
            id: c.id,
            name: c.name,
            identifier: c.providerIdentifier,
          },
          data,
        };
      })
    );

    return {
      clientName: customerName ?? null,
      timeframeDays,
      channels: blocks,
      posts: posts.map((p) => ({
        platform: p.integration?.providerIdentifier || 'unknown',
        content: stripHtml(p.content || ''),
        publishedAt: p.publishDate ? p.publishDate.toISOString() : null,
      })),
      brief,
    };
  }
}
