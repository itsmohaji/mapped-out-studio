import { Injectable } from '@nestjs/common';
import {
  CampaignsRepository,
  CampaignWrite,
} from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaigns.repository';

@Injectable()
export class CampaignsService {
  constructor(private _campaigns: CampaignsRepository) {}

  /**
   * The list is useless without its post counts, and fetching them per card
   * would fan out one query per campaign — so they come back together, from a
   * single grouped query.
   */
  async list(orgId: string, status?: string) {
    const [campaigns, counts] = await Promise.all([
      this._campaigns.list(orgId, status),
      this._campaigns.countsByCampaign(orgId),
    ]);
    return campaigns.map((c) => ({ ...c, counts: counts[c.id] || {} }));
  }

  getOne(orgId: string, id: string) {
    return this._campaigns.getOne(orgId, id);
  }

  posts(orgId: string, id: string) {
    return this._campaigns.posts(orgId, id);
  }

  assignablePosts(orgId: string, id: string, search?: string) {
    return this._campaigns.assignablePosts(orgId, id, search);
  }

  create(orgId: string, userId: string, data: CampaignWrite) {
    return this._campaigns.create(orgId, userId, data);
  }

  update(orgId: string, id: string, data: CampaignWrite) {
    return this._campaigns.update(orgId, id, data);
  }

  remove(orgId: string, id: string) {
    return this._campaigns.remove(orgId, id);
  }

  addPosts(orgId: string, id: string, groups: string[]) {
    return this._campaigns.setCampaignForGroups(orgId, groups, id);
  }

  removePosts(orgId: string, groups: string[]) {
    return this._campaigns.setCampaignForGroups(orgId, groups, null);
  }
}
