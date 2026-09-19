/**
 * The page lock: while anything holds it, the body does not scroll and every
 * `.blurMe` container is blurred and ignores clicks (see `global.scss`).
 *
 * Why this exists (P0, 2026-09-19): the modal manager and CheckPayment each
 * toggled `overflow-hidden` / `pointer-events-none` classes by hand in an effect
 * with no cleanup. When the component went away while locked — a crash, a layout
 * swap, a navigation — nothing ever removed them, and the whole app sat blurred
 * and unclickable with no way out but a reload. Two independent lockers could
 * also unlock each other.
 *
 * Now the lock is a single body attribute that CSS reads, so it applies to
 * whatever `.blurMe` elements exist at the time, and it is reference-counted, so
 * it is released only when the last holder lets go. Use it from an effect and
 * return the release function — then unmounting releases it by construction:
 *
 *   useEffect(() => (open ? lockUi() : undefined), [open]);
 */
const ATTR = 'data-ui-locked';
let holders = 0;

export function lockUi(): () => void {
  holders += 1;
  document.body.setAttribute(ATTR, '');
  let released = false;
  return () => {
    // Releasing twice must never steal another holder's lock.
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) document.body.removeAttribute(ATTR);
  };
}

/** Last resort for the global error page: whatever crashed can't release it. */
export function resetUiLock() {
  holders = 0;
  document.body.removeAttribute(ATTR);
}
