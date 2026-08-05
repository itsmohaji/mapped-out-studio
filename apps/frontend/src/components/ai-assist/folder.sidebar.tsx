'use client';

import React, { FC, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  FolderRow,
  ThreadRow,
  addFolder,
  moveThread,
  renameFolder,
} from '@gitroom/frontend/components/ai-assist/threads.api';

/**
 * The thread library, on the right.
 *
 * Drag-and-drop uses native HTML5 events rather than a library: the whole
 * interaction is a dragstart, a dragover and a drop, and a dependency for three
 * handlers is not worth the bundle.
 *
 * The move is optimistic and reverts by revalidating on failure — a file that
 * snaps back is honest, a file that silently did not move is not.
 */
export const FolderSidebar: FC<{
  folders: FolderRow[];
  threads: ThreadRow[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}> = ({ folders, threads, activeThreadId, onSelect, onChanged }) => {
  const t = useT();
  const fetch = useFetch();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const onDropThread = async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDragOver(null);
    const threadId = e.dataTransfer.getData('text/plain');
    if (!threadId) return;
    try {
      await moveThread(fetch, threadId, folderId);
    } finally {
      onChanged();
    }
  };

  const recent = threads.filter((th) => !th.folderId);

  const ThreadLine: FC<{ thread: ThreadRow }> = ({ thread }) => (
    <button
      type="button"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', thread.id)}
      onClick={() => onSelect(thread.id)}
      className={clsx(
        'w-full text-start text-[11.5px] leading-[1.45] px-[8px] py-[5px] rounded-[7px] truncate',
        thread.id === activeThreadId
          ? 'bg-[var(--glass-2)] text-textItemFocused'
          : 'text-textItemBlur hover:text-textItemFocused'
      )}
    >
      {thread.title}
    </button>
  );

  return (
    <aside className="w-[186px] shrink-0 flex flex-col gap-[10px] ps-[12px] border-s border-[var(--gline)]">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-[700] uppercase tracking-[0.08em] text-textItemBlur">
          {t('library', 'Library')}
        </span>
        <button
          type="button"
          aria-label={t('add_folder', 'Add folder')}
          onClick={async () => {
            await addFolder(fetch, t('new_folder', 'New folder'));
            onChanged();
          }}
          className="text-textItemBlur hover:text-textItemFocused"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM12 11v4M10 13h4" />
          </svg>
        </button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver('recent');
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => onDropThread(e, null)}
        className={clsx(
          'rounded-[9px] p-[4px]',
          dragOver === 'recent' && 'ring-1 ring-btnPrimary'
        )}
      >
        <div className="flex items-center gap-[7px] px-[4px] py-[3px]">
          <span className="text-[11.5px] flex-1">{t('recent', 'Recent')}</span>
          <span className="text-[10.5px] text-textItemBlur tabular-nums">
            {recent.length}
          </span>
        </div>
        {recent.slice(0, 8).map((th) => (
          <ThreadLine key={th.id} thread={th} />
        ))}
      </div>

      {folders.map((folder) => {
        const inFolder = threads.filter((th) => th.folderId === folder.id);
        return (
          <div
            key={folder.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(folder.id);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDropThread(e, folder.id)}
            className={clsx(
              'rounded-[9px] p-[4px]',
              dragOver === folder.id && 'ring-1 ring-btnPrimary'
            )}
          >
            <div className="flex items-center gap-[7px] px-[4px] py-[3px]">
              {renaming === folder.id ? (
                <input
                  autoFocus
                  defaultValue={folder.name}
                  onBlur={async (e) => {
                    setRenaming(null);
                    await renameFolder(fetch, folder.id, e.target.value);
                    onChanged();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')
                      (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  className="flex-1 min-w-0 bg-newBgLineColor border border-btnPrimary rounded-[6px] px-[5px] py-[2px] text-[11.5px] outline-none"
                />
              ) : (
                <span
                  onDoubleClick={() => setRenaming(folder.id)}
                  className="text-[11.5px] flex-1 truncate cursor-default"
                >
                  {folder.name}
                </span>
              )}
              <span className="text-[10.5px] text-textItemBlur tabular-nums">
                {inFolder.length}
              </span>
            </div>
            {inFolder.slice(0, 8).map((th) => (
              <ThreadLine key={th.id} thread={th} />
            ))}
          </div>
        );
      })}

      <p className="text-[10.5px] text-textItemBlur leading-[1.5] border-t border-[var(--gline)] pt-[9px]">
        {t('folder_hint', 'Drag a chat onto a folder · double-click to rename')}
      </p>
    </aside>
  );
};
