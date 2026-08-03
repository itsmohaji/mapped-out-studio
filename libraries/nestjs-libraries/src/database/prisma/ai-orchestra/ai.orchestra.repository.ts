import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export interface SkillWrite {
  key?: string;
  name?: string;
  role?: string;
  description?: string | null;
  provider?: string;
  model?: string;
  active?: boolean;
}

export interface CapabilityWrite {
  key?: string;
  name?: string;
  description?: string | null;
  skillKeys?: string;
  kind?: string;
  minPlan?: string;
  enabled?: boolean;
  sortOrder?: number;
}

export interface BriefWrite {
  audience?: string | null;
  tone?: string | null;
  dos?: string | null;
  donts?: string | null;
  products?: string | null;
  notes?: string | null;
}

@Injectable()
export class AiOrchestraRepository {
  constructor(
    private _skill: PrismaRepository<'aiSkill'>,
    private _version: PrismaRepository<'aiSkillVersion'>,
    private _capability: PrismaRepository<'aiCapability'>,
    private _run: PrismaRepository<'aiRun'>,
    private _entitlement: PrismaRepository<'aiEntitlement'>,
    private _brief: PrismaRepository<'aiBrandBrief'>
  ) {}

  skills() {
    return this._skill.model.aiSkill.findMany({
      orderBy: { name: 'asc' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
  }

  skillByKey(key: string) {
    return this._skill.model.aiSkill.findUnique({
      where: { key },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
  }

  upsertSkill(key: string, data: SkillWrite) {
    return this._skill.model.aiSkill.upsert({
      where: { key },
      create: {
        key,
        name: data.name || key,
        role: data.role || key,
        description: data.description ?? null,
        provider: data.provider || 'openai',
        model: data.model || 'gpt-4o-mini',
        active: data.active ?? true,
      },
      update: data,
    });
  }

  /**
   * Versions are immutable — a new instruction always becomes the NEXT version
   * rather than editing the one a past run recorded.
   */
  async addSkillVersion(skillId: string, instruction: string, notes?: string) {
    const last = await this._version.model.aiSkillVersion.findFirst({
      where: { skillId },
      orderBy: { version: 'desc' },
    });
    return this._version.model.aiSkillVersion.create({
      data: {
        skillId,
        version: (last?.version || 0) + 1,
        instruction,
        notes: notes ?? null,
      },
    });
  }

  capabilities() {
    return this._capability.model.aiCapability.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  capabilityByKey(key: string) {
    return this._capability.model.aiCapability.findUnique({ where: { key } });
  }

  upsertCapability(key: string, data: CapabilityWrite) {
    return this._capability.model.aiCapability.upsert({
      where: { key },
      create: {
        key,
        name: data.name || key,
        description: data.description ?? null,
        skillKeys: data.skillKeys || '',
        kind: data.kind || 'text',
        minPlan: data.minPlan || 'FREE',
        enabled: data.enabled ?? false,
        sortOrder: data.sortOrder ?? 0,
      },
      update: data,
    });
  }

  entitlement(orgId: string) {
    return this._entitlement.model.aiEntitlement.findUnique({
      where: { orgId },
    });
  }

  upsertEntitlement(
    orgId: string,
    data: { monthlyCredits: number; monthlyImages: number; notes?: string }
  ) {
    return this._entitlement.model.aiEntitlement.upsert({
      where: { orgId },
      create: { orgId, ...data },
      update: data,
    });
  }

  /** Usage for the current calendar month — the window credits reset on. */
  async usageThisMonth(orgId: string) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const rows = await this._run.model.aiRun.findMany({
      // Refused runs are logged but must NOT consume credit.
      where: { orgId, createdAt: { gte: start }, status: 'ok' },
      select: {
        promptTokens: true,
        outputTokens: true,
        imageCount: true,
        costMicros: true,
        credits: true,
      },
    });

    let creditsUsed = 0;
    let imagesUsed = 0;
    let costMicros = 0;
    for (const r of rows as any[]) {
      // The stored, task-weighted credit is authoritative. The token derivation
      // is the fallback for runs written before pricing knew about tasks —
      // re-deriving those would be the only honest option anyway, since the task
      // they ran is not recorded on them.
      if (r.credits != null) {
        creditsUsed += r.credits;
      } else {
        const total = (r.promptTokens || 0) + (r.outputTokens || 0);
        creditsUsed += total ? Math.max(1, Math.round(total / 1000)) : 1;
      }
      imagesUsed += r.imageCount || 0;
      costMicros += r.costMicros || 0;
    }
    return { creditsUsed, imagesUsed, costMicros, runs: rows.length };
  }

  logRun(data: {
    orgId: string;
    userId?: string | null;
    capabilityKey: string;
    skillKey?: string | null;
    skillVersion?: number | null;
    provider?: string | null;
    model?: string | null;
    status: string;
    refusedReason?: string | null;
    promptTokens?: number | null;
    outputTokens?: number | null;
    costMicros?: number | null;
    imageCount?: number;
    durationMs?: number | null;
    task?: string | null;
    credits?: number | null;
  }) {
    return this._run.model.aiRun.create({ data: data as any });
  }

  runs(orgId: string, take = 50) {
    return this._run.model.aiRun.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  briefs(orgId: string) {
    return this._brief.model.aiBrandBrief.findMany({
      where: { orgId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Admin write for the brand brief. Find-then-write rather than upsert:
   * Postgres treats NULL customerIds as distinct, so a unique index on
   * (orgId, customerId) would not actually constrain the org-wide row.
   *
   * Lives here, with the other admin configuration, so that the context
   * repository on the run path stays provably read-only.
   */
  async saveBrief(
    orgId: string,
    customerId: string | null,
    data: BriefWrite
  ) {
    const existing = await this._brief.model.aiBrandBrief.findFirst({
      where: { orgId, customerId, deletedAt: null },
    });
    if (existing) {
      return this._brief.model.aiBrandBrief.update({
        where: { id: existing.id },
        data,
      });
    }
    return this._brief.model.aiBrandBrief.create({
      data: { orgId, customerId, ...data },
    });
  }
}
