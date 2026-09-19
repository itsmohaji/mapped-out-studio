'use client';

import { FC, ReactNode, useEffect } from 'react';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { initializeSentryClient } from '@gitroom/react/sentry/initialize.sentry.client';
import { startLongTaskMonitor } from '@gitroom/frontend/components/layout/long.task.monitor';

export const SentryComponent: FC<{ children: ReactNode }> = ({ children }) => {
  const { sentryDsn: dsn, environment } = useVariables();

  useEffect(() => {
    if (!dsn) {
      return;
    }

    initializeSentryClient(environment, dsn);
  }, [dsn]);

  // Runs with or without a DSN: the console and `window.__moLongTasks` are
  // evidence too. Sentry calls inside are no-ops until Sentry is initialised.
  useEffect(() => startLongTaskMonitor(), []);

  // Always render children - don't block the app
  return <>{children}</>;
};
