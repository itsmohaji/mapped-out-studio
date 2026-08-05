import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AiThreadsRepository,
  MessageWrite,
} from '@gitroom/nestjs-libraries/database/prisma/ai-threads/ai.threads.repository';
import {
  threadTitleFrom,
  DEFAULT_FOLDERS,
} from '@gitroom/helpers/utils/ai.threads';

/**
 * AI Assistant threads.
 *
 * Every id that arrives from a browser is re-checked against the caller's
 * organisation here. There is exactly one helper per resource that does it, so
 * a new method cannot forget: it has no other way to turn an id into a row.
 *
 * Internal only. There is deliberately no visibility field and no client
 * surface — a CLIENT-role request never reaches this service because no AI
 * controller marks itself open to client-role callers (ADR-006).
 */
@Injectable()
export class AiThreadsService {
  constructor(private _repo: AiThreadsRepository) {}

  private async _ownedThread(orgId: string, threadId: string) {
    const thread = await this._repo.threadById(threadId);
    if (!thread || thread.orgId !== orgId || thread.deletedAt) {
      throw new ForbiddenException();
    }
    return thread;
  }

  private async _ownedFolder(orgId: string, folderId: string) {
    const folder = await this._repo.folderById(folderId);
    if (!folder || folder.orgId !== orgId || folder.deletedAt) {
      throw new ForbiddenException();
    }
    return folder;
  }

  /**
   * Folders seed on first read rather than at boot: a workspace that never
   * opens the assistant should not accumulate rows, and this runs once.
   */
  async library(orgId: string) {
    let folders = await this._repo.folders(orgId);
    if (!folders.length) {
      for (let i = 0; i < DEFAULT_FOLDERS.length; i++) {
        await this._repo.createFolder(orgId, DEFAULT_FOLDERS[i], i);
      }
      folders = await this._repo.folders(orgId);
    }
    const threads = await this._repo.threads(orgId);
    return { folders, threads };
  }

  async thread(orgId: string, threadId: string) {
    const thread = await this._ownedThread(orgId, threadId);
    return {
      thread,
      messages: await this._repo.messages(threadId),
    };
  }

  /** Creates a thread from its first user message and returns both. */
  async start(params: {
    orgId: string;
    userId?: string | null;
    customerId?: string | null;
    text: string;
    folderId?: string | null;
  }) {
    if (params.folderId) await this._ownedFolder(params.orgId, params.folderId);

    const thread = await this._repo.createThread({
      orgId: params.orgId,
      userId: params.userId ?? null,
      customerId: params.customerId ?? null,
      title: threadTitleFrom(params.text),
      folderId: params.folderId ?? null,
    });

    const message = await this._repo.addMessage({
      threadId: thread.id,
      role: 'user',
      text: params.text,
    });

    return { thread, message };
  }

  async append(params: {
    orgId: string;
    threadId: string;
    role: 'user' | 'assistant';
    text: string;
    sections?: any;
    capabilityKey?: string | null;
  }) {
    await this._ownedThread(params.orgId, params.threadId);
    const write: MessageWrite = {
      threadId: params.threadId,
      role: params.role,
      text: params.text,
      sections: params.sections ?? undefined,
      capabilityKey: params.capabilityKey ?? null,
    };
    const message = await this._repo.addMessage(write);
    await this._repo.touchThread(params.threadId);
    return message;
  }

  async move(orgId: string, threadId: string, folderId: string | null) {
    await this._ownedThread(orgId, threadId);
    if (folderId) await this._ownedFolder(orgId, folderId);
    return this._repo.updateThread(threadId, { folderId });
  }

  async rename(orgId: string, threadId: string, title: string) {
    await this._ownedThread(orgId, threadId);
    return this._repo.updateThread(threadId, {
      title: title.trim().slice(0, 120) || 'New chat',
    });
  }

  async remove(orgId: string, threadId: string) {
    await this._ownedThread(orgId, threadId);
    return this._repo.softDeleteThread(threadId);
  }

  async addFolder(orgId: string, name: string) {
    const existing = await this._repo.folders(orgId);
    return this._repo.createFolder(
      orgId,
      name.trim().slice(0, 60) || 'New folder',
      existing.length
    );
  }

  async renameFolder(orgId: string, folderId: string, name: string) {
    await this._ownedFolder(orgId, folderId);
    return this._repo.renameFolder(
      folderId,
      name.trim().slice(0, 60) || 'New folder'
    );
  }

  /** Threads in a removed folder return to Recent — deleting a folder is not
   *  a way to lose work. */
  async removeFolder(orgId: string, folderId: string) {
    await this._ownedFolder(orgId, folderId);
    await this._repo.detachThreadsFromFolder(folderId);
    return this._repo.softDeleteFolder(folderId);
  }
}
