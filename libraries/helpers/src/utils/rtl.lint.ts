/**
 * RTL guard.
 *
 * Arabic is a first-class language here, so a physical-direction utility is a
 * bug: `ml-2` stays on the left in RTL where `ms-2` follows the reading
 * direction. This finds them in a className string so a test can fail the
 * build instead of someone spotting it in a screenshot.
 *
 * Intentional exceptions are NOT flagged:
 *  - `rtl:` prefixed classes (an explicit RTL override)
 *  - `left-0/right-0` on a full-cover box (`w-full`), where both are identical
 *  - `left-[50%]`/`left-1/2` paired with `-translate-x-`, i.e. centring —
 *    translate-x does not flip, so switching to `start-` breaks the centring
 */

export interface RtlFinding {
  className: string;
  reason: string;
}

const PHYSICAL = [
  { re: /(^|\s)-?m[lr]-[^\s]+/, reason: 'use ms-/me- instead of ml-/mr-' },
  { re: /(^|\s)p[lr]-[^\s]+/, reason: 'use ps-/pe- instead of pl-/pr-' },
  { re: /(^|\s)text-(left|right)(\s|$)/, reason: 'use text-start/text-end' },
  {
    re: /(^|\s)rounded-(tl|tr|bl|br)-[^\s]+/,
    reason: 'use rounded-ss-/se-/es-/ee- (logical corners)',
  },
  { re: /(^|\s)border-[lr](\s|$)/, reason: 'use border-s/border-e' },
  { re: /(^|\s)(left|right)-[^\s]+/, reason: 'use start-/end-' },
];

const isCentred = (cls: string) =>
  /(left|right)-(\[50%\]|1\/2)/.test(cls) && /translate-x-/.test(cls);

const isFullCover = (cls: string) =>
  /(^|\s)w-full(\s|$)/.test(cls) && /(^|\s)(left|right)-0(\s|$)/.test(cls);

export function findRtlIssues(className: string): RtlFinding[] {
  if (!className) return [];
  // An explicit rtl: override means the author already thought about it.
  const cleaned = className
    .split(/\s+/)
    .filter((c) => !c.startsWith('rtl:') && !c.includes(':rtl:'))
    .join(' ');

  const out: RtlFinding[] = [];
  for (const { re, reason } of PHYSICAL) {
    const m = cleaned.match(re);
    if (!m) continue;
    const hit = m[0].trim();
    if (/^(left|right)-/.test(hit) && (isCentred(cleaned) || isFullCover(cleaned))) {
      continue;
    }
    out.push({ className: hit, reason });
  }
  return out;
}

export const hasRtlIssues = (className: string) =>
  findRtlIssues(className).length > 0;
