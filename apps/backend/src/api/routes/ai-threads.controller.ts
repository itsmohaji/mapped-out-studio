import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { AiThreadsService } from '@gitroom/nestjs-libraries/database/prisma/ai-threads/ai.threads.service';

/**
 * AI Assistant threads and folders.
 *
 * Internal only — no @ClientAllowed(), so the CLIENT role is refused by default
 * (ADR-006). Every id in a path or body is re-checked against the caller's
 * organisation inside the service.
 */
@ApiTags('AI Threads')
@Controller('/ai-threads')
export class AiThreadsController {
  constructor(private _threads: AiThreadsService) {}

  @Get('/library')
  library(@GetOrgFromRequest() org: Organization) {
    return this._threads.library(org.id);
  }

  @Get('/:id')
  thread(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._threads.thread(org.id, id);
  }

  @Post('/start')
  start(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: { text?: string; folderId?: string; customerId?: string }
  ) {
    return this._threads.start({
      orgId: org.id,
      userId: user.id,
      // Bounded at the edge: a question is short, an unbounded body is a bill.
      text: String(body?.text || '').slice(0, 4000),
      folderId: body?.folderId ? String(body.folderId) : null,
      customerId: body?.customerId ? String(body.customerId) : null,
    });
  }

  @Post('/:id/message')
  message(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body()
    body: {
      role?: string;
      text?: string;
      sections?: any;
      capabilityKey?: string;
    }
  ) {
    return this._threads.append({
      orgId: org.id,
      threadId: id,
      role: body?.role === 'assistant' ? 'assistant' : 'user',
      text: String(body?.text || '').slice(0, 20000),
      // A non-array (e.g. a plain string) passes AiAnswer's old `.length`
      // guard and then crashes `.map` on every future render of this thread.
      // Only an array is a valid `sections` payload — anything else is dropped
      // at the boundary rather than persisted and re-rendered forever.
      sections: Array.isArray(body?.sections) ? body.sections : undefined,
      capabilityKey: body?.capabilityKey ? String(body.capabilityKey) : null,
    });
  }

  @Post('/:id/move')
  move(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { folderId?: string | null }
  ) {
    return this._threads.move(
      org.id,
      id,
      body?.folderId ? String(body.folderId) : null
    );
  }

  @Post('/:id/rename')
  rename(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { title?: string }
  ) {
    return this._threads.rename(org.id, id, String(body?.title || ''));
  }

  @Post('/:id/delete')
  remove(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._threads.remove(org.id, id);
  }

  @Post('/folder')
  addFolder(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { name?: string }
  ) {
    return this._threads.addFolder(org.id, String(body?.name || ''));
  }

  @Post('/folder/:id/rename')
  renameFolder(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { name?: string }
  ) {
    return this._threads.renameFolder(org.id, id, String(body?.name || ''));
  }

  @Post('/folder/:id/delete')
  removeFolder(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._threads.removeFolder(org.id, id);
  }
}
