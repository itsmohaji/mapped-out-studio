/**
 * The channels Mapped Out supports as a product (owner decision, 2026-09-20).
 *
 * This is an ALLOW-LIST, not a deletion: every provider class stays registered
 * in `socialIntegrationList`, so channels that are already connected keep
 * posting, refreshing and reporting whatever their provider is. What this list
 * controls is what can be CONNECTED and what the UI offers:
 *  - `getAllowedSocialsIntegrations()` filters to it, which is checked by all
 *    four connect entry points (auth URL, social-connect callback, public API,
 *    enterprise invite) — so an unsupported provider cannot be connected even
 *    by hand-crafting a URL;
 *  - the Add Channel picker renders from it.
 *
 * Removing provider CODE is a separate decision: `medium`, `gmb`, `telegram`,
 * `skool`, `listmonk` and others are still referenced by per-provider settings
 * DTOs, previews, analytics channel lists, automation templates, the browser
 * extension and (for listmonk) the newsletter subsystem. Audit those before
 * deleting anything.
 */
export const SUPPORTED_SOCIAL_PROVIDERS = [
  'x',
  'linkedin',
  'linkedin-page',
  'instagram-standalone',
  'instagram',
  'facebook',
  'threads',
  'youtube',
  'tiktok',
  'pinterest',
  'wordpress',
] as const;

export type SupportedSocialProvider = (typeof SUPPORTED_SOCIAL_PROVIDERS)[number];

export const isSupportedProvider = (identifier: string) =>
  (SUPPORTED_SOCIAL_PROVIDERS as readonly string[]).includes(identifier);
