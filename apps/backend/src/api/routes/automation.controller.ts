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
import { resolveVerifyToken } from '@gitroom/nestjs-libraries/automation/channels/instagram.channel';

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

  /**
   * Everything needed to register the webhook in the Meta App dashboard.
   *
   * Authenticated: the verify token is a secret, even though it is a weak one.
   * Returned rather than documented so the values can never drift from what the
   * server will actually accept.
   */
  @Get('/webhook-setup')
  webhookSetup() {
    const base = (process.env.MAIN_URL || process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    return {
      callbackUrl: `${base}/api/hooks/instagram`,
      verifyToken: resolveVerifyToken(),
      verifyTokenSource: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ? 'env' : 'derived',
      signatureSecretConfigured: !!process.env.INSTAGRAM_APP_SECRET,
      // `messages` only starts delivering once Advanced Access is granted;
      // subscribing early is harmless and saves a second trip to the dashboard.
      subscribeFields: ['comments', 'messages'],
    };
  }

  /** Connected accounts with automation counts — the landing page. */
  @Get('/accounts')
  accounts(@GetOrgFromRequest() org: Organization) {
    return this._automation.accounts(org.id);
  }

  @Get('/templates')
  templates(@Query('channel') channel?: string) {
    return this._automation.templates(channel);
  }

  @Get('/stats')
  stats(@GetOrgFromRequest() org: Organization, @Query('workflow') workflowId?: string) {
    return this._automation.stats(org.id, workflowId);
  }

  @Post('/from-template')
  async fromTemplate(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: { templateKey: string; channel: string; customerId?: string | null; name?: string }
  ) {
    const created = await this._automation.createFromTemplate(org.id, user?.id ?? null, body);
    if (!created) throw new ForbiddenException();
    return created;
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
