'use client';

import { FC } from 'react';
import dayjs from 'dayjs';
import '@gitroom/frontend/components/layout/dayjs.setup';

export const RenderPreviewDate: FC<{ date: string }> = ({ date }) => {
  console.log(date);
  return <>{dayjs.utc(date).local().format('MMMM D, YYYY h:mm A')}</>;
};
