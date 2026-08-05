'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { usePathname } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { pageContextFor } from '@gitroom/helpers/utils/ai.assist';

/**
 * The AI Assistant, as a spotlight.
 *
 * Cmd/Ctrl+K anywhere, or the floating button. It opens small and centred over
 * the page rather than as a panel down the side, because the thing being asked
 * about is almost always the page underneath — covering half of it to ask about
 * it was the old design's mistake.
 *
 * Three things fill it and nothing else: what you type, what is worth asking
 * from HERE, and what you asked last. The pathname decides the second, so the
 * user never types "I am on the analytics screen".
 *
 * Deliberately not shown: the credit balance. It is a billing fact, it changes
 * nothing about the question being asked, and putting a decrementing number in
 * front of someone at the moment they ask for help teaches them to ask less.
 * It lives on the AI Assistant page, next to the work that spends it.
 */
export const SparkIcon: FC<{ size?: number; className?: string }> = ({
  size = 20,
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path
      d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3ZM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const RECENT_KEY = 'mappedout.ai.recent';
const RECENT_MAX = 5;

/** Never throws: a corrupt or unavailable store must not stop the panel opening. */
function loadRecent(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    return (Array.isArray(raw) ? raw : [])
      .filter((v): v is string => typeof v === 'string' && !!v.trim())
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Private mode, or a full store. Recents are a convenience, not the feature.
  }
}

type Row = { kind: 'suggestion' | 'recent'; text: string };

export const AssistantDock: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<{ question: string; text: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [customerId, setCustomerId] = useState('');
  // -1 means "ask exactly what I typed". Arrow keys move into the list; that
  // way Enter straight after typing never runs some highlighted row instead.
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const page = pageContextFor(pathname);

  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  // Only once opened — a global shortcut must not cost a request on every page
  // load for something most visits never use.
  const { data: clients } = useSWR(open ? '/ai-orchestra/clients' : null, load, {
    revalidateOnFocus: false,
  });

  // Read after mount, never in a state initialiser: there is no localStorage on
  // the server and reading one during render is a hydration mismatch.
  //
  // Writing is done at the point of asking rather than in an effect on `recent`.
  // An effect would run in the same commit as this one, before the loaded list
  // had been applied, and persist the empty initial array over what was stored.
  useEffect(() => setRecent(loadRecent()), []);

  // Cmd/Ctrl+K toggles from anywhere; Esc closes. Bound once, for the lifetime
  // of the layout, because the point of a spotlight is that it is always there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Opening is always a fresh question. The last answer staying on screen from
  // three pages ago would be answering something nobody is still asking.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setAnswer(null);
    setCursor(-1);
    inputRef.current?.focus();
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    return [
      ...page.suggestions.filter(match).map((text): Row => ({ kind: 'suggestion', text })),
      ...recent
        .filter((r) => match(r) && !page.suggestions.includes(r))
        .map((text): Row => ({ kind: 'recent', text })),
    ];
  }, [page.suggestions, recent, query]);

  // A filter that shortens the list must not leave the highlight past its end.
  useEffect(() => setCursor(-1), [query]);

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      setQuery(question);
      setBusy(true);
      setAnswer(null);
      setCursor(-1);

      // Recorded on ask, not on success: a question worth retrying is exactly
      // the one whose answer failed.
      const nextRecent = [
        question,
        ...recent.filter((r) => r !== question),
      ].slice(0, RECENT_MAX);
      setRecent(nextRecent);
      saveRecent(nextRecent);

      try {
        const res = await (
          await fetch('/ai-assist/ask', {
            method: 'POST',
            body: JSON.stringify({
              message: question,
              // The page the question was asked from — the whole point.
              pathname,
              customerId: customerId || undefined,
            }),
          })
        ).json();

        setAnswer({
          question,
          text:
            res?.ok && res?.text
              ? res.text
              : res?.message ||
                t('ai_unavailable', 'The assistant is unavailable right now.'),
        });
      } catch {
        setAnswer({
          question,
          text: t('ai_unavailable', 'The assistant is unavailable right now.'),
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, pathname, customerId, recent, t]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (rows.length ? Math.min(c + 1, rows.length - 1) : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      ask(cursor >= 0 && rows[cursor] ? rows[cursor].text : query);
    }
  };

  return (
    <>
      {/* Sits above the page but below a modal's own overlay, so it never
          covers a dialog someone is part-way through. */}
      <button
        type="button"
        aria-label={t('ask_ai', 'Ask AI')}
        data-tooltip-id="tooltip"
        data-tooltip-content={t('ask_ai_shortcut', 'Ask AI  ·  ⌘K')}
        onClick={() => setOpen(true)}
        className={clsx(
          'fixed bottom-[22px] end-[22px] z-[350] w-[52px] h-[52px] rounded-full',
          'glass-surface flex items-center justify-center',
          'text-btnPrimary hover:text-textItemFocused',
          'hover:brightness-110 active:scale-95 transition-all'
        )}
      >
        <SparkIcon size={22} />
      </button>

      {open && (
        // The backdrop also does the centring. Flex rather than a translate off
        // a logical inset, so RTL needs no special case at all.
        <div
          // items-start matters: the default `stretch` would pull the panel
          // down to the full height of the backdrop, leaving a tall empty box
          // hanging below the footer.
          className="fixed inset-0 z-[340] bg-black/45 flex items-start justify-center pt-[12vh] px-[14px]"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('ask_ai', 'Ask AI')}
            onClick={(e) => e.stopPropagation()}
            className={clsx(
              'w-full max-w-[560px] max-h-[76vh]',
              'glass-surface rounded-[18px] overflow-hidden flex flex-col'
            )}
          >
            {/* The search field is the whole header. No title bar: the icon and
                the placeholder already say what this is. */}
            <div className="flex items-center gap-[10px] px-[15px] h-[52px] shrink-0">
              <SparkIcon size={18} className="text-btnPrimary shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  // Typing a new question puts the suggestions back. Leaving the
                  // previous answer up while a different one is being typed
                  // reads as the assistant having answered the new question.
                  if (answer && e.target.value !== answer.question) setAnswer(null);
                }}
                onKeyDown={onKeyDown}
                placeholder={t('ask_about_page', 'Ask about {page}…').replace(
                  '{page}',
                  page.label
                )}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[14.5px] placeholder:text-textItemBlur"
              />
              {/* Says the assistant already knows where you are, without the
                  user having to trust that it does. */}
              <span className="shrink-0 text-[10.5px] font-[600] px-[8px] py-[3px] rounded-full bg-[var(--glass-2)] text-textItemBlur">
                {page.label}
              </span>
            </div>

            <div className="border-t border-[var(--gline)]" />

            <div className="max-h-[min(52vh,420px)] overflow-y-auto">
              {busy && (
                <div className="px-[15px] py-[16px] flex flex-col gap-[9px]">
                  {[88, 70, 80].map((w, i) => (
                    <div
                      key={i}
                      className="h-[10px] rounded-full bg-[var(--glass-2)] animate-pulse"
                      style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }}
                    />
                  ))}
                </div>
              )}

              {!busy && answer && (
                <div className="px-[15px] py-[14px] flex flex-col gap-[8px]">
                  <div className="text-[11px] font-[600] uppercase tracking-[0.08em] text-textItemBlur">
                    {answer.question}
                  </div>
                  <div className="text-[13px] leading-[1.62] whitespace-pre-wrap">
                    {answer.text}
                  </div>
                </div>
              )}

              {!busy && !answer && (
                <div className="py-[6px]">
                  {!rows.length && (
                    <div className="px-[15px] py-[14px] text-[12.5px] text-textItemBlur">
                      {t('ai_press_enter', 'Press Enter to ask.')}
                    </div>
                  )}
                  {rows.map((row, i) => {
                    // A heading only where the kind changes, so the two lists
                    // read as one column rather than two stacked panels.
                    const heading =
                      i === 0 || rows[i - 1].kind !== row.kind ? row.kind : null;
                    return (
                      <React.Fragment key={`${row.kind}-${row.text}`}>
                        {heading && (
                          <div className="text-[10px] font-[700] uppercase tracking-[0.08em] text-textItemBlur px-[15px] pt-[9px] pb-[4px]">
                            {heading === 'suggestion'
                              ? t('ai_try_asking', 'Try asking')
                              : t('recent', 'Recent')}
                          </div>
                        )}
                        <button
                          type="button"
                          onMouseEnter={() => setCursor(i)}
                          onClick={() => ask(row.text)}
                          className={clsx(
                            'w-full text-start flex items-center gap-[10px] px-[15px] py-[9px]',
                            'text-[13px] transition-colors',
                            cursor === i ? 'bg-[var(--glass-2)]' : 'bg-transparent'
                          )}
                        >
                          {row.kind === 'suggestion' ? (
                            <SparkIcon
                              size={13}
                              className="text-btnPrimary shrink-0"
                            />
                          ) : (
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-textItemBlur shrink-0"
                            >
                              <path d="M12 8v4l3 2" />
                              <circle cx="12" cy="12" r="9" />
                            </svg>
                          )}
                          <span className="flex-1 min-w-0 truncate">{row.text}</span>
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--gline)]" />

            <div className="flex items-center gap-[10px] px-[15px] h-[42px] shrink-0">
              {(clients || []).length > 0 ? (
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  aria-label={t('client', 'Client')}
                  className="bg-transparent text-[11.5px] text-textItemBlur outline-none max-w-[190px] cursor-pointer hover:text-textItemFocused transition-colors"
                >
                  <option value="">{t('all_clients', 'All clients')}</option>
                  {(clients || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[11.5px] text-textItemBlur">
                  {t('ai_draft_only', 'Drafts only — nothing is published.')}
                </span>
              )}
              <div className="flex-1" />
              <span className="text-[11px] text-textItemBlur tabular-nums">
                {answer
                  ? t('ai_ask_another', 'Type to ask another')
                  : t('ai_enter_to_ask', 'Enter to ask  ·  Esc to close')}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
