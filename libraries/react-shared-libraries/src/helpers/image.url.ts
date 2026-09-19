/**
 * A right-sized, cached thumbnail URL for an image, via Next's image optimiser.
 *
 * Previews rendered full originals: a 919 KB 750×1000 JPEG for a 34 px list
 * thumbnail (649× the pixels), a 1216×2160 Instagram image for a 38 px avatar
 * (performance baseline, 2026-09-19). Only our own uploads and the Instagram /
 * Facebook CDNs are routed (next.config `images.remotePatterns` must allow
 * them); anything else is returned unchanged. Deterministic — no `window` — so
 * server and client render the same URL. Callers fall back to the original URL
 * if the optimiser ever fails (SafeImage does this).
 */
// Next's default imageSizes + deviceSizes: `w` must be one of these.
const SIZES = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];
const DPR = 2; // assume a high-density screen; one bucket up is cheap
const REMOTE = /^https:\/\/([^/]+\.)?(cdninstagram\.com|fbcdn\.net)\//i;

export function thumbnailUrl(src: string | null | undefined, cssWidth: number): string {
  if (!src) return src ?? '';
  if (!cssWidth || /^(data|blob):/i.test(src) || /\.(svg|gif)(\?|#|$)/i.test(src)) return src;
  if (/\.(mp4|mov|webm|m4v|mpeg)(\?|#|$)/i.test(src)) return src;
  // Absolute URLs only: a relative /uploads path would make the optimiser fetch
  // through the Next.js uploads route instead of the public nginx path.
  const ours = /^https?:\/\/[^/]+\/uploads\//i.test(src);
  if (!ours && !REMOTE.test(src)) return src;
  const need = Math.ceil(cssWidth * DPR);
  const w = SIZES.find((s) => s >= need) ?? SIZES[SIZES.length - 1];
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;
}
