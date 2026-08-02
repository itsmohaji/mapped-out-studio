import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { AutomationService } from '@gitroom/nestjs-libraries/database/prisma/automation/automation.service';
import {
  parseInstagramWebhook,
  verifyChallenge,
  verifyInstagramSignature,
} from '@gitroom/nestjs-libraries/automation/channels/instagram.channel';

/**
 * Public webhook ingress for the Automation module.
 *
 * Unauthenticated by necessity — Meta calls it — so the signature check IS the
 * authentication. Registered outside the auth middleware; see api.module.ts.
 *
 * Callback URL to register in the Meta App dashboard:
 *   https://social.mappedout.co/api/hooks/instagram
 * (nginx strips the /api prefix, so this controller's path is /hooks/instagram.)
 */
@ApiTags('Automation Webhooks')
@Controller('/hooks')
export class AutomationWebhookController {
  private readonly logger = new Logger(AutomationWebhookController.name);

  constructor(private _automation: AutomationService) {}

  /** Meta's one-time subscription handshake. */
  @Get('/instagram')
  instagramChallenge(@Query() query: Record<string, any>) {
    const challenge = verifyChallenge(query, process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN);
    if (challenge === null) {
      // A bare string 'forbidden' rather than an exception: Meta shows the body
      // verbatim in the dashboard, and this is a setup problem worth reading.
      this.logger.warn('Instagram webhook challenge rejected (token mismatch or not configured).');
      return 'forbidden';
    }
    return challenge;
  }

  /**
   * Inbound events.
   *
   * Answers 200 immediately and processes afterwards. Meta retries anything
   * slow or non-200, and a retry would be a duplicate delivery — which for a
   * private reply means burning the single reply that comment will ever get.
   * Ingest dedupes on (channel, externalId) as the real guarantee; answering
   * fast just avoids provoking the retry in the first place.
   */
  @Post('/instagram')
  @HttpCode(200)
  instagramWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string
  ) {
    const ok = verifyInstagramSignature(
      req.rawBody,
      signature,
      process.env.INSTAGRAM_APP_SECRET
    );

    if (!ok) {
      // Still 200. A 4xx makes Meta retry the same rejected payload and can get
      // the subscription disabled; the payload is dropped either way.
      this.logger.warn('Rejected an Instagram webhook with a bad or missing signature.');
      return 'EVENT_RECEIVED';
    }

    const events = parseInstagramWebhook(req.body);

    // Fire and forget: the HTTP response must not wait on Instagram API calls.
    // ingest() never throws, but the catch is here so a future change cannot
    // turn a processing bug into an unhandled rejection.
    for (const event of events) {
      this._automation
        .ingest(event)
        .catch((e) => this.logger.error(`automation ingest error: ${e?.message}`, e?.stack));
    }

    return 'EVENT_RECEIVED';
  }
}
