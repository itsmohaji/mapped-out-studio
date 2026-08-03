import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { AiProvidersService } from '@gitroom/nestjs-libraries/database/prisma/ai/ai.providers.service';

/**
 * AI Providers — platform owner only.
 *
 * Every route here is super-admin gated. Providers, keys, endpoints and costs
 * are the operator's commercial arrangement; a client must never learn that
 * they exist, let alone which one served their request. Clients see credits.
 *
 * The gate is repeated per route rather than hidden in a decorator so that a
 * new route cannot be added without visibly deciding who may call it.
 */
@ApiTags('AI Providers')
@Controller('/ai-providers')
export class AiProvidersController {
  constructor(private _providers: AiProvidersService) {}

  private assertOwner(user: User) {
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException();
    }
  }

  @Get('/')
  async list(@GetUserFromRequest() user: User) {
    this.assertOwner(user);
    return this._providers.list();
  }

  /** Which provider each task will actually use, and why. */
  @Get('/routing')
  async routing(@GetUserFromRequest() user: User) {
    this.assertOwner(user);
    return this._providers.routing();
  }

  @Get('/audit')
  async audit(@GetUserFromRequest() user: User, @Query('take') take?: string) {
    this.assertOwner(user);
    return this._providers.auditLog(Math.min(Number(take) || 100, 300));
  }

  @Put('/:provider')
  async save(
    @GetUserFromRequest() user: User,
    @Param('provider') provider: string,
    @Body() body: any
  ) {
    this.assertOwner(user);
    const saved = await this._providers.upsert(provider, body ?? {}, {
      id: user.id,
      name: user.name || user.email,
    });
    if (!saved) throw new ForbiddenException();
    // Never echo the record back — it holds ciphertext. Re-list instead, which
    // is masked by construction.
    return this._providers.list();
  }

  @Post('/:provider/test')
  async test(
    @GetUserFromRequest() user: User,
    @Param('provider') provider: string,
    @Body() body: { apiKey?: string }
  ) {
    this.assertOwner(user);
    return this._providers.test(provider, body?.apiKey, {
      id: user.id,
      name: user.name || user.email,
    });
  }
}
