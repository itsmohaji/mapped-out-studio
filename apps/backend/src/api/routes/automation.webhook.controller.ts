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
  resolveVerifyToken,
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

  /**
   * Readiness probe. Booleans only — never the token or the secret.
   *
   * Unauthenticated on purpose: the whole point is to confirm from outside that
   * the callback is wired before anyone clicks "Verify and Save" in Meta, and
   * an authenticated check cannot answer that question for the person setting
   * it up. It reveals only whether two env vars are non-empty.
   */
  @Get('/instagram/status')
  instagramStatus() {
    const token = resolveVerifyToken();

    /**
     * Run Meta's handshake against ourselves with the real configured token.
     *
     * This is the only way to prove the POSITIVE path works without publishing
     * the token: it exercises the exact function the live GET uses, including
     * the constant-time comparison, and reports pass/fail only. Without it,
     * "configured" and "actually works" are two different claims and nobody
     * finds out which they have until Meta says "verification failed".
     */
    const selfTest =
      token &&
      verifyChallenge(
        {
          'hub.mode': 'subscribe',
          'hub.verify_token': token,
          'hub.challenge': 'selftest-challenge',
        },
        token
      ) === 'selftest-challenge';

    // A wrong token must NOT echo. Proving the guard still rejects matters as
    // much as proving the happy path accepts.
    const rejectsWrongToken =
      verifyChallenge(
        {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'definitely-not-the-token',
          'hub.challenge': 'selftest-challenge',
        },
        token
      ) === null;

    return {
      endpoint: 'ready',
      verifyTokenConfigured: !!token,
      signatureSecretConfigured: !!process.env.INSTAGRAM_APP_SECRET,
      // Derived means no separate secret had to be set anywhere.
      verifyTokenSource: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ? 'env' : 'derived',
      handshakeSelfTest: selfTest ? 'pass' : 'fail',
      rejectsWrongToken: rejectsWrongToken ? 'pass' : 'fail',
      readyForMetaVerification: !!token && !!selfTest && !!rejectsWrongToken,
    };
  }

  /** Meta's one-time subscription handshake. */
  @Get('/instagram')
  instagramChallenge(@Query() query: Record<string, any>) {
    const challenge = verifyChallenge(query, resolveVerifyToken());
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
