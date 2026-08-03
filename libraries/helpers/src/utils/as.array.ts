/**
 * Guarantee a list is a list.
 *
 * The app is full of `things?.filter(...)` and `things?.map(...)`. That idiom
 * looks defensive but only guards `null` and `undefined` — the moment the value
 * is PRESENT and the wrong type, `?.` happily proceeds and you get
 * "x?.filter is not a function", which minifies to something unreadable like
 * "_?.filter is not a function" and tells the user nothing.
 *
 * An API can return the wrong shape for entirely ordinary reasons: an error
 * envelope instead of a payload, a partial response, a proxy returning an HTML
 * error page, a field renamed on the server but not the client, or a cache
 * entry written by an optimistic update that passed the wrong thing.
 *
 * So the fix belongs at the BOUNDARY, once, rather than at every call site
 * hoping to remember. A hook that promises an array returns an array — then
 * every consumer downstream is correct by construction and no amount of `?.`
 * is needed.
 */

/**
 * Shared, so an empty result has a stable identity.
 *
 * This matters more than it looks: returning a fresh `[]` each time gives every
 * downstream `useMemo`/`memo` a new dependency on every render, which is how a
 * "safety" wrapper quietly becomes a performance bug.
 */
const EMPTY: readonly unknown[] = Object.freeze([] as unknown[]);

export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return EMPTY as unknown as T[];
}

/**
 * Pull a named list out of an API envelope, whatever it turns out to be.
 *
 * `pluckArray(body, 'integrations')` is the whole
 * `(await res.json()).integrations` pattern, made total.
 */
export function pluckArray<T>(body: unknown, key: string): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object') {
    return asArray<T>((body as Record<string, unknown>)[key]);
  }
  return EMPTY as unknown as T[];
}

/** True when the value was NOT a usable list — for logging a real shape bug. */
export const isUnexpectedShape = (value: unknown): boolean =>
  value != null && !Array.isArray(value);
