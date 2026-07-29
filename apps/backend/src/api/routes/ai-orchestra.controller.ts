import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { AiOrchestraService } from '@gitroom/nestjs-libraries/database/prisma/ai-orchestra/ai.orchestra.service';

@ApiTags('AI Orchestra')
@Controller('/ai-orchestra')
export class AiOrchestraController {
  constructor(private _ai: AiOrchestraService) {}

  // Admin-only surface. Skills, prompts, models, providers and costs live here
  // and must never be reachable from the client-facing routes below.
  private assertAdmin(org: Organization) {
    const role = (org as any)?.users?.[0]?.role;
    if (role !== 'SUPERADMIN' && role !== 'ADMIN') {
      throw new ForbiddenException();
    }
  }

  // ---- client-facing ------------------------------------------------------

  @Get('/capabilities')
  capabilities(@GetOrgFromRequest() org: Organization) {
    const plan =
      (org as any)?.subscription?.subscriptionTier ||
      (!process.env.STRIPE_PUBLISHABLE_KEY ? 'ULTIMATE' : 'FREE');
    return this._ai.clientCapabilities(org.id, plan);
  }

  /** Clients a run can be targeted at. Names only — no channel, no credential. */
  @Get('/clients')
  clients(@GetOrgFromRequest() org: Organization) {
    return this._ai.customers(org.id);
  }

  @Post('/run')
  run(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body()
    body: {
      capabilityKey: string;
      input: string;
      customerId?: string;
      timeframeDays?: number;
    }
  ) {
    const plan =
      (org as any)?.subscription?.subscriptionTier ||
      (!process.env.STRIPE_PUBLISHABLE_KEY ? 'ULTIMATE' : 'FREE');
    return this._ai.run({
      org,
      orgPlan: plan,
      userId: user.id,
      capabilityKey: String(body?.capabilityKey || ''),
      input: String(body?.input || '').slice(0, 8000),
      // Ownership is re-checked against this organisation inside the service —
      // an id from another workspace is refused, never silently ignored.
      customerId: body?.customerId ? String(body.customerId) : null,
      timeframeDays: body?.timeframeDays ? Number(body.timeframeDays) : null,
    });
  }

  // ---- admin console ------------------------------------------------------

  @Get('/admin/overview')
  async overview(@GetOrgFromRequest() org: Organization) {
    this.assertAdmin(org);
    const [skills, capabilities, usage, runs, entitlement] = await Promise.all([
      this._ai.skills(),
      this._ai.capabilities(),
      this._ai.usage(org.id),
      this._ai.runs(org.id),
      this._ai.entitlementFor(org.id),
    ]);
    return {
      providers: this._ai.providers(),
      skills,
      capabilities,
      usage,
      runs,
      entitlement,
    };
  }

  @Post('/admin/skill/:key')
  saveSkill(
    @GetOrgFromRequest() org: Organization,
    @Param('key') key: string,
    @Body() body: any
  ) {
    this.assertAdmin(org);
    return this._ai.saveSkill(key, body);
  }

  @Post('/admin/skill/:key/instruction')
  saveInstruction(
    @GetOrgFromRequest() org: Organization,
    @Param('key') key: string,
    @Body() body: { instruction: string; notes?: string }
  ) {
    this.assertAdmin(org);
    return this._ai.saveSkillInstruction(key, body.instruction, body.notes);
  }

  @Post('/admin/capability/:key')
  saveCapability(
    @GetOrgFromRequest() org: Organization,
    @Param('key') key: string,
    @Body() body: any
  ) {
    this.assertAdmin(org);
    return this._ai.saveCapability(key, body);
  }

  @Post('/admin/entitlement')
  saveEntitlement(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { monthlyCredits: number; monthlyImages: number; notes?: string }
  ) {
    this.assertAdmin(org);
    return this._ai.saveEntitlement(org.id, {
      monthlyCredits: Number(body.monthlyCredits) || 0,
      monthlyImages: Number(body.monthlyImages) || 0,
      notes: body.notes,
    });
  }

  @Get('/admin/brand-briefs')
  async brandBriefs(@GetOrgFromRequest() org: Organization) {
    this.assertAdmin(org);
    const [briefs, clients] = await Promise.all([
      this._ai.briefs(org.id),
      this._ai.customers(org.id),
    ]);
    return { briefs, clients };
  }

  @Post('/admin/brand-brief')
  saveBrandBrief(
    @GetOrgFromRequest() org: Organization,
    @Body()
    body: {
      customerId?: string | null;
      audience?: string;
      tone?: string;
      dos?: string;
      donts?: string;
      products?: string;
      notes?: string;
    }
  ) {
    this.assertAdmin(org);
    const text = (v?: string | null) =>
      v == null ? null : String(v).slice(0, 4000);
    return this._ai.saveBrief(org.id, body?.customerId || null, {
      audience: text(body?.audience),
      tone: text(body?.tone),
      dos: text(body?.dos),
      donts: text(body?.donts),
      products: text(body?.products),
      notes: text(body?.notes),
    });
  }
}
