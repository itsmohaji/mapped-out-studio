import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export interface CampaignWrite {
  name?: string;
  description?: string | null;
  status?: string;
  color?: string | null;
  goal?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  customerId?: string | null;
}

@Injectable()
export class CampaignsRepository {
  constructor(
    private _campaign: PrismaRepository<'campaign'>,
    private _post: PrismaRepository<'post'>
  ) {}

  list(orgId: string, status?: string) {
    return this._campaign.model.campaign.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(status && status !== 'all' ? { status } : {}),
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: { customer: { select: { id: true, name: true } } },
    });
  }

  getOne(orgId: string, id: string) {
    return this._campaign.model.campaign.findFirst({
      where: { id, orgId, deletedAt: null },
      include: { customer: { select: { id: true, name: true } } },
    });
  }

  /**
   * Post counts per campaign, in ONE grouped query rather than a query per
   * campaign — the list page would otherwise fan out with the campaign count.
   * Only parent posts are counted, so a thread counts once.
   */
  async countsByCampaign(orgId: string) {
    const rows = await this._post.model.post.groupBy({
      by: ['campaignId', 'state'],
      where: {
        organizationId: orgId,
        deletedAt: null,
        parentPostId: null,
        campaignId: { not: null },
      },
      _count: { _all: true },
    });

    const out: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const key = r.campaignId as string;
      out[key] = out[key] || {};
      out[key][r.state] = r._count._all;
    }
    return out;
  }

  posts(orgId: string, campaignId: string) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        campaignId,
        deletedAt: null,
        parentPostId: null,
      },
      orderBy: { publishDate: 'asc' },
      select: {
        id: true,
        content: true,
        image: true,
        publishDate: true,
        state: true,
        group: true,
        releaseURL: true,
        integration: {
          select: {
            id: true,
            name: true,
            picture: true,
            providerIdentifier: true,
          },
        },
      },
    });
  }

  create(orgId: string, userId: string, data: CampaignWrite) {
    return this._campaign.model.campaign.create({
      data: {
        orgId,
        createdById: userId,
        name: data.name!,
        description: data.description ?? null,
        status: data.status || 'planning',
        color: data.color ?? null,
        goal: data.goal ?? null,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        customerId: data.customerId ?? null,
      },
    });
  }

  update(orgId: string, id: string, data: CampaignWrite) {
    return this._campaign.model.campaign.updateMany({
      where: { id, orgId, deletedAt: null },
      data,
    });
  }

  /** Soft delete, and unlink its posts so they survive as normal posts. */
  async remove(orgId: string, id: string) {
    await this._post.model.post.updateMany({
      where: { organizationId: orgId, campaignId: id },
      data: { campaignId: null },
    });
    return this._campaign.model.campaign.updateMany({
      where: { id, orgId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Attach/detach by post GROUP, never by a single post id — a thread is one
   * unit to the user, and its children share the group.
   */
  setCampaignForGroups(
    orgId: string,
    groups: string[],
    campaignId: string | null
  ) {
    if (!groups.length) return Promise.resolve({ count: 0 });
    return this._post.model.post.updateMany({
      where: { organizationId: orgId, group: { in: groups }, deletedAt: null },
      data: { campaignId },
    });
  }

  /** Candidate posts to add: this org's posts not already in this campaign. */
  assignablePosts(orgId: string, campaignId: string, search?: string) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        parentPostId: null,
        OR: [{ campaignId: null }, { campaignId: { not: campaignId } }],
        ...(search ? { content: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { publishDate: 'desc' },
      take: 50,
      select: {
        id: true,
        content: true,
        publishDate: true,
        state: true,
        group: true,
        campaignId: true,
        integration: {
          select: { id: true, name: true, providerIdentifier: true },
        },
      },
    });
  }
}
