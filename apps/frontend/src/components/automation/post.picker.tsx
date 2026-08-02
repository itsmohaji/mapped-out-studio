'use client';

import React, { FC, useMemo } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { Glass, PLATFORM_ICON, Skeleton, EmptyState } from './automation.ui';

interface PostRow {
  id: string;
  content?: string;
  image?: string | null;
  publishDate?: string;
  releaseURL?: string | null;
  state?: string;
  integration?: { id: string; name: string; providerIdentifier: string; picture?: string | null };
}

const firstImage = (image?: string | null): string | null => {
  if (!image) return null;
  try {
    const arr = JSON.parse(image);
    return Array.isArray(arr) && arr[0]?.path ? arr[0].path : null;
  } catch {
    return null;
  }
};

/** Captions arrive as HTML from the composer. */
const plain = (html?: string) =>
  (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const Choice: FC<{
  selected: boolean;
  title: string;
  body: string;
  icon: string;
  onClick: () => void;
}> = ({ selected, title, body, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      'flex-1 min-w-[220px] text-left p-[16px] rounded-[14px] border transition-all duration-150 flex gap-[12px] items-start',
      selected
        ? 'border-btnPrimary/50 bg-btnPrimary/10'
        : 'border-white/[0.08] hover:border-white/[0.2]'
    )}
  >
    <span className="text-[18px] leading-none mt-[1px]">{icon}</span>
    <span className="min-w-0">
      <span className="block text-[13.5px] font-[600]">{title}</span>
      <span className="block text-[11.5px] text-textItemBlur mt-[3px] leading-[1.45]">{body}</span>
    </span>
    <span
      className={clsx(
        'ml-auto w-[16px] h-[16px] rounded-full border shrink-0 mt-[2px] flex items-center justify-center',
        selected ? 'border-btnPrimary bg-btnPrimary' : 'border-white/25'
      )}
    >
      {selected && <span className="w-[6px] h-[6px] rounded-full bg-white" />}
    </span>
  </button>
);

export const PostPicker: FC<{
  scope: 'all' | 'specific';
  selectedPostIds: string[];
  integrationId?: string;
  onScope: (s: 'all' | 'specific') => void;
  onToggle: (postId: string) => void;
}> = ({ scope, selectedPostIds, integrationId, onScope, onToggle }) => {
  const fetchApi = useFetch();

  // Only fetched once the user actually asks for specific posts — no reason to
  // pull the whole post list for the common "all posts" case.
  const { data, isLoading } = useSWR<{ posts?: PostRow[] } | PostRow[]>(
    scope === 'specific' ? '/posts/list' : null,
    async (url: string) => (await fetchApi(url)).json()
  );

  const posts = useMemo(() => {
    const rows: PostRow[] = Array.isArray(data) ? data : data?.posts ?? [];
    return rows
      .filter((p) => !integrationId || p.integration?.id === integrationId)
      .slice(0, 60);
  }, [data, integrationId]);

  return (
    <Glass className="p-[20px] flex flex-col gap-[16px]">
      <div>
        <div className="text-[14px] font-[600]">Which posts?</div>
        <p className="text-[12.5px] text-textItemBlur mt-[4px] leading-[1.5]">
          Run this on everything you publish, or pick the exact posts it belongs to.
        </p>
      </div>

      <div className="flex flex-wrap gap-[10px]">
        <Choice
          selected={scope === 'all'}
          icon="🌐"
          title="All posts"
          body="Any comment on any post on this account"
          onClick={() => onScope('all')}
        />
        <Choice
          selected={scope === 'specific'}
          icon="🎯"
          title="Specific posts"
          body="Only the posts you choose below"
          onClick={() => onScope('specific')}
        />
      </div>

      {scope === 'specific' && (
        <div className="flex flex-col gap-[12px] pt-[6px]">
          {isLoading && (
            <div className="grid gap-[12px] grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[180px]" />
              ))}
            </div>
          )}

          {!isLoading && !posts.length && (
            <EmptyState
              icon="📭"
              title="No published posts yet"
              body="Once this account has published something, it will show up here to attach an automation to."
            />
          )}

          {!!posts.length && (
            <>
              <div className="text-[11.5px] text-textItemBlur">
                {selectedPostIds.length
                  ? `${selectedPostIds.length} selected`
                  : 'Tap a post to attach this automation to it'}
              </div>
              <div className="grid gap-[12px] grid-cols-[repeat(auto-fill,minmax(150px,1fr))] max-h-[420px] overflow-y-auto pr-[4px]">
                {posts.map((p) => {
                  const selected = selectedPostIds.includes(p.id);
                  const img = firstImage(p.image);
                  const caption = plain(p.content);
                  const provider = p.integration?.providerIdentifier ?? '';
                  const channel = provider.replace('-standalone', '');

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onToggle(p.id)}
                      className={clsx(
                        'text-left rounded-[12px] overflow-hidden border transition-all duration-150 group',
                        selected
                          ? 'border-btnPrimary ring-[2px] ring-btnPrimary/25'
                          : 'border-white/[0.08] hover:border-white/[0.22]'
                      )}
                    >
                      <div className="relative aspect-square bg-white/[0.04] flex items-center justify-center overflow-hidden">
                        {img ? (
                          <SafeImage
                            src={img}
                            alt=""
                            width={300}
                            height={300}
                            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                          />
                        ) : (
                          <span className="text-[22px] opacity-40">📄</span>
                        )}
                        <span className="absolute top-[7px] left-[7px] text-[11px] w-[22px] h-[22px] rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center">
                          {PLATFORM_ICON[channel] ?? '🔗'}
                        </span>
                        {selected && (
                          <span className="absolute top-[7px] right-[7px] w-[20px] h-[20px] rounded-full bg-btnPrimary flex items-center justify-center text-[11px] text-white">
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="p-[9px]">
                        <div className="text-[11.5px] leading-[1.4] line-clamp-2 min-h-[32px]">
                          {caption || <span className="text-textItemBlur">No caption</span>}
                        </div>
                        <div className="text-[10.5px] text-textItemBlur mt-[5px]">
                          {p.publishDate ? dayjs(p.publishDate).format('D MMM YYYY') : '—'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Glass>
  );
};
