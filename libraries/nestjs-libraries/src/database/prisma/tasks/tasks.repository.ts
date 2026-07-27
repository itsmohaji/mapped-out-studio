import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export interface TaskFilters {
  status?: string;
  type?: string;
  assigneeId?: string;
  customerId?: string;
}
export interface TaskWrite {
  title?: string;
  description?: string | null;
  type?: string;
  status?: string;
  priority?: string | null;
  dueAt?: Date | null;
  remindAt?: Date | null;
  assigneeId?: string | null;
  customerId?: string | null;
}

@Injectable()
export class TasksRepository {
  constructor(private _task: PrismaRepository<'task'>) {}

  list(orgId: string, filters: TaskFilters = {}) {
    return this._task.model.task.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
      },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  getOne(orgId: string, id: string) {
    return this._task.model.task.findFirst({ where: { id, orgId, deletedAt: null } });
  }

  async summary(orgId: string, userId: string) {
    const now = new Date();
    const mine = {
      orgId,
      deletedAt: null as Date | null,
      assigneeId: userId,
      status: { not: 'done' },
    };
    const [open, overdue] = await Promise.all([
      this._task.model.task.count({ where: mine }),
      this._task.model.task.count({ where: { ...mine, dueAt: { lt: now } } }),
    ]);
    return { open, overdue };
  }

  create(orgId: string, userId: string, data: TaskWrite) {
    return this._task.model.task.create({
      data: {
        orgId,
        createdById: userId,
        title: data.title!,
        description: data.description ?? null,
        type: data.type ?? 'task',
        status: data.status ?? 'todo',
        priority: data.priority ?? null,
        dueAt: data.dueAt ?? null,
        remindAt: data.remindAt ?? null,
        assigneeId: data.assigneeId ?? null,
        customerId: data.customerId ?? null,
      },
    });
  }

  update(orgId: string, id: string, data: TaskWrite & { completedAt?: Date | null }) {
    // Allowlist the writable columns — never spread the raw body into Prisma.
    // This blocks mass-assignment of orgId/id/createdById (tenant-move bypass)
    // and only writes fields that were actually provided (undefined = untouched).
    const allow = [
      'title', 'description', 'type', 'status', 'priority',
      'dueAt', 'remindAt', 'assigneeId', 'customerId', 'completedAt',
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allow) {
      const value = (data as Record<string, unknown>)[key];
      if (value !== undefined) patch[key] = value;
    }
    return this._task.model.task.updateMany({
      where: { id, orgId, deletedAt: null },
      data: patch,
    });
  }

  softDelete(orgId: string, id: string) {
    return this._task.model.task.updateMany({
      where: { id, orgId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
