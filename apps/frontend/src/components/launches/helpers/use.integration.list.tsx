'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';
import { isUnexpectedShape, pluckArray } from '@gitroom/helpers/utils/as.array';

/**
 * The connected channels. ALWAYS an array.
 *
 * This used to be `(await res.json()).integrations`, which is an array right up
 * until the response is not the shape we expected — an error envelope, a proxy
 * error page, a field that moved. Callers then did `integrations?.filter(...)`,
 * which reads as defensive but only guards null: a present-but-wrong value
 * sails past `?.` and throws "…filter is not a function", minified into
 * something unreadable.
 *
 * Guaranteeing the type here makes every consumer correct without needing to
 * defend itself.
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
    return pluckArray<any>(body, 'integrations');
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
