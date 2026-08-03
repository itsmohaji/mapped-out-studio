'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { usePathname } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { pageContextFor } from '@gitroom/helpers/utils/ai.assist';

/**
 * The AI Assistant, everywhere.
 *
 * A floating action on every page that opens a drawer in place — the current
 * page is never left, because the question is almost always ABOUT the page. The
 * pathname is read here and sent with every message, so the user never has to
 * explain where they are.
 *
 * The icon is the same sparkle the sidebar's AI Assistant entry uses. That is
 * deliberate and worth keeping: two different marks for one feature reads as two
 * features.
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

interface Turn {
  role: 'you' | 'ai';
  text: string;
}

export const AssistantDock: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const page = pageContextFor(pathname);

  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  // Only fetched once the drawer is opened — a floating button must not cost
  // two requests on every page load for something most visits never use.
  const { data: clients } = useSWR(open ? '/ai-orchestra/clients' : null, load, {
    revalidateOnFocus: false,
  });
  const { data: credits, mutate: refreshCredits } = useSWR(
    open ? '/ai-assist/credits' : null,
    load,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, busy]);

  // Esc closes. Bound only while open, so the app's own shortcuts are untouched
  // the rest of the time.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;
      setMessage('');
      setTurns((s) => [...s, { role: 'you', text: question }]);
      setBusy(true);
      try {
        const res = await (
          await fetch('/ai-assist/ask', {
            method: 'POST',
            body: JSON.stringify({
              message: question,
              // The page the question was asked from. This is the whole point:
              // the user never types "I am on the analytics screen".
              pathname,
              customerId: customerId || undefined,
            }),
          })
        ).json();

        setTurns((s) => [
          ...s,
          {
            role: 'ai',
            text:
              res?.ok && res?.text
                ? res.text
                : res?.message ||
                  t('ai_unavailable', 'The assistant is unavailable right now.'),
          },
        ]);
        refreshCredits();
      } catch {
        setTurns((s) => [
          ...s,
          {
            role: 'ai',
            text: t('ai_unavailable', 'The assistant is unavailable right now.'),
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, pathname, customerId, refreshCredits, t]
  );

  return (
    <>
      {/* The floating action. Sits above everything but below a modal's own
          overlay, so it never covers a dialog the user is mid-way through. */}
      <button
        type="button"
        aria-label={t('ask_ai', 'Ask AI')}
        data-tooltip-id="tooltip"
        data-tooltip-content={t('ask_ai', 'Ask AI')}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'fixed bottom-[22px] end-[22px] z-[350] w-[52px] h-[52px] rounded-full',
          'glass-surface flex items-center justify-center',
          'text-btnPrimary hover:text-textItemFocused',
          'hover:brightness-110 active:scale-95 transition-all',
          open && 'text-textItemFocused'
        )}
      >
        <SparkIcon size={22} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[340] bg-black/30"
            onClick={() => setOpen(false)}
          />
          <aside
            className={clsx(
              'fixed z-[345] flex flex-col gap-[10px] glass-surface',
              'bottom-0 end-0 top-0 w-full sm:w-[420px] sm:top-[12px] sm:bottom-[86px]',
              'sm:end-[22px] sm:rounded-[20px] p-[16px]'
            )}
          >
            <div className="flex items-center gap-[9px] shrink-0">
              <SparkIcon size={18} className="text-btnPrimary" />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-[600] leading-tight">
                  {t('ask_ai', 'Ask AI')}
                </div>
                {/* Shows the assistant already knows where you are, so nobody
                    has to guess whether context was picked up. */}
                <div className="text-[11px] text-textItemBlur truncate">
                  {page.label}
                  {credits
                    ? ` · ${credits.creditsRemaining} ${t('credits_left', 'credits left')}`
                    : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('close', 'Close')}
                className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-textItemFocused"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {(clients || []).length > 0 && (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="shrink-0 bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[10px] py-[7px] text-[12px] outline-none focus:border-btnPrimary"
              >
                <option value="">{t('all_clients', 'All clients')}</option>
                {(clients || []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[10px] pe-[2px]">
              {!turns.length && (
                <div className="flex flex-col gap-[7px]">
                  <div className="text-[11.5px] text-textItemBlur">
                    {t('ai_try_asking', 'Try asking')}
                  </div>
                  {page.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="text-start text-[12.5px] rounded-[11px] px-[11px] py-[9px] bg-newBgLineColor hover:brightness-110 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {turns.map((turn, i) => (
                <div
                  key={i}
                  className={clsx(
                    'text-[12.5px] leading-[1.55] rounded-[12px] px-[11px] py-[9px] whitespace-pre-wrap',
                    turn.role === 'you'
                      ? 'bg-btnPrimary/15 self-end max-w-[85%]'
                      : 'bg-newBgLineColor'
                  )}
                >
                  {turn.text}
                </div>
              ))}

              {busy && (
                <div className="text-[12px] text-textItemBlur px-[11px]">
                  {t('thinking', 'Thinking…')}
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="shrink-0 flex items-end gap-[8px]">
              <textarea
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks the line — the convention
                  // everywhere else a message is typed.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(message);
                  }
                }}
                placeholder={page.suggestions[0]}
                className="flex-1 bg-newBgLineColor border border-newTableBorder rounded-[12px] px-[11px] py-[9px] text-[12.5px] outline-none focus:border-btnPrimary resize-none"
              />
              <button
                type="button"
                disabled={busy || !message.trim()}
                onClick={() => send(message)}
                className="h-[40px] px-[14px] rounded-[12px] bg-btnPrimary text-white text-[12px] font-[600] disabled:opacity-40 hover:brightness-110 transition"
              >
                {t('send', 'Send')}
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
};
