/**
 * `Post.image` is a JSON STRING column, but some read paths hand it back
 * already parsed. Returns a URL safe to put in an <img>, or null.
 */
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|avi)(\?|$)/i;

export function firstMediaPath(post: { image?: unknown } | null): string | null {
  try {
    const raw = post?.image;
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!first || typeof first !== 'object') return null;
    if (typeof first.thumbnail === 'string' && first.thumbnail) {
      return first.thumbnail;
    }
    // A video src in an <img> renders as a broken image — show the avatar instead.
    if (typeof first.path === 'string' && !VIDEO_EXT.test(first.path)) {
      return first.path;
    }
    return null;
  } catch {
    return null;
  }
}
