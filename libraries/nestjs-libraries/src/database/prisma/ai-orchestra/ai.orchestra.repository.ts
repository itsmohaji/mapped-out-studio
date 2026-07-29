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

@Injectable()
export class AiOrchestraRepository {
  constructor(
    private _skill: PrismaRepository<'aiSkill'>,
    private _version: PrismaRepository<'aiSkillVersion'>,
    private _capability: PrismaRepository<'aiCapability'>,
    private _run: PrismaRepository<'aiRun'>,
    private _entitlement: PrismaRepository<'aiEntitlement'>
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
      },
    });

    let creditsUsed = 0;
    let imagesUsed = 0;
    let costMicros = 0;
    for (const r of rows) {
      const total = (r.promptTokens || 0) + (r.outputTokens || 0);
      creditsUsed += total ? Math.max(1, Math.round(total / 1000)) : 1;
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
}
