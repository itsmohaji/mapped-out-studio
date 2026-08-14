import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { isPlatformOwner } from '@gitroom/nestjs-libraries/security/platform.owner';

/**
 * Mapped Out role-based access control (Phase 2A).
 *
 * Roles map onto Postiz's existing per-organization role system:
 *   - Super Admin  = User.isSuperAdmin === true (global, bypasses everything)
 *   - Manager      = UserOrganization.role === ADMIN in each assigned workspace
 *   - Client       = UserOrganization.role === CLIENT in their single workspace
 *
 * Two decorators drive the guard:
 *   - @OrgRoles(Role.SUPERADMIN, ...) restricts a route to specific org roles.
 *   - @ClientAllowed() opens a route to CLIENT users.
 *
 * CLIENT is *default-deny*: a client can only reach routes explicitly marked
 * @ClientAllowed(). Every sensitive controller (settings, billing, analytics,
 * channel connect/disconnect, publishing, webhooks, …) is therefore off-limits
 * to clients automatically — there is no denylist to keep in sync, which keeps
 * the "no cross-client visibility / no data leakage" guarantee robust.
 */

export const ORG_ROLES_KEY = 'orgRoles';
export const CLIENT_ALLOWED_KEY = 'clientAllowed';
export const PLATFORM_OWNER_KEY = 'platformOwner';

export const OrgRoles = (...roles: Role[]) => SetMetadata(ORG_ROLES_KEY, roles);
export const ClientAllowed = () => SetMetadata(CLIENT_ALLOWED_KEY, true);

/**
 * For routes that change PLATFORM-wide state rather than one workspace's.
 *
 * `@OrgRoles(Role.SUPERADMIN)` cannot express this: every org owner holds that
 * role in their own org, so it authorises the second agency you onboard to edit
 * the first agency's platform configuration. See `isPlatformOwner`.
 */
export const PlatformOwnerOnly = () => SetMetadata(PLATFORM_OWNER_KEY, true);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private _reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Routes without an authenticated organization (auth, public, stripe, …)
    // are not governed by org roles — let them through.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const org = request.org;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const user = request.user;
    if (!org || !user) {
      return true;
    }

    // Platform-wide routes are settled here, BEFORE the org-role logic below —
    // an org role must never satisfy a platform-level requirement.
    const platformOwnerOnly = this._reflector.getAllAndOverride<boolean>(
      PLATFORM_OWNER_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (platformOwnerOnly && !isPlatformOwner(user)) {
      throw new ForbiddenException();
    }

    // Super Admin can do anything, in any workspace.
    if (user.isSuperAdmin) {
      return true;
    }

    const role: Role | undefined = org.users?.[0]?.role;

    const requiredRoles = this._reflector.getAllAndOverride<Role[]>(
      ORG_ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );
    const clientAllowed = this._reflector.getAllAndOverride<boolean>(
      CLIENT_ALLOWED_KEY,
      [context.getHandler(), context.getClass()]
    );

    // Clients are default-deny: only explicitly allowed routes are reachable.
    if (role === Role.CLIENT) {
      if (clientAllowed) {
        return true;
      }
      throw new ForbiddenException();
    }

    // Explicit role gating for non-client roles (e.g. super-admin-only routes).
    if (requiredRoles && requiredRoles.length) {
      if (role && requiredRoles.includes(role)) {
        return true;
      }
      throw new ForbiddenException();
    }

    return true;
  }
}
