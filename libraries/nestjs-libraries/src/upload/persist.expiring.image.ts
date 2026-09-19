/**
 * Keep a copy of an image whose URL will stop working.
 *
 * Instagram/Facebook CDN URLs are signed and expire, so a thumbnail stored as a
 * link breaks after a while (seen on /leads as 403s, 2026-09-19). Where we
 * STORE such a URL, store our own copy instead.
 *
 * Only those CDN hosts are fetched (the uploader is already SSRF-guarded and
 * sniffs the real file type; this narrows it further). Best effort by design:
 * on any failure or after `timeoutMs`, the original URL is kept, so this can
 * never block or break the flow that stores it. A timed-out fetch may still
 * finish in the background; the worst case is an unreferenced file.
 */
const EXPIRING_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

export async function persistExpiringImage(
  url: string | null | undefined,
  upload: (url: string) => Promise<string>,
  timeoutMs = 5000
): Promise<string | null> {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return url;
  }
  if (!EXPIRING_HOSTS.test(host)) return url;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      upload(url),
      new Promise<string>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}
