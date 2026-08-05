'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  CAPTION_ACTIONS,
  CAPTION_GROUPS,
  CaptionAction,
} from '@gitroom/helpers/utils/ai.assist';
import { SparkIcon } from '@gitroom/frontend/components/ai-assist/assistant.dock';
import { SelectedIntegrations } from '@gitroom/frontend/components/new-launch/store';

/**
 * The AI caption tools, inside the composer.
 *
 * Everything a writer would otherwise leave the page for: write one, improve
 * it, cut it, change its register, add a call to action, add hashtags,
 * translate it. Each is the SAME endpoint with a different intent, so adding
 * one is an entry in the shared action list and nothing else.
 *
 * What it sends is the whole point of the feature: the attached media, the
 * client, the platform and the caption already written. The server decides
 * whether anything can actually look at the media and says so afterwards — a
 * caption written blind is still useful, but the writer should know which one
 * they got.
 */

interface Props {
  /** Current caption HTML from the editor. */
  value: string;
  /** Replaces the caption. */
  onChange: (value: string) => void;
  /** Attachments on THIS post — `{ id, path, thumbnail? }`. */
  pictures?: any[];
  /** Platform identifier, e.g. `instagram`. Drives length limits and tone. */
  identifier?: string;
  selectedIntegration?: SelectedIntegrations[];
  disabled?: boolean;
}

const HTML = /<[^>]*>/;

/** Plain text for the length check; the editor stores HTML for rich modes. */
const textOf = (v: string) =>
  (HTML.test(v || '') ? (v || '').replace(/<[^>]*>/g, ' ') : v || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const CaptionTools: FC<Props> = ({
  value,
  onChange,
  pictures,
  identifier,
  selectedIntegration,
  disabled,
}) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<CaptionAction | null>(null);
  const [language, setLanguage] = useState('');
  const wrap = useRef<HTMLDivElement>(null);

  const hasText = !!textOf(value);

  // Whichever client owns the selected channels. Derived rather than stored:
  // the composer already knows, and a second copy would go stale the moment
  // someone switches channel.
  const customerId = useMemo(
    () =>
      (selectedIntegration || [])
        .map((s) => s?.integration?.customer?.id)
        .find(Boolean) || '',
    [selectedIntegration]
  );

  const media = useMemo(
    () =>
      (pictures || [])
        .map((p) => ({ path: p?.path, thumbnail: p?.thumbnail }))
        .filter((p) => p.path || p.thumbnail),
    [pictures]
  );

  // Close on an outside click. Without this the menu survives clicking straight
  // back into the text, which reads as the composer being stuck.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const run = useCallback(
    async (action: CaptionAction) => {
      if (busy) return;

      const meta = CAPTION_ACTIONS.find((a) => a.key === action)!;
      if (meta.needsExisting && !hasText) {
        toast.show(
          t('ai_needs_caption', 'Write a caption first, then this can work on it.'),
          'warning'
        );
        return;
      }
      if (action === 'translate' && !language.trim()) {
        toast.show(
          t('ai_needs_language', 'Type the language to translate into.'),
          'warning'
        );
        return;
      }

      setBusy(action);
      try {
        const res = await (
          await fetch('/ai-assist/caption', {
            method: 'POST',
            body: JSON.stringify({
              action,
              existing: value || '',
              platform: identifier || '',
              language: action === 'translate' ? language.trim() : '',
              customerId: customerId || undefined,
              media,
            }),
          })
        ).json();

        if (!res?.ok || !res?.text) {
          toast.show(
            res?.message || t('ai_unavailable', 'The assistant is unavailable right now.'),
            'warning'
          );
          return;
        }

        // The editor owns the value; this replaces it wholesale, which is what
        // every one of these actions means. Undo still works — the editor's own
        // history extension records the change.
        onChange(res.text);
        setOpen(false);

        if (media.length && res.sawMedia === false) {
          // Not an error. The caption is real; it just was not written from the
          // picture, and silently pretending otherwise is how the feature ends
          // up feeling broken.
          toast.show(
            t(
              'ai_no_vision',
              'Written from the details only — no connected AI provider can read images yet.'
            ),
            'warning'
          );
        }
      } catch {
        toast.show(
          t('ai_unavailable', 'The assistant is unavailable right now.'),
          'warning'
        );
      } finally {
        setBusy(null);
      }
    },
    [busy, hasText, language, value, identifier, customerId, media, onChange, t]
  );

  // Grouped from the shared list, so a new action appears here by adding one
  // registry entry. A group with nothing in it is not rendered at all.
  const groups = CAPTION_GROUPS.map((g) => ({
    ...g,
    actions: CAPTION_ACTIONS.filter((a) => a.group === g.key),
  })).filter((g) => g.actions.length);

  return (
    <div className="flex gap-[5px]" ref={wrap}>
      <button
        type="button"
        disabled={disabled || !!busy}
        data-tooltip-id="tooltip"
        data-tooltip-content={t(
          'ai_suggest_caption_tip',
          'Write a caption from the attached media'
        )}
        onClick={() => run('suggest')}
        className={clsx(
          'select-none cursor-pointer rounded-[8px] h-[32px] px-[10px]',
          'bg-newColColor hover:brightness-110 transition-all active:scale-95',
          'flex justify-center items-center gap-[6px] text-[11.5px] font-[600]',
          'disabled:opacity-50 disabled:cursor-default'
        )}
      >
        <SparkIcon size={14} className="text-btnPrimary" />
        <span className="hidden sm:inline">
          {busy === 'suggest'
            ? t('writing', 'Writing…')
            : t('suggest_caption', 'Suggest Caption')}
        </span>
      </button>

      <div className="relative">
        <button
          type="button"
          disabled={disabled || !!busy}
          data-tooltip-id="tooltip"
          data-tooltip-content={t('ai_caption_tools', 'AI caption tools')}
          onClick={() => setOpen((v) => !v)}
          className="select-none cursor-pointer rounded-[8px] w-[32px] h-[32px] bg-newColColor hover:brightness-110 transition-all active:scale-95 flex justify-center items-center disabled:opacity-50"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-[500] bottom-[38px] end-0 w-[236px] glass-surface rounded-[13px] p-[5px] flex flex-col max-h-[min(60vh,420px)] overflow-y-auto">
            {groups.map((group) => (
              <div key={group.key} className="flex flex-col">
                <div className="text-[10px] font-[700] uppercase tracking-[0.08em] text-textItemBlur px-[9px] pt-[7px] pb-[3px]">
                  {t(`ai_group_${group.key}`, group.label)}
                </div>
                {group.actions.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    disabled={!!busy || (a.needsExisting && !hasText)}
                    onClick={() => run(a.key)}
                    className={clsx(
                      'flex items-center gap-[8px] text-start text-[12.5px] rounded-[9px] px-[9px] py-[7px]',
                      'hover:bg-[var(--glass-2)] transition-colors',
                      'disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent'
                    )}
                  >
                    <SparkIcon size={13} className="text-btnPrimary shrink-0" />
                    <span className="flex-1">
                      {busy === a.key
                        ? t('working', 'Working…')
                        : t(`ai_${a.key}`, a.label)}
                    </span>
                  </button>
                ))}
              </div>
            ))}

            {/* Translate needs one more thing than the rest, so it asks for it
                here rather than opening a dialog over the composer. */}
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  run('translate');
                }
              }}
              placeholder={t('translate_into', 'Translate into… (e.g. Arabic)')}
              className="mt-[3px] bg-newBgLineColor border border-newTableBorder rounded-[9px] px-[9px] py-[7px] text-[12px] outline-none focus:border-btnPrimary"
            />

            {!hasText && (
              <div className="text-[11px] text-textItemBlur px-[9px] py-[7px]">
                {t(
                  'ai_write_first',
                  'These work on a caption you have already written.'
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
