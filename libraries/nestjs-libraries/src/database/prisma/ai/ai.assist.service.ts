import { Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { AiGatewayService } from '@gitroom/nestjs-libraries/ai/ai.gateway.service';
import { AiTask } from '@gitroom/nestjs-libraries/ai/ai.router';
import { AiOrchestraRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-orchestra/ai.orchestra.repository';
import { AiContextService } from '@gitroom/nestjs-libraries/database/prisma/ai-orchestra/ai.context.service';
import {
  buildAskPrompt,
  buildCaptionPrompt,
  CaptionAction,
  captionAction,
  MediaRef,
  pageContextFor,
  visionImages,
} from '@gitroom/helpers/utils/ai.assist';
import { remaining } from '@gitroom/helpers/utils/ai.orchestra';
import {
  BrandBriefLike,
  renderContext,
  stripHtml,
} from '@gitroom/helpers/utils/ai.context';

const DEFAULT_ENTITLEMENT = { monthlyCredits: 200, monthlyImages: 20 };

/**
 * AI Assist — the assistant that lives in the composer and in the drawer.
 *
 * Distinct from AI Orchestra, which runs curated multi-skill pipelines an admin
 * configures. This is the fast, in-place surface: one call, one answer, on
 * whatever the user is already looking at.
 *
 * It shares Orchestra's meter and Orchestra's credit ceiling deliberately —
 * two AI surfaces with two separate balances would make "credits remaining"
 * meaningless. Both spend from the same monthly entitlement.
 *
 * Like Orchestra it holds NO reference to posting, scheduling or an integration
 * token. It returns text to the person who asked for it and nothing else.
 */
@Injectable()
export class AiAssistService {
  constructor(
    private _gateway: AiGatewayService,
    private _runs: AiOrchestraRepository,
    private _context: AiContextService
  ) {}

  /** Remaining balance, for the badge in the drawer and the composer. */
  async credits(orgId: string) {
    const [entitlement, usage] = await Promise.all([
      this._runs.entitlement(orgId),
      this._runs.usageThisMonth(orgId),
    ]);
    const limits = entitlement || DEFAULT_ENTITLEMENT;
    return {
      creditsUsed: usage.creditsUsed,
      creditsRemaining: remaining(limits.monthlyCredits, usage.creditsUsed),
      monthlyCredits: limits.monthlyCredits,
    };
  }

  /**
   * Refuse BEFORE spending anything.
   *
   * Checked here rather than inside the gateway because the gateway is also the
   * path an internal job takes; the ceiling is a property of a client-initiated
   * request, not of every call the platform makes.
   */
  private async gate(orgId: string) {
    const c = await this.credits(orgId);
    if (c.creditsRemaining <= 0) {
      return {
        ok: false,
        message: 'You have used all of this month’s AI credits.',
      };
    }
    return { ok: true, message: '' };
  }

  /** Brand brief as plain text, or null. Never invents a house style. */
  private async briefText(orgId: string, customerId?: string | null) {
    const brief = (await this._context.brief(orgId, customerId)) as BrandBriefLike | null;
    if (!brief) return null;
    const lines = [
      brief.audience && `Audience: ${brief.audience}`,
      brief.tone && `Tone: ${brief.tone}`,
      brief.dos && `Always: ${brief.dos}`,
      brief.donts && `Never: ${brief.donts}`,
      brief.products && `Products/services: ${brief.products}`,
      brief.notes && `Notes: ${brief.notes}`,
    ].filter(Boolean);
    return lines.length ? lines.join('\n') : null;
  }

  /**
   * Resolve the client, ALWAYS against this organisation.
   *
   * An id from another workspace is dropped rather than trusted — the same rule
   * Orchestra enforces, and the reason a customerId from the browser can never
   * widen what a caption is allowed to see.
   */
  private async resolveClient(orgId: string, customerId?: string | null) {
    if (!customerId) return { id: null as string | null, name: null as string | null };
    const resolved = await this._context.resolveCustomer(orgId, customerId);
    if (!resolved.ok || !resolved.customer) return { id: null, name: null };
    return { id: resolved.customer.id, name: resolved.customer.name };
  }

  /**
   * Write or rewrite a caption.
   *
   * The media is the subject. `visionImages` turns the attachments into
   * something a model can actually be shown — a video becomes its poster, never
   * its mp4 — and the gateway decides whether any enabled provider can see
   * them. When none can, it silently falls back to a text-only prompt; the
   * reduced capability is reported back to us for the log and is NOT surfaced
   * to the user, who only ever sees a caption or a plain failure.
   */
  async caption(params: {
    org: Organization;
    userId?: string;
    action: string;
    existing?: string;
    platform?: string;
    objective?: string;
    language?: string;
    extra?: string;
    customerId?: string | null;
    media?: MediaRef[];
  }) {
    const meta = captionAction(params.action);
    if (!meta) {
      return { ok: false as const, message: 'That action is not available.' };
    }

    const existing = stripHtml(params.existing || '').trim();
    if (meta.needsExisting && !existing) {
      return {
        ok: false as const,
        message: 'Write a caption first, then this can work on it.',
      };
    }

    const gate = await this.gate(params.org.id);
    if (!gate.ok) return { ok: false as const, message: gate.message };

    const client = await this.resolveClient(params.org.id, params.customerId);
    const brief = await this.briefText(params.org.id, client.id);
    const media = (params.media || []).slice(0, 8);
    const images = visionImages(media);

    // Ask the router whether anything can see, BEFORE writing the instruction —
    // the prompt differs, and telling a blind model to "look at the image" is
    // how you get a confident description of something that is not there.
    const canSeeMedia = images.length > 0 && (await this._gateway.available('vision'));

    const { instruction, input } = buildCaptionPrompt({
      action: meta.key as CaptionAction,
      platform: params.platform,
      existing,
      objective: params.objective,
      language: params.language,
      clientName: client.name,
      brief,
      media,
      canSeeMedia,
      extra: params.extra,
    });

    const res = await this._gateway.generate({
      task: 'caption',
      instruction,
      input,
      images: canSeeMedia ? images : [],
      orgId: params.org.id,
      userId: params.userId,
      capabilityKey: `assist:caption:${meta.key}`,
      temperature: 0.8,
    });

    if (!res.ok) {
      return {
        ok: false as const,
        message: 'The assistant is unavailable right now.',
      };
    }

    return {
      ok: true as const,
      text: res.text,
      // Whether the media was actually read. Shown as a quiet note, not an
      // error — the caption is still usable, it just was not written from the
      // picture, and hiding that would make the feature feel randomly wrong.
      sawMedia: canSeeMedia,
      credits: await this.credits(params.org.id),
    };
  }

  /**
   * A free-form question, answered in the context of the page it was asked from.
   *
   * Unlike a caption this DOES build the full client context — someone asking
   * "why did this post perform badly" is asking about numbers, and answering
   * that without them would be exactly the fabrication the rules forbid.
   */
  async ask(params: {
    org: Organization;
    userId?: string;
    message: string;
    pathname?: string;
    customerId?: string | null;
    timeframeDays?: number | null;
  }) {
    const message = (params.message || '').trim();
    if (!message) {
      return { ok: false as const, message: 'Ask a question first.' };
    }

    const gate = await this.gate(params.org.id);
    if (!gate.ok) return { ok: false as const, message: gate.message };

    const page = pageContextFor(params.pathname);
    const client = await this.resolveClient(params.org.id, params.customerId);

    const context = await this._context.build({
      org: params.org,
      customerId: client.id,
      customerName: client.name,
      timeframeDays: params.timeframeDays,
    });

    const res = await this._gateway.generate({
      task: page.task as AiTask,
      instruction: buildAskPrompt(page, client.name),
      input: [
        renderContext(context),
        '',
        `QUESTION:\n${message}`,
      ].join('\n'),
      orgId: params.org.id,
      userId: params.userId,
      capabilityKey: `assist:ask:${page.page}`,
    });

    if (!res.ok) {
      return {
        ok: false as const,
        message: 'The assistant is unavailable right now.',
      };
    }

    return {
      ok: true as const,
      text: res.text,
      page: page.page,
      credits: await this.credits(params.org.id),
    };
  }
}
