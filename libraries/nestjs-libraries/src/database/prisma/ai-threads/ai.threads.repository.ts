import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export interface ThreadWrite {
  orgId?: string;
  userId?: string | null;
  customerId?: string | null;
  title?: string;
  folderId?: string | null;
}

export interface MessageWrite {
  threadId: string;
  role: 'user' | 'assistant';
  text: string;
  sections?: any;
  capabilityKey?: string | null;
}

/**
 * Prisma access for AI Assistant threads. No business rules and no ownership
 * decisions — those live in the service, which is the only caller.
 */
@Injectable()
export class AiThreadsRepository {
  constructor(
    private _thread: PrismaRepository<'aiThread'>,
    private _message: PrismaRepository<'aiMessage'>,
    private _folder: PrismaRepository<'aiFolder'>
  ) {}

  folders(orgId: string) {
    return this._folder.model.aiFolder.findMany({
      where: { orgId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  createFolder(orgId: string, name: string, sortOrder: number) {
    return this._folder.model.aiFolder.create({
      data: { orgId, name, sortOrder },
    });
  }

  folderById(id: string) {
    return this._folder.model.aiFolder.findUnique({ where: { id } });
  }

  renameFolder(id: string, name: string) {
    return this._folder.model.aiFolder.update({
      where: { id },
      data: { name },
    });
  }

  softDeleteFolder(id: string) {
    return this._folder.model.aiFolder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Threads whose folder was removed return to Recent rather than vanishing. */
  detachThreadsFromFolder(folderId: string) {
    return this._thread.model.aiThread.updateMany({
      where: { folderId },
      data: { folderId: null },
    });
  }

  threads(orgId: string) {
    return this._thread.model.aiThread.findMany({
      where: { orgId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  threadById(id: string) {
    return this._thread.model.aiThread.findUnique({ where: { id } });
  }

  createThread(data: ThreadWrite & { orgId: string; title: string }) {
    return this._thread.model.aiThread.create({ data });
  }

  updateThread(id: string, data: ThreadWrite) {
    return this._thread.model.aiThread.update({ where: { id }, data });
  }

  softDeleteThread(id: string) {
    return this._thread.model.aiThread.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  messages(threadId: string) {
    return this._message.model.aiMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });
  }

  addMessage(data: MessageWrite) {
    return this._message.model.aiMessage.create({ data });
  }

  /** Bumps the thread so Recent orders by real activity, not creation. */
  touchThread(id: string) {
    return this._thread.model.aiThread.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }
}
