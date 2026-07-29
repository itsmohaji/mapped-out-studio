import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { CampaignsService } from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaigns.service';
import {
  CampaignPostsDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from '@gitroom/nestjs-libraries/dtos/campaigns/create.campaign.dto';

const d = (v?: string) => (v ? new Date(v) : null);

@ApiTags('Campaigns')
@Controller('/campaigns')
export class CampaignsController {
  constructor(private _campaigns: CampaignsService) {}

  @Get('/')
  list(@GetOrgFromRequest() org: Organization, @Query('status') status?: string) {
    return this._campaigns.list(org.id, status);
  }

  @Get('/:id')
  async getOne(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const campaign = await this._campaigns.getOne(org.id, id);
    if (!campaign) throw new ForbiddenException();
    return campaign;
  }

  @Get('/:id/posts')
  async posts(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return { posts: await this._campaigns.posts(org.id, id) };
  }

  @Get('/:id/assignable')
  async assignable(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Query('search') search?: string
  ) {
    return { posts: await this._campaigns.assignablePosts(org.id, id, search) };
  }

  @Post('/')
  create(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: CreateCampaignDto
  ) {
    return this._campaigns.create(org.id, user.id, {
      ...body,
      startDate: d(body.startDate),
      endDate: d(body.endDate),
    });
  }

  @Put('/:id')
  async update(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateCampaignDto
  ) {
    const existing = await this._campaigns.getOne(org.id, id);
    if (!existing) throw new ForbiddenException();
    // Only convert what was actually sent — `undefined` leaves the column
    // alone, `null` would clear it, and a partial update must not wipe dates.
    return this._campaigns.update(org.id, id, {
      ...body,
      startDate: body.startDate !== undefined ? d(body.startDate) : undefined,
      endDate: body.endDate !== undefined ? d(body.endDate) : undefined,
    });
  }

  @Delete('/:id')
  async remove(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const existing = await this._campaigns.getOne(org.id, id);
    if (!existing) throw new ForbiddenException();
    return this._campaigns.remove(org.id, id);
  }

  @Post('/:id/posts')
  async addPosts(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: CampaignPostsDto
  ) {
    const existing = await this._campaigns.getOne(org.id, id);
    if (!existing) throw new ForbiddenException();
    return this._campaigns.addPosts(org.id, id, body.groups);
  }

  @Delete('/:id/posts')
  async removePosts(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: CampaignPostsDto
  ) {
    const existing = await this._campaigns.getOne(org.id, id);
    if (!existing) throw new ForbiddenException();
    return this._campaigns.removePosts(org.id, body.groups);
  }
}
