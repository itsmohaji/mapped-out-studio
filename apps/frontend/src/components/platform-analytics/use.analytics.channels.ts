'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { orderBy, uniqBy } from 'lodash';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';

/**
 * The channels that have analytics — defined ONCE.
 *
 * Overview and By-channel each fetched `/integrations/list` themselves, under
 * different SWR keys, and each re-implemented the same two filters. That is two
 * network requests for identical data on one page, and two copies of a rule
 * that has to agree or the tabs contradict each other.
 *
 * One shared key means SWR dedupes the request across both tabs, and switching
 * tabs is now free instead of a refetch.
 */

/** Only these report analytics. Kept here so the two views cannot disagree. */
export const ANALYTICS_CHANNELS = [
  'facebook',
  'instagram',
  'instagram-standalone',
  'linkedin-page',
  'pinterest',
  'youtube',
  'threads',
  'gmb',
  'x',
  'tiktok',
];

/**
 * An integration row as the API returns it.
 *
 * Deliberately open: this hook only filters and sorts, it does not reshape, and
 * the consumers read fields (refreshNeeded, inBetweenSteps, internalId …) that
 * belong to the API's contract rather than to this hook's. Narrowing it here
 * would force a cast at every call site, which is worse than being honest that
 * this is a passthrough.
 */
export interface AnalyticsChannel {
  id: string;
  name: string;
  identifier: string;
  disabled?: boolean;
  picture?: string;
  type?: string;
  customer?: { id?: string; name?: string };
  [key: string]: any;
}

export const useAnalyticsChannels = () => {
  const fetch = useFetch();
  const { disableXAnalytics } = useVariables();

  const load = useCallback(async (): Promise<AnalyticsChannel[]> => {
    const body = await (await fetch('/integrations/list')).json();
    const list: AnalyticsChannel[] = body?.integrations ?? [];

    return (
      orderBy(
        // Defensive: an integration must appear at most once. A duplicate row
        // renders the same account twice and makes every total look wrong.
        uniqBy(list, (i) => i.id)
          .filter((f) => !(f.identifier === 'x' && disableXAnalytics))
          .filter((f) => ANALYTICS_CHANNELS.includes(f.identifier)),
        ['type', 'disabled', 'identifier'],
        ['desc', 'asc', 'asc']
      )
    );
  }, [disableXAnalytics]);

  // One key for the whole Analytics screen — both tabs share this cache entry.
  return useSWR('analytics-channels', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });
};
