import { Injectable } from '@nestjs/common';
import {
  TasksRepository,
  TaskFilters,
  TaskWrite,
} from '@gitroom/nestjs-libraries/database/prisma/tasks/tasks.repository';

@Injectable()
export class TasksService {
  constructor(private _tasks: TasksRepository) {}

  list(orgId: string, filters: TaskFilters) {
    return this._tasks.list(orgId, filters);
  }
  summary(orgId: string, userId: string) {
    return this._tasks.summary(orgId, userId);
  }
  getOne(orgId: string, id: string) {
    return this._tasks.getOne(orgId, id);
  }
  create(orgId: string, userId: string, data: TaskWrite) {
    return this._tasks.create(orgId, userId, data);
  }
  update(orgId: string, id: string, data: TaskWrite) {
    const completed: { completedAt?: Date | null } =
      data.status === 'done'
        ? { completedAt: new Date() }
        : data.status
        ? { completedAt: null }
        : {};
    return this._tasks.update(orgId, id, { ...data, ...completed });
  }
  remove(orgId: string, id: string) {
    return this._tasks.softDelete(orgId, id);
  }
}
