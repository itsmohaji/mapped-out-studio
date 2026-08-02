'use client';

import React, { FC, useMemo } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { expandPostsList } from '@gitroom/helpers/utils/posts.list.minify';
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

const STATE_LABEL: Record<string, string> = {
  PUBLISHED: 'Published',
  QUEUE: 'Scheduled',
  DRAFT: 'Draft',
  ERROR: 'Failed',
};

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
      // min-w-0 with a basis, not a hard min-width: a 220px floor forced this
      // wider than a 320px phone once padding and the sibling were counted.
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
  onToggle: (postId: string) => void;
}> = ({ scope, selectedPostIds, integrationId, onScope, onToggle }) => {
  const fetchApi = useFetch();

  /**
   * Only fetched once the user actually asks for specific posts.
   *
   * The response is MINIFIED (`{p:[{i,c,d,n:{i,pi}}]}`) to keep the payload
   * small, so it must go through the shared expander — reading `.posts` off the
   * raw body silently yields undefined and an empty picker, which reads exactly
   * like "this account has never posted".
   *
   * limit defaults to 20 server-side; a real account needs more than that to
   * find the post it wants.
   */
  const { data, isLoading } = useSWR(
    scope === 'specific' ? '/posts/list?limit=100&state=all' : null,
    async (url: string) => expandPostsList(await (await fetchApi(url)).json())
  );

  const allPosts: PostRow[] = useMemo(() => data?.posts ?? [], [data]);

  // Scheduled posts are pickable too: the binding resolves to the platform's
  // own id when the post actually goes out.
  const posts = useMemo(
    () => allPosts.filter((p) => !integrationId || p.integration?.id === integrationId),
    [allPosts, integrationId]
  );

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
            <div className="grid gap-[10px] sm:gap-[12px] grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,145px),1fr))]">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[180px]" />
              ))}
            </div>
          )}

          {/* Two different problems, two different answers. "Nothing anywhere"
              and "nothing for THIS account" need different next actions. */}
          {!isLoading && !posts.length && !!allPosts.length && (
            <EmptyState
              icon="🔍"
              title="No posts for this account"
              body={`There are ${allPosts.length} posts in the workspace, but none belong to this channel. Pick a different account, or use “All posts” instead.`}
            />
          )}

          {!isLoading && !allPosts.length && (
            <EmptyState
              icon="📭"
              title="No posts in Mapped Out yet"
              body="This list shows posts created here. Anything published straight from the Instagram app will not appear — use “All posts” to cover those too."
            />
          )}

          {!!posts.length && (
            <>
              <div className="text-[11.5px] text-textItemBlur">
                {selectedPostIds.length
                  ? `${selectedPostIds.length} selected`
                  : 'Tap a post to attach this automation to it'}
              </div>
              <div className="grid gap-[10px] sm:gap-[12px] grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,145px),1fr))] max-h-[420px] overflow-y-auto pr-[4px]">
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
                        <div className="text-[10.5px] text-textItemBlur mt-[5px] flex items-center gap-[5px]">
                          <span>
                            {p.publishDate ? dayjs(p.publishDate).format('D MMM YYYY') : '—'}
                          </span>
                          {p.state && p.state !== 'PUBLISHED' && (
                            <span className="px-[5px] py-[1px] rounded-[4px] bg-white/[0.07] shrink-0">
                              {STATE_LABEL[p.state] ?? p.state}
                            </span>
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
