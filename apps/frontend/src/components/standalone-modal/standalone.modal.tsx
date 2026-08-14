'use client';

import 'reflect-metadata';
import { FC, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import dayjs from 'dayjs';
import { useParams } from 'next/navigation';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
export const StandaloneModal: FC = () => {
  const fetch = useFetch();
  const params = useParams<{ platform: string }>();

  const loadDate = useCallback(async () => {
    if (params.platform === 'all') {
      return newDayjs().utc().format('YYYY-MM-DDTHH:mm:ss');
    }
    return (await (await fetch('/posts/find-slot')).json()).date;
  }, []);

  // Shared hook — this was a verbatim copy of it. See continue.provider.tsx.
  const { isLoading, data: integrations, mutate } = useIntegrationList();
  const { isLoading: isLoading2, data } = useSWR('/posts/find-slot', loadDate, {
    fallbackData: [],
  });
  if (isLoading || isLoading2) {
    return null;
  }
  return (
    <AddEditModal
      dummy={params.platform === 'all'}
      customClose={() => {
        window.parent.postMessage(
          {
            action: 'closeIframe',
          },
          '*'
        );
      }}
      mutate={() => {}}
      integrations={integrations}
      reopenModal={() => {}}
      allIntegrations={integrations}
      date={dayjs.utc(data).local()}
    />
  );
};
