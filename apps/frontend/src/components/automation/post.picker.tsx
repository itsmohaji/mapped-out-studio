'use client';

import React, { FC, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { Glass, Skeleton, EmptyState } from './automation.ui';

/**
 * Post picker.
 *
 * Reads the account's REAL Instagram media, not our own Post table. Posts made
 * before the account was connected — or straight from the Instagram app — exist
 * only on Instagram, and those are exactly the ones people want to attach an
 * automation to.
 *
 * The id shown here is Instagram's own media id, which is what the comments
 * webhook reports, so a binding made from this grid is live immediately.
 */

export interface InstagramMedia {
  id: string;
  caption: string;
  mediaType: string;
  thumbnail: string | null;
  permalink: string | null;
  timestamp: string | null;
  commentsCount: number | null;
}

const TYPE_BADGE: Record<string, string> = {
  VIDEO: 'Reel',
  CAROUSEL_ALBUM: 'Carousel',
  IMAGE: '',
};

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
      'flex-1 basis-[220px] min-w-0 text-left p-[16px] rounded-[14px] border transition-all duration-150 flex gap-[12px] items-start',
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
  onToggle: (mediaId: string) => void;
}> = ({ scope, selectedPostIds, integrationId, onScope, onToggle }) => {
  const fetchApi = useFetch();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, mutate } = useSWR<{
    posts: InstagramMedia[];
    cached: boolean;
    error?: string;
  }>(
    scope === 'specific' && integrationId
      ? `/automation/accounts/${integrationId}/posts`
      : null,
    async (url: string) => (await fetchApi(url)).json()
  );

  const posts = data?.posts ?? [];

  const refresh = async () => {
    if (!integrationId) return;
    setRefreshing(true);
    try {
      await mutate(
        (await fetchApi(`/automation/accounts/${integrationId}/posts?refresh=true`)).json()
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Glass className="p-[20px] flex flex-col gap-[16px]">
      <div>
        <div className="text-[14px] font-[600]">Which posts?</div>
        <p className="text-[12.5px] text-textItemBlur mt-[4px] leading-[1.5]">
          Run this on everything, or pick the exact posts it belongs to.
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
            <div className="grid gap-[10px] sm:gap-[12px] grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,145px),1fr))]">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[180px]" />
              ))}
            </div>
          )}

          {/* An Instagram error is the actionable case — say what it said. */}
          {!isLoading && !!data?.error && (
            <div className="text-[12.5px] rounded-[11px] px-[14px] py-[11px] border border-[#daa646]/35 bg-[#daa646]/10 text-[#daa646] leading-[1.5]">
              Instagram returned: {data.error}
              <div className="mt-[6px] text-textItemBlur">
                If this mentions the token or permissions, reconnect the account in Accounts.
              </div>
            </div>
          )}

          {!isLoading && !posts.length && !data?.error && (
            <EmptyState
              icon="📭"
              title="This account has no posts on Instagram"
              body="Nothing was returned from the account's media. Publish something first, or use “All posts”."
            />
          )}

          {!!posts.length && (
            <>
              <div className="flex items-center gap-[10px]">
                <div className="text-[11.5px] text-textItemBlur flex-1 min-w-0">
                  {selectedPostIds.length
                    ? `${selectedPostIds.length} selected`
                    : `${posts.length} posts from Instagram — tap to attach`}
                </div>
                <button
                  type="button"
                  onClick={refresh}
                  disabled={refreshing}
                  className="text-[11.5px] px-[10px] py-[5px] rounded-[8px] border border-white/[0.1] hover:border-btnPrimary hover:text-btnPrimary transition-colors disabled:opacity-50 shrink-0"
                >
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              <div className="grid gap-[10px] sm:gap-[12px] grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,145px),1fr))] max-h-[440px] overflow-y-auto pr-[4px]">
                {posts.map((p) => {
                  const selected = selectedPostIds.includes(p.id);
                  const badge = TYPE_BADGE[p.mediaType] ?? '';

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
                        {p.thumbnail ? (
                          <SafeImage
                            src={p.thumbnail}
                            alt=""
                            width={300}
                            height={300}
                            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                          />
                        ) : (
                          <span className="text-[22px] opacity-40">🖼️</span>
                        )}

                        {!!badge && (
                          <span className="absolute top-[7px] left-[7px] text-[9.5px] font-[600] px-[6px] py-[2px] rounded-[5px] bg-black/55 backdrop-blur-sm">
                            {badge}
                          </span>
                        )}
                        {selected && (
                          <span className="absolute top-[7px] right-[7px] w-[20px] h-[20px] rounded-full bg-btnPrimary flex items-center justify-center text-[11px] text-white">
                            ✓
                          </span>
                        )}
                      </div>

                      <div className="p-[9px]">
                        <div className="text-[11.5px] leading-[1.4] line-clamp-2 min-h-[32px]">
                          {p.caption || <span className="text-textItemBlur">No caption</span>}
                        </div>
                        <div className="text-[10.5px] text-textItemBlur mt-[5px] flex items-center gap-[6px]">
                          <span>
                            {p.timestamp ? dayjs(p.timestamp).format('D MMM YYYY') : '—'}
                          </span>
                          {typeof p.commentsCount === 'number' && (
                            <span className="shrink-0">💬 {p.commentsCount}</span>
                          )}
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
