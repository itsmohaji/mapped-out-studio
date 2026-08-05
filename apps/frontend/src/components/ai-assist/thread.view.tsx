'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AiAnswer } from '@gitroom/frontend/components/ai-assist/answer';
import {
  MessageRow,
  sendMessage,
  startThread,
  useThread,
} from '@gitroom/frontend/components/ai-assist/threads.api';

/**
 * One conversation.
 *
 * A capability answer is stored as the sections the server already parsed, so
 * this renders <AiAnswer> for those and plain text for the rest — the
 * structured-output contract is the CONTENT of a thread, not a separate view.
 */
export const ThreadView: FC<{
  threadId: string | null;
  prefill: string;
  customerId: string;
  onStarted: (threadId: string) => void;
  onChanged: () => void;
}> = ({ threadId, prefill, customerId, onStarted, onChanged }) => {
  const t = useT();
  const fetch = useFetch();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data, mutate } = useThread(threadId);

  const load = useCallback(
    async (url: string) => (await fetch(url)).json(),
    []
  );
  const { data: credits } = useSWR(
    showCredits ? '/ai-assist/credits' : null,
    load,
    { revalidateOnFocus: false }
  );

  useEffect(() => setDraft(prefill), [prefill]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages, busy]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft('');
    try {
      let id = threadId;
      if (!id) {
        const started = await startThread(fetch, {
          text,
          customerId: customerId || undefined,
        });
        id = started?.thread?.id;
        if (!id) return;
        onStarted(id);
      } else {
        await sendMessage(fetch, id, { role: 'user', text });
      }

      const res = await (
        await fetch('/ai-assist/ask', {
          method: 'POST',
          body: JSON.stringify({
            message: text,
            pathname: '/ai-assistant',
            customerId: customerId || undefined,
          }),
        })
      ).json();

      await sendMessage(fetch, id, {
        role: 'assistant',
        text:
          res?.ok && res?.text
            ? res.text
            : res?.message ||
              t('ai_unavailable', 'The assistant is unavailable right now.'),
      });
    } finally {
      setBusy(false);
      mutate();
      onChanged();
    }
  }, [draft, busy, threadId, customerId, onStarted, onChanged, mutate, t]);

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-[12px]">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[14px]">
        {(data?.messages || []).map((m: MessageRow) => (
          <div
            key={m.id}
            className={clsx(
              'rounded-[13px] px-[13px] py-[11px]',
              m.role === 'user'
                ? 'bg-btnPrimary/15 self-end max-w-[80%]'
                : 'glass-surface'
            )}
          >
            {m.sections ? (
              <AiAnswer sections={m.sections} />
            ) : (
              <div className="text-[13px] leading-[1.62] whitespace-pre-wrap">
                {m.text}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="glass-surface rounded-[13px] p-[14px] flex flex-col gap-[8px]">
            {[88, 72, 80].map((w, i) => (
              <div
                key={i}
                className="h-[10px] rounded-full bg-[var(--glass-2)] animate-pulse"
                style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="glass-surface rounded-[14px] p-[12px] flex flex-col gap-[10px]">
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={t('ask_me_anything', 'Ask me anything…')}
          className="w-full bg-transparent border-0 outline-none resize-none text-[13.5px] leading-[1.55] placeholder:text-textItemBlur"
        />
        <div className="flex items-center gap-[9px]">
          <div className="flex-1" />
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={send}
            className="h-[32px] px-[14px] rounded-[10px] bg-btnPrimary text-white text-[12px] font-[600] disabled:opacity-40 hover:brightness-110 transition"
          >
            {t('send', 'Send')}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowCredits((v) => !v)}
        className="self-start flex items-center gap-[7px] text-[10.5px] text-textItemBlur hover:text-textItemFocused transition-colors"
      >
        <span className="w-[13px] h-[13px] rounded-full border-2 border-btnPrimary border-e-transparent border-b-transparent inline-block" />
        {showCredits && credits
          ? `${credits.creditsRemaining} ${t('credits_left', 'credits left')}`
          : t('credits', 'Credits')}
      </button>
    </div>
  );
};
