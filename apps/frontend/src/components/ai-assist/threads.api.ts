'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export interface ThreadRow {
  id: string;
  title: string;
  folderId: string | null;
  updatedAt: string;
}

export interface FolderRow {
  id: string;
  name: string;
  sortOrder: number;
}

export interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sections?: any;
  capabilityKey?: string | null;
  createdAt: string;
}

type Fetcher = ReturnType<typeof useFetch>;

const post = async (fetch: Fetcher, url: string, body?: any) =>
  (
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    })
  ).json();

export const useLibrary = () => {
  const fetch = useFetch();
  const load = useCallback(
    async (url: string) => (await fetch(url)).json(),
    []
  );
  return useSWR<{ folders: FolderRow[]; threads: ThreadRow[] }>(
    '/ai-threads/library',
    load,
    { revalidateOnFocus: false }
  );
};

export const useThread = (id: string | null) => {
  const fetch = useFetch();
  const load = useCallback(
    async (url: string) => (await fetch(url)).json(),
    []
  );
  return useSWR<{ thread: ThreadRow; messages: MessageRow[] }>(
    id ? `/ai-threads/${id}` : null,
    load,
    { revalidateOnFocus: false }
  );
};

export const startThread = (
  fetch: Fetcher,
  body: { text: string; folderId?: string | null; customerId?: string }
) => post(fetch, '/ai-threads/start', body);

export const sendMessage = (
  fetch: Fetcher,
  threadId: string,
  body: {
    role: 'user' | 'assistant';
    text: string;
    sections?: any;
    capabilityKey?: string | null;
  }
) => post(fetch, `/ai-threads/${threadId}/message`, body);

export const moveThread = (
  fetch: Fetcher,
  threadId: string,
  folderId: string | null
) => post(fetch, `/ai-threads/${threadId}/move`, { folderId });

export const renameThread = (fetch: Fetcher, threadId: string, title: string) =>
  post(fetch, `/ai-threads/${threadId}/rename`, { title });

export const deleteThread = (fetch: Fetcher, threadId: string) =>
  post(fetch, `/ai-threads/${threadId}/delete`);

export const addFolder = (fetch: Fetcher, name: string) =>
  post(fetch, '/ai-threads/folder', { name });

export const renameFolder = (fetch: Fetcher, folderId: string, name: string) =>
  post(fetch, `/ai-threads/folder/${folderId}/rename`, { name });

export const deleteFolder = (fetch: Fetcher, folderId: string) =>
  post(fetch, `/ai-threads/folder/${folderId}/delete`);
