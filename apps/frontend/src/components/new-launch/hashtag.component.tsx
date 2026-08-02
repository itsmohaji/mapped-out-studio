'use client';

import React, { FC, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * Hashtag composer button.
 *
 * Sits in the editor toolbar beside emoji. Hashtags are collected as chips and
 * inserted into the caption in one go, because that is how people actually
 * write them — a block at the end, not one at a time mid-sentence.
 *
 * Insertion goes through the editor's own command chain rather than mutating
 * the value, so undo/redo and the character counter keep working.
 */
export const HashtagComponent: FC<{ editor: any; currentValue: string }> = ({ editor }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on an outside click. Without this the panel sits over the caption and
  // swallows the next click the writer makes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const clean = (raw: string) =>
    raw
      .trim()
      .replace(/^#+/, '')
      // Hashtags cannot contain spaces or punctuation; join words instead of
      // silently producing a tag that breaks on the platform.
      .replace(/[^\p{L}\p{N}_]+/gu, '');

  const add = (raw: string) => {
    const tag = clean(raw);
    if (!tag) return;
    if (!tags.some((x) => x.toLowerCase() === tag.toLowerCase())) setTags((s) => [...s, tag]);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
      e.preventDefault();
      add(draft);
      return;
    }
    if (e.key === 'Backspace' && !draft && tags.length) setTags((s) => s.slice(0, -1));
  };

  const insert = () => {
    const pending = clean(draft);
    const all = pending && !tags.includes(pending) ? [...tags, pending] : tags;
    if (!all.length) return;

    editor?.commands?.insertContent(` ${all.map((x) => `#${x}`).join(' ')}`);
    editor?.commands?.focus();
    setTags([]);
    setDraft('');
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <div
        data-tooltip-id="tooltip"
        data-tooltip-content={t('add_hashtags', 'Add hashtags')}
        onClick={() => setOpen((s) => !s)}
        className="select-none cursor-pointer rounded-[8px] w-[32px] h-[32px] bg-newColColor hover:brightness-110 transition-all active:scale-95 flex justify-center items-center"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M2.66602 5.99967H13.3327M2.66602 9.99967H13.3327M6.66602 2.66634L5.33268 13.333M10.666 2.66634L9.33268 13.333"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {open && (
        <div className="absolute z-[200] bottom-[40px] left-0 w-[280px] p-[12px] rounded-[12px] bg-newBgColorInner border border-customColor6 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)] flex flex-col gap-[10px]">
          <div className="text-[12px] font-[600]">{t('hashtags', 'Hashtags')}</div>

          <div className="flex flex-wrap items-center gap-[5px] p-[7px] rounded-[9px] border border-customColor6 bg-black/10 focus-within:border-forth transition-colors">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-[5px] text-[11.5px] font-[600] pl-[8px] pr-[4px] py-[3px] rounded-[6px] bg-forth/15 text-forth"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => setTags((s) => s.filter((x) => x !== tag))}
                  className="w-[14px] h-[14px] rounded-full hover:bg-forth/25 transition-colors leading-none"
                  aria-label={`Remove ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder={tags.length ? t('add_another', 'Add another…') : 'summercollection'}
              className="flex-1 min-w-[100px] bg-transparent outline-none text-[12.5px] py-[3px]"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-textItemBlur">
              {t('hashtag_hint', 'Enter or space to add')}
            </span>
            <button
              type="button"
              onClick={insert}
              disabled={!tags.length && !clean(draft)}
              className="text-[12px] font-[500] px-[12px] py-[6px] rounded-[8px] bg-forth text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
            >
              {t('insert', 'Insert')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
