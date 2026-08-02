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
import { AutomationService } from '@gitroom/nestjs-libraries/database/prisma/automation/automation.service';
import { allCapabilities } from '@gitroom/nestjs-libraries/automation/automation.capabilities';

@ApiTags('Automation')
@Controller('/automation')
export class AutomationController {
  constructor(private _automation: AutomationService) {}

  /**
   * What each channel can actually do.
   *
   * Served from the registry rather than hardcoded in the UI so the builder and
   * the engine can never disagree about whether TikTok supports DMs.
   */
  @Get('/capabilities')
  capabilities() {
    return allCapabilities();
  }

  @Get('/')
  list(
    @GetOrgFromRequest() org: Organization,
    @Query('customer') customerId?: string
  ) {
    // 'all' (or absent) means every client; an explicit 'none' means the
    // organisation-wide workflows only.
    const scope =
      customerId === undefined || customerId === 'all'
        ? undefined
        : customerId === 'none'
        ? null
        : customerId;
    return this._automation.list(org.id, scope);
  }

  @Get('/runs')
  runs(@GetOrgFromRequest() org: Organization, @Query('workflow') workflowId?: string) {
    return this._automation.runs(org.id, workflowId);
  }

  @Get('/events')
  events(@GetOrgFromRequest() org: Organization) {
    return this._automation.events(org.id);
  }

  @Get('/:id')
  async getOne(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    const workflow = await this._automation.getOne(org.id, id);
    if (!workflow) throw new ForbiddenException();
    return workflow;
  }

  @Post('/')
  create(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: any
  ) {
    return this._automation.create(org.id, user?.id ?? null, body);
  }

  @Put('/:id')
  async update(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: any
  ) {
    const updated = await this._automation.update(org.id, id, body);
    if (!updated) throw new ForbiddenException();
    return updated;
  }

  /** Replace the whole node graph. The builder always submits it complete. */
  @Put('/:id/graph')
  async saveGraph(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { nodes: any[] }
  ) {
    const workflow = await this._automation.getOne(org.id, id);
    if (!workflow) throw new ForbiddenException();
    return this._automation.saveGraph(org.id, id, body?.nodes ?? []);
  }

  @Put('/:id/bindings')
  async bindings(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { postIds: string[] }
  ) {
    const workflow = await this._automation.getOne(org.id, id);
    if (!workflow) throw new ForbiddenException();
    return this._automation.setBindings(org.id, id, body?.postIds ?? []);
  }

  @Get('/:id/validate')
  async validate(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    const issues = await this._automation.validate(org.id, id);
    if (issues === null) throw new ForbiddenException();
    return issues;
  }

  /**
   * Activate or pause.
   *
   * Activation refuses a workflow whose steps the channel cannot perform, so
   * the failure lands in front of a human at the moment they switch it on.
   */
  @Put('/:id/status')
  async status(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { status: string }
  ) {
    const workflow = await this._automation.getOne(org.id, id);
    if (!workflow) throw new ForbiddenException();
    return this._automation.setStatus(org.id, id, body?.status ?? 'draft');
  }

  @Delete('/:id')
  async remove(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    const removed = await this._automation.remove(org.id, id);
    if (!removed) throw new ForbiddenException();
    return removed;
  }
}
