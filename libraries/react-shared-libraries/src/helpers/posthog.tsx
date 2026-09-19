'use client';

import { FC, ReactNode, useEffect } from 'react';

/**
 * PostHog, loaded only when it is configured.
 *
 * The SDK used to be imported statically, which put ~180 KB into every page
 * while production has no PostHog key (performance baseline, 2026-09-19). It is
 * now fetched on demand, and `getPosthog()` returns null until it has loaded —
 * callers already treat analytics as best-effort.
 */
type PostHog = typeof import('posthog-js').default;
let client: PostHog | null = null;

export const getPosthog = () => client;

export const PHProvider: FC<{
  children: ReactNode;
  phkey?: string;
  host?: string;
}> = ({ children, phkey, host }) => {
  useEffect(() => {
    if (!phkey || !host) {
      return;
    }
    import('posthog-js').then(({ default: posthog }) => {
      posthog.init(phkey, {
        api_host: host,
        person_profiles: 'identified_only',
        capture_pageview: false, // Disable automatic pageview capture, as we capture manually
      });
      client = posthog;
    });
  }, []);
  return <>{children}</>;
};
