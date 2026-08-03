import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { AiAssistService } from '@gitroom/nestjs-libraries/database/prisma/ai/ai.assist.service';
import { MediaRef } from '@gitroom/helpers/utils/ai.assist';

/**
 * The in-place AI surface: the composer's caption tools and the assistant
 * drawer.
 *
 * Client-facing, so nothing here names a provider, a model or a skill — the
 * body carries a task-shaped intent ("suggest", "shorten") and the router picks
 * who serves it. A browser that sent `provider: 'openai'` would be ignored, by
 * construction: there is no field for it.
 */
@ApiTags('AI Assist')
@Controller('/ai-assist')
export class AiAssistController {
  constructor(private _assist: AiAssistService) {}

  @Get('/credits')
  credits(@GetOrgFromRequest() org: Organization) {
    return this._assist.credits(org.id);
  }

  @Post('/caption')
  caption(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body()
    body: {
      action?: string;
      existing?: string;
      platform?: string;
      objective?: string;
      language?: string;
      extra?: string;
      customerId?: string;
      media?: MediaRef[];
    }
  ) {
    return this._assist.caption({
      org,
      userId: user.id,
      action: String(body?.action || 'suggest'),
      // Bounded at the edge. A caption is short; an unbounded body is a bill.
      existing: String(body?.existing || '').slice(0, 8000),
      platform: String(body?.platform || '').slice(0, 40),
      objective: String(body?.objective || '').slice(0, 500),
      language: String(body?.language || '').slice(0, 60),
      extra: String(body?.extra || '').slice(0, 1000),
      // Re-checked against this organisation inside the service; an id from
      // another workspace is dropped, never trusted.
      customerId: body?.customerId ? String(body.customerId) : null,
      media: sanitiseMedia(body?.media),
    });
  }

  @Post('/ask')
  ask(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body()
    body: {
      message?: string;
      pathname?: string;
      customerId?: string;
      timeframeDays?: number;
    }
  ) {
    return this._assist.ask({
      org,
      userId: user.id,
      message: String(body?.message || '').slice(0, 4000),
      pathname: String(body?.pathname || '').slice(0, 300),
      customerId: body?.customerId ? String(body.customerId) : null,
      timeframeDays: body?.timeframeDays ? Number(body.timeframeDays) : null,
    });
  }
}

/**
 * Where this installation's own media lives. Anything else is not ours.
 *
 * Read per call rather than at import time so a test or a restart-free env
 * change is picked up, and because an empty allowlist must fail closed rather
 * than be baked in at boot.
 */
function mediaOrigins(): string[] {
  return [process.env.FRONTEND_URL, process.env.CLOUDFLARE_BUCKET_URL]
    .filter(Boolean)
    .map((v) => {
      try {
        return new URL(String(v)).origin;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

/**
 * Media arrives from the browser, so it is data — never a destination.
 *
 * This is the ONE place a caller-supplied string is handed to a third party to
 * fetch, using our API key. So it is an allowlist of this installation's own
 * media origins, not a filter: an arbitrary URL here would be a server-side
 * request forgery that we pay for, and it would happily read an internal
 * address. A relative path is resolved against our own origin; anything that
 * lands anywhere else is dropped.
 */
function sanitiseMedia(media?: MediaRef[]): MediaRef[] {
  const origins = mediaOrigins();
  const base = process.env.FRONTEND_URL || '';

  const safe = (v?: string | null): string | null => {
    const s = String(v || '').trim().slice(0, 2000);
    if (!s) return null;
    try {
      const url = new URL(s, base || undefined);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      return origins.includes(url.origin) ? url.toString() : null;
    } catch {
      return null;
    }
  };

  return (Array.isArray(media) ? media : [])
    .slice(0, 8)
    .map((m) => ({ path: safe(m?.path), thumbnail: safe(m?.thumbnail) }))
    .filter((m) => !!m.path || !!m.thumbnail);
}
