/**
 * SWR policy for settings-like data the composer reads on every open (tags,
 * short-link preference, third-party providers, DBU options).
 *
 * Each open used to refetch all of it — 7–8 requests, each a ~165 ms round trip
 * to the server (performance baseline, 2026-09-19). Now a value is reused for
 * five minutes and refreshed in the background after that; an explicit edit
 * still calls `mutate()`, which bypasses this window. Safe across tenants: org
 * switching and impersonation both reload the page, which clears the cache.
 */
export const SETTINGS_SWR = {
  dedupingInterval: 5 * 60_000,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
} as const;
