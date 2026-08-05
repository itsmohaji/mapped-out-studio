/**
 * Pure helpers for AI Assistant threads.
 *
 * Kept free of Nest and Prisma so both the browser and the API can import them,
 * and so titling and card rules are testable without a database.
 */

export const DEFAULT_FOLDERS = [
  'Campaigns',
  'Content ideas',
  'Recommendations',
];

const MAX_TITLE = 60;

/**
 * A thread's title, derived from its first message.
 *
 * Derived rather than asked for: nobody names a chat before they have had it,
 * and an untitled list is unsearchable. Renaming stays available.
 */
export function threadTitleFrom(text: string): string {
  const firstLine = (text || '').split('\n')[0].replace(/\s+/g, ' ').trim();
  if (!firstLine) return 'New chat';
  if (firstLine.length <= MAX_TITLE) return firstLine;

  const cut = firstLine.slice(0, MAX_TITLE - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

export interface StarterCard {
  key: string;
  /** Type label shown bottom-left on the card. */
  label: string;
  /** Verb shown bottom-right. */
  action: string;
  capabilityKey: string;
  folder: string;
  /**
   * 'assisted' prefills an editable composer message and lets the operator pick
   * channels. 'automatic' opens the answer directly — the finding already names
   * the post and the channel, so asking would pretend it does not know.
   */
  mode: 'assisted' | 'automatic';
  /** Empty for automatic cards. */
  prefill: string;
}

export const STARTER_CARDS: StarterCard[] = [
  {
    key: 'recommendation',
    label: 'Recommendation',
    action: 'Open',
    capabilityKey: 'performance_recos',
    folder: 'Recommendations',
    mode: 'automatic',
    prefill: '',
  },
  {
    key: 'campaign',
    label: 'Campaign',
    action: 'Start',
    capabilityKey: 'campaign_strategy',
    folder: 'Campaigns',
    // Square brackets are the registry's own convention for "you were not told
    // this, do not invent it" — reused here so the gap is obvious to the reader
    // before it is ever sent.
    prefill: 'Build a campaign for the next 4 weeks promoting [what?]',
    mode: 'assisted',
  },
  {
    key: 'ideas',
    label: 'Content ideas',
    action: 'Ask',
    capabilityKey: 'content_ideas',
    folder: 'Content ideas',
    prefill:
      'What should we post next week, based on what performed last month?',
    mode: 'assisted',
  },
];
