import { resolve, sep } from 'path';

/**
 * The file an /uploads request may read — or null.
 *
 * The route joined URL segments onto UPLOAD_DIRECTORY with no check, so `..`
 * segments could walk out of it. Not reachable from the internet today (nginx
 * sends /uploads to disk and /api to the backend), but it must not depend on
 * that. Resolved paths must stay strictly inside the upload directory.
 */
export function resolveUploadPath(root: string | undefined, segments: string[] = []): string | null {
  if (!root || !segments.length) return null;
  if (segments.some((s) => !s || s === '.' || s === '..' || s.includes('\0') || /[\\/]/.test(s))) return null;
  const base = resolve(root);
  const full = resolve(base, ...segments);
  return full.startsWith(base + sep) ? full : null;
}
