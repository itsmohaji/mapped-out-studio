'use client';

import useSWR, { SWRConfiguration } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { expandPostsList } from '@gitroom/helpers/utils/posts.list.minify';

/**
 * A page of posts in one state. The ONE fetcher for these cache keys.
 *
 * The Dashboard and its Audience panel each fetched the published list — under
 * two different keys, so SWR could not share it and the request went out twice
 * on every Dashboard load. One key, one fetcher (see the /integrations/list
 * lesson in use.integration.list.ts).
 */
export const postsListKey = (state: 'scheduled' | 'published' | 'draft', limit: number) =>
  `/posts/list?state=${state}&page=0&limit=${limit}`;

type PostsList = ReturnType<typeof expandPostsList>;

export const usePostsList = (
  state: 'scheduled' | 'published' | 'draft',
  limit: number,
  options?: SWRConfiguration<PostsList>
) => {
  const fetch = useFetch();
  return useSWR<PostsList>(
    postsListKey(state, limit),
    async (url: string) => expandPostsList(await (await fetch(url)).json()),
    options
  );
};
