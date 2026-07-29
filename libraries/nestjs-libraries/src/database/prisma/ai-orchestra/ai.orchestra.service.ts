import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AiOrchestraRepository,
  BriefWrite,
  CapabilityWrite,
  SkillWrite,
} from '@gitroom/nestjs-libraries/database/prisma/ai-orchestra/ai.orchestra.repository';
import {
  getProvider,
  listProviders,
} from '@gitroom/nestjs-libraries/ai-orchestra/providers';
import {
  canRun,
  costMicros,
  remaining,
  skillPipeline,
  toClientCapability,
} from '@gitroom/helpers/utils/ai.orchestra';
import {
  ENABLED_CAPABILITIES,
  SKILL_INSTRUCTIONS,
  isStub,
} from '@gitroom/helpers/utils/ai.skills';
import {
  coverageOf,
  hasEnoughData,
  renderContext,
} from '@gitroom/helpers/utils/ai.context';
import { AiContextService } from '@gitroom/nestjs-libraries/database/prisma/ai-orchestra/ai.context.service';
import { Organization } from '@prisma/client';

// Seeded once so an admin has something to configure rather than a blank console.
// Skills ship with a STUB instruction on purpose — real prompt engineering per
// skill is the next phase, and a stub is honest where a fake prompt is not.
const SEED_SKILLS: Array<SkillWrite & { key: string }> = [
  { key: 'strategist', name: 'Marketing Strategist', role: 'strategy' },
  { key: 'analyst', name: 'Social Media Analyst', role: 'analysis' },
  { key: 'creative_director', name: 'Creative Director', role: 'creative' },
  { key: 'art_director', name: 'Art Director', role: 'art' },
  { key: 'copywriter', name: 'Copywriter', role: 'copy' },
  { key: 'performance_analyst', name: 'Performance Analyst', role: 'performance' },
  { key: 'final_reviewer', name: 'Final Reviewer', role: 'review' },
];

const SEED_CAPABILITIES: Array<CapabilityWrite & { key: string }> = [
  { key: 'analyze_account', name: 'Analyze Account', skillKeys: 'analyst', sortOrder: 1 },
  { key: 'monthly_plan', name: 'Generate Monthly Plan', skillKeys: 'strategist,final_reviewer', sortOrder: 2 },
  { key: 'campaign_strategy', name: 'Create Campaign Strategy', skillKeys: 'strategist', sortOrder: 3 },
  { key: 'content_ideas', name: 'Generate Content Ideas', skillKeys: 'creative_director,copywriter', sortOrder: 4 },
  { key: 'write_captions', name: 'Write Captions', skillKeys: 'copywriter,final_reviewer', sortOrder: 5 },
  { key: 'generate_images', name: 'Generate Images', skillKeys: 'art_director', kind: 'image', sortOrder: 6 },
  { key: 'target_audience', name: 'Recommend Target Audience', skillKeys: 'analyst,strategist', sortOrder: 7 },
  { key: 'recommend_budget', name: 'Recommend Budget', skillKeys: 'performance_analyst', sortOrder: 8 },
  { key: 'performance_recos', name: 'Performance Recommendations', skillKeys: 'performance_analyst,final_reviewer', sortOrder: 9 },
];

const DEFAULT_ENTITLEMENT = { monthlyCredits: 200, monthlyImages: 20 };

@Injectable()
export class AiOrchestraService implements OnModuleInit {
  constructor(
    private _repo: AiOrchestraRepository,
    private _context: AiContextService
  ) {}

  async onModuleInit() {
    // Idempotent: upserts by key, so a redeploy never duplicates or overwrites
    // an admin's edits to name/model/enabled.
    try {
      for (const s of SEED_SKILLS) {
        const existing = await this._repo.skillByKey(s.key);
        if (existing) continue;
        const created = await this._repo.upsertSkill(s.key, s);
        await this._repo.addSkillVersion(
          created.id,
          `You are the ${s.name}. (Stub instruction — pending prompt engineering.)`,
          'seed'
        );
      }
      for (const c of SEED_CAPABILITIES) {
        const existing = await this._repo.capabilityByKey(c.key);
        if (existing) continue;
        // Seeded DISABLED — an admin turns each one on deliberately.
        await this._repo.upsertCapability(c.key, { ...c, enabled: false });
      }
      await this.installRealInstructions();
    } catch {
      // Boot must never fail because of seeding. The tables arrive with
      // `prisma db push` on the same boot; a first-run race just retries next time.
    }
  }

  /**
   * Replaces the foundation's stub instructions with the real ones, then turns
   * on the capabilities those skills now support.
   *
   * Two deliberate guards:
   *
   * - A new instruction is added ONLY when the current latest version is still a
   *   stub. Versions are immutable and an admin's own edit is never overwritten.
   * - `enabled` is set ONLY on the boot that performed the upgrade. After that
   *   this never touches the flag again, so an admin who switches a capability
   *   off keeps it off across every subsequent redeploy.
   */
  private async installRealInstructions() {
    let upgradedAny = false;

    for (const { key, instruction } of SKILL_INSTRUCTIONS) {
      const skill = await this._repo.skillByKey(key);
      if (!skill) continue;
      const latest = skill.versions?.[0];
      if (latest && !isStub(latest.instruction)) continue;
      await this._repo.addSkillVersion(skill.id, instruction, 'phase2');
      upgradedAny = true;
    }

    if (!upgradedAny) return;

    for (const [key, pipeline] of Object.entries(ENABLED_CAPABILITIES)) {
      const capability = await this._repo.capabilityByKey(key);
      if (!capability) continue;
      await this._repo.upsertCapability(key, {
        skillKeys: pipeline.join(','),
        enabled: true,
      });
    }
  }

  providers() {
    return listProviders();
  }

  skills() {
    return this._repo.skills();
  }

  saveSkill(key: string, data: SkillWrite) {
    return this._repo.upsertSkill(key, data);
  }

  async saveSkillInstruction(key: string, instruction: string, notes?: string) {
    const skill = await this._repo.skillByKey(key);
    if (!skill) return null;
    return this._repo.addSkillVersion(skill.id, instruction, notes);
  }

  capabilities() {
    return this._repo.capabilities();
  }

  saveCapability(key: string, data: CapabilityWrite) {
    return this._repo.upsertCapability(key, data);
  }

  async entitlementFor(orgId: string) {
    return (await this._repo.entitlement(orgId)) || DEFAULT_ENTITLEMENT;
  }

  saveEntitlement(
    orgId: string,
    data: { monthlyCredits: number; monthlyImages: number; notes?: string }
  ) {
    return this._repo.upsertEntitlement(orgId, data);
  }

  usage(orgId: string) {
    return this._repo.usageThisMonth(orgId);
  }

  /** Clients the operator can target a run at. Names only. */
  customers(orgId: string) {
    return this._context.customers(orgId);
  }

  briefs(orgId: string) {
    return this._repo.briefs(orgId);
  }

  async saveBrief(orgId: string, customerId: string | null, data: BriefWrite) {
    // A brief for a client of another workspace would be inert (reads are
    // org-scoped) but it should not be storable at all.
    if (customerId) {
      const resolved = await this._context.resolveCustomer(orgId, customerId);
      if (!resolved.ok) return null;
    }
    return this._repo.saveBrief(orgId, customerId || null, data);
  }

  runs(orgId: string) {
    return this._repo.runs(orgId);
  }

  /**
   * What THIS org can see. Returns client-safe shapes only — no skills, models,
   * providers or prompts ever cross this boundary.
   */
  async clientCapabilities(orgId: string, orgPlan: string) {
    const [caps, entitlement, usage] = await Promise.all([
      this._repo.capabilities(),
      this.entitlementFor(orgId),
      this._repo.usageThisMonth(orgId),
    ]);

    const items = caps.map((c) =>
      toClientCapability(
        c as any,
        canRun({
          capability: c as any,
          orgPlan,
          entitlement,
          usage,
          providerAvailable: !!getProvider('openai')?.available(),
        })
      )
    );

    return {
      capabilities: items,
      credits: {
        creditsUsed: usage.creditsUsed,
        creditsRemaining: remaining(entitlement.monthlyCredits, usage.creditsUsed),
        imagesUsed: usage.imagesUsed,
        imagesRemaining: remaining(entitlement.monthlyImages, usage.imagesUsed),
      },
    };
  }

  /**
   * Run a capability. Produces CONTENT and nothing else.
   *
   * This service has no reference to the posting service, no scheduling call and
   * no integration token, so there is no code path from here to a publish. That
   * is the hard rule of AI Orchestra, enforced structurally rather than by
   * convention: output goes to the operator, who reviews it, and the existing
   * DBU portal approval path takes it from there.
   */
  async run(params: {
    org: Organization;
    orgPlan: string;
    userId?: string;
    capabilityKey: string;
    input: string;
    customerId?: string | null;
    timeframeDays?: number | null;
  }) {
    const { org, orgPlan, userId, capabilityKey, input } = params;
    const orgId = org.id;
    const started = Date.now();

    const capability = await this._repo.capabilityByKey(capabilityKey);
    if (!capability) {
      return { ok: false as const, message: 'This capability is not available yet.' };
    }

    const [entitlement, usage] = await Promise.all([
      this.entitlementFor(orgId),
      this._repo.usageThisMonth(orgId),
    ]);

    const provider = getProvider('openai');
    const decision = canRun({
      capability: capability as any,
      orgPlan,
      entitlement,
      usage,
      providerAvailable: !!provider?.available(),
    });

    if (!decision.allowed) {
      // Refusals are logged too — "why did nothing happen" must be answerable.
      await this._repo.logRun({
        orgId,
        userId,
        capabilityKey,
        status: 'refused',
        refusedReason: decision.reason,
      });
      return { ok: false as const, message: decision.message };
    }

    // Resolve the client BEFORE building anything. An id that is not this
    // organisation's is refused outright rather than quietly falling back to the
    // whole workspace, which would be a cross-tenant leak dressed up as a
    // default.
    const resolved = await this._context.resolveCustomer(
      orgId,
      params.customerId
    );
    if (!resolved.ok) {
      await this._repo.logRun({
        orgId,
        userId,
        capabilityKey,
        status: 'refused',
        refusedReason: 'unknown_customer',
      });
      return { ok: false as const, message: 'That client could not be found.' };
    }

    const context = await this._context.build({
      org,
      customerId: resolved.customer?.id ?? null,
      customerName: resolved.customer?.name ?? null,
      timeframeDays: params.timeframeDays,
    });

    // A capability that makes claims about performance needs something to base
    // them on. Refused here rather than letting the model fill the gap with
    // something plausible — and a refusal consumes no credit.
    const coverage = coverageOf(context);
    const enough = hasEnoughData(capabilityKey, coverage);
    if (!enough.ok) {
      await this._repo.logRun({
        orgId,
        userId,
        capabilityKey,
        status: 'refused',
        refusedReason: 'insufficient_data',
      });
      return { ok: false as const, message: enough.message };
    }

    const contextBlock = renderContext(context);

    const pipeline = skillPipeline(capability as any);
    let carried = '';
    let lastSkill: string | null = null;
    let lastVersion: number | null = null;
    let lastModel: string | null = null;
    let promptTokens = 0;
    let outputTokens = 0;

    for (const skillKey of pipeline) {
      const skill = await this._repo.skillByKey(skillKey);
      if (!skill || !skill.active) continue;
      const version = skill.versions?.[0];
      if (!version) continue;

      const skillProvider = getProvider(skill.provider);
      if (!skillProvider?.available()) {
        await this._repo.logRun({
          orgId,
          userId,
          capabilityKey,
          skillKey,
          status: 'refused',
          refusedReason: 'provider_unavailable',
        });
        return {
          ok: false as const,
          message: 'This capability is temporarily unavailable.',
        };
      }

      try {
        // Every skill sees the DATA block, not just the first one. Previously
        // the loop replaced the input with the previous skill's text, so the
        // Final Reviewer was checking a draft against nothing — it could not
        // see the figures it was supposed to be verifying, nor the brand brief
        // whose rules it was supposed to enforce.
        const res = await skillProvider.generateText({
          model: skill.model,
          instruction: version.instruction,
          input: [
            contextBlock,
            '',
            `REQUEST FROM THE OPERATOR:\n${input || '(none given)'}`,
            carried ? `\nDRAFT SO FAR (from a colleague):\n${carried}` : '',
          ].join('\n'),
        });
        carried = res.text || carried;
        promptTokens += res.promptTokens || 0;
        outputTokens += res.outputTokens || 0;
        lastSkill = skillKey;
        lastVersion = version.version;
        lastModel = skill.model;
      } catch (e: any) {
        await this._repo.logRun({
          orgId,
          userId,
          capabilityKey,
          skillKey,
          skillVersion: version.version,
          provider: skill.provider,
          model: skill.model,
          status: 'error',
          refusedReason: String(e?.message || 'error').slice(0, 300),
          durationMs: Date.now() - started,
        });
        return {
          ok: false as const,
          message: 'This capability is temporarily unavailable.',
        };
      }
    }

    await this._repo.logRun({
      orgId,
      userId,
      capabilityKey,
      skillKey: lastSkill,
      skillVersion: lastVersion,
      provider: 'openai',
      model: lastModel,
      status: 'ok',
      promptTokens: promptTokens || null,
      outputTokens: outputTokens || null,
      costMicros: costMicros(lastModel || '', promptTokens, outputTokens),
      durationMs: Date.now() - started,
    });

    // Content only. Never a post id, never a schedule, never an integration.
    // `coverage` travels with it so the operator can see what the answer was
    // based on before they read the answer.
    return { ok: true as const, output: carried, coverage };
  }
}
