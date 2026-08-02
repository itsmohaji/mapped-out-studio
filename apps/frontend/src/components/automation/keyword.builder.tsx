'use client';

import React, { FC, KeyboardEvent, useState } from 'react';
import clsx from 'clsx';
import { Glass } from './automation.ui';

export type MatchMode = 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex';

export interface KeywordConfig {
  values: string[];
  match: MatchMode;
  ignoreCase: boolean;
  ignoreEmoji: boolean;
  ignoreSpaces: boolean;
}

const MODES: { key: MatchMode; label: string; hint: string }[] = [
  { key: 'equals', label: 'Exact', hint: 'The whole comment is the keyword' },
  { key: 'contains', label: 'Contains', hint: 'The keyword appears as a whole word' },
  { key: 'starts_with', label: 'Starts with', hint: 'The comment begins with it' },
  { key: 'ends_with', label: 'Ends with', hint: 'The comment ends with it' },
];

const SUGGESTIONS = ['YES', 'INTERESTED', 'PRICE', 'INFO', 'DETAILS', 'BUY', 'START', '❤️', '🔥'];

export const KeywordBuilder: FC<{
  value: KeywordConfig;
  onChange: (v: KeywordConfig) => void;
}> = ({ value, onChange }) => {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    // Case-insensitive dedupe: "Yes" and "YES" are the same trigger, and two
    // tags that look different but behave identically confuse everyone.
    const exists = value.values.some((v) => v.toLowerCase() === next.toLowerCase());
    if (!exists) onChange({ ...value, values: [...value.values, next] });
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
      return;
    }
    // Backspace on an empty field removes the last tag — standard tag-input feel.
    if (e.key === 'Backspace' && !draft && value.values.length) {
      onChange({ ...value, values: value.values.slice(0, -1) });
    }
  };

  const unused = SUGGESTIONS.filter(
    (s) => !value.values.some((v) => v.toLowerCase() === s.toLowerCase())
  );

  return (
    <Glass className="p-[20px] flex flex-col gap-[18px]">
      <div>
        <div className="text-[14px] font-[600]">When someone writes…</div>
        <p className="text-[12.5px] text-textItemBlur mt-[4px] leading-[1.5]">
          Add as many words as you like. Leave it empty to run on every comment.
        </p>
      </div>

      <div
        className={clsx(
          'flex flex-wrap items-center gap-[7px] p-[10px] rounded-[12px]',
          'border border-white/[0.09] bg-black/15 focus-within:border-btnPrimary/50 transition-colors'
        )}
      >
        {value.values.map((k) => (
          <span
            key={k}
            className="group flex items-center gap-[6px] text-[12.5px] font-[600] pl-[10px] pr-[6px] py-[5px] rounded-[8px] bg-btnPrimary/15 border border-btnPrimary/25 text-btnPrimary"
          >
            {k}
            <button
              type="button"
              onClick={() => onChange({ ...value, values: value.values.filter((v) => v !== k) })}
              className="w-[15px] h-[15px] rounded-full flex items-center justify-center hover:bg-btnPrimary/25 transition-colors"
              aria-label={`Remove ${k}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => add(draft)}
          placeholder={value.values.length ? 'Add another…' : 'Type a word, press Enter'}
          className="flex-1 min-w-[130px] bg-transparent outline-none text-[13px] py-[5px]"
        />
      </div>

      {!!unused.length && (
        <div className="flex flex-wrap gap-[6px]">
          {unused.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="text-[11.5px] px-[9px] py-[4px] rounded-[7px] border border-white/[0.08] text-textItemBlur hover:border-btnPrimary/40 hover:text-btnPrimary transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-[9px]">
        <div className="text-[12.5px] font-[500]">How should it match?</div>
        <div className="grid gap-[7px] grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,135px),1fr))]">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onChange({ ...value, match: m.key })}
              className={clsx(
                'text-left px-[12px] py-[9px] rounded-[10px] border transition-all duration-150',
                value.match === m.key
                  ? 'border-btnPrimary/45 bg-btnPrimary/10'
                  : 'border-white/[0.08] hover:border-white/[0.18]'
              )}
            >
              <div className="text-[12.5px] font-[600]">{m.label}</div>
              <div className="text-[11px] text-textItemBlur mt-[2px] leading-[1.4]">{m.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-[16px] pt-[14px] border-t border-white/[0.06]">
        {([
          ['ignoreCase', 'Ignore case', 'yes = YES'],
          ['ignoreEmoji', 'Ignore emoji', 'YES 🔥 still matches'],
          ['ignoreSpaces', 'Ignore extra spaces', '"  yes  " still matches'],
        ] as const).map(([key, label, hint]) => (
          <label key={key} className="flex items-start gap-[8px] cursor-pointer group">
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
              className="mt-[2px] accent-[color:var(--btn-primary,#6ba3da)]"
            />
            <span>
              <span className="text-[12.5px] block group-hover:text-textColor transition-colors">
                {label}
              </span>
              <span className="text-[11px] text-textItemBlur">{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </Glass>
  );
};

/**
 * Turn the UI's config into the engine's condition shape.
 *
 * The engine supports equals / contains / regex. Starts-with and ends-with are
 * expressed as anchored regexes rather than new engine modes, so the matching
 * rules stay in one place instead of being reimplemented per surface.
 */
export function toCondition(cfg: KeywordConfig): any[] {
  if (!cfg.values.length) return [];

  if (cfg.match === 'starts_with' || cfg.match === 'ends_with') {
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const values = cfg.values.map((v) =>
      cfg.match === 'starts_with' ? `^\\s*${escape(v)}` : `${escape(v)}\\s*$`
    );
    return [{ kind: 'keyword', match: 'regex', values }];
  }

  return [{ kind: 'keyword', match: cfg.match, values: cfg.values }];
}

/** Read a stored condition back into UI state. */
export function fromCondition(conditions: any[]): KeywordConfig {
  const base: KeywordConfig = {
    values: [],
    match: 'equals',
    ignoreCase: true,
    ignoreEmoji: true,
    ignoreSpaces: true,
  };
  const kw = (conditions || []).find((c) => c?.kind === 'keyword');
  if (!kw) return base;

  if (kw.match === 'regex') {
    const values = (kw.values ?? []).map((v: string) =>
      v.replace(/^\^\\s\*/, '').replace(/\\s\*\$$/, '').replace(/\\(.)/g, '$1')
    );
    const startsWith = (kw.values ?? []).some((v: string) => v.startsWith('^'));
    return { ...base, values, match: startsWith ? 'starts_with' : 'ends_with' };
  }

  return { ...base, values: kw.values ?? [], match: kw.match ?? 'equals' };
}
