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
import { Role, User } from '@prisma/client';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import {
  OrgRoles,
  PlatformOwnerOnly,
} from '@gitroom/backend/services/auth/permissions/roles.guard';
import { AiProvidersService } from '@gitroom/nestjs-libraries/database/prisma/ai/ai.providers.service';

/**
 * AI Providers — owner only.
 *
 * Gated with @OrgRoles(SUPERADMIN), which the global RolesGuard enforces for
 * every route on the controller. The guard already lets a platform
 * User.isSuperAdmin through as a bypass.
 *
 * Gating on User.isSuperAdmin ALONE was wrong and made this page unreachable:
 * that flag is for a multi-tenant platform operator and is never set on a
 * self-hosted install, where the org SUPERADMIN *is* the owner. ADMIN, USER and
 * CLIENT are still excluded, so agency staff and clients never see keys.
 */
@ApiTags('AI Providers')
@PlatformOwnerOnly()
@OrgRoles(Role.SUPERADMIN)
@Controller('/ai-providers')
export class AiProvidersController {
  constructor(private _providers: AiProvidersService) {}

  @Get('/')
  async list(@GetUserFromRequest() user: User) {
    return this._providers.list();
  }

  /** Which provider each task will actually use, and why. */
  @Get('/routing')
  async routing(@GetUserFromRequest() user: User) {
    return this._providers.routing();
  }

  @Get('/audit')
  async audit(@GetUserFromRequest() user: User, @Query('take') take?: string) {
    return this._providers.auditLog(Math.min(Number(take) || 100, 300));
  }

  @Put('/:provider')
  async save(
    @GetUserFromRequest() user: User,
    @Param('provider') provider: string,
    @Body() body: any
  ) {
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
    return this._providers.test(provider, body?.apiKey, {
      id: user.id,
      name: user.name || user.email,
    });
  }
}
