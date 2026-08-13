'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';
import { isUnexpectedShape } from '@gitroom/helpers/utils/as.array';
import { normalizeIntegrationList } from '@gitroom/helpers/utils/integration.contract';

/**
 * The connected channels. ALWAYS an array, and every item is ALWAYS usable.
 *
 * This used to be `(await res.json()).integrations`, which is an array right up
 * until the response is not the shape we expected — an error envelope, a proxy
 * error page, a field that moved. Callers then did `integrations?.filter(...)`,
 * which reads as defensive but only guards null: a present-but-wrong value
 * sails past `?.` and throws "…filter is not a function", minified into
 * something unreadable.
 *
 * Guaranteeing only the OUTER array was not enough, and that is the bug that
 * kept the Calendar crashing after it was supposedly fixed: the envelope was
 * fine while one item's `time` was `{}` — from a raw JSON string column parsed
 * without checking its type — and `p.time.flatMap()` threw. `normalizeIntegrationList`
 * repairs each item too, so no consumer needs to check anything.
 *
 * The API now normalises on the way out as well. This half is not redundant: it
 * also covers responses SWR cached before the deploy, and any other client.
 */
export const useIntegrationList = () => {
  const fetch = useFetch();

  const load = useCallback(async (path: string) => {
    const body = await (await fetch(path)).json();
    if (isUnexpectedShape(body?.integrations)) {
      // Absent is ordinary. Present-but-wrong is a real bug on one side or the
      // other, and silently rendering an empty channel list would hide it.
      console.error('[integrations] unexpected shape from /integrations/list', body);
    }

    const { integrations, dropped } = normalizeIntegrationList(body);
    if (dropped) {
      // Never expected. An entry with no id cannot be selected or posted to, so
      // it is excluded rather than rendered as a channel that does nothing.
      console.error(`[integrations] dropped ${dropped} unusable entrie(s)`);
    }
    return integrations;
  }, []);

  return useSWR('/integrations/list', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });
};
