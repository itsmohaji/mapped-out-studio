'use client';

import dayjs from 'dayjs';
import '@gitroom/frontend/components/layout/dayjs.setup';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FC, useEffect } from 'react';
export const IntegrationRedirectComponent: FC = () => {
  const offset = dayjs.tz().utcOffset();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const newUrl = `${pathname}/continue?${searchParams.toString()}&timezone=${offset}`;
  useEffect(() => {
    router.push(newUrl);
  }, [newUrl]);
  return null;
};
