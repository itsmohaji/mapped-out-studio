'use client';

import React, { FC, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ALWAYS_CAPTURED,
  BUTTON_TEMPLATES,
  LEAD_FIELDS,
  QUESTION_TEMPLATES,
  blockMeta,
} from '@gitroom/nestjs-libraries/automation/automation.blocks';
import { Block } from '@gitroom/nestjs-libraries/automation/automation.blockgraph';

/**
 * Settings for the selected block.
 *
 * Only one block's settings exist at a time, which is what keeps the canvas
 * short and the screen calm. Everything here is a starting point the user can
 * edit — templates fill fields, they do not lock them.
 */

const VARIABLES = ['first_name', 'handle', 'email', 'comment_text'];
const EMOJI = ['👋', '🙏', '🎉', '🔥', '❤️', '✨', '👇', '✅'];

const Label: FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <div className="flex flex-col gap-[2px]">
    <span className="text-[11px] uppercase tracking-[0.05em] text-textItemBlur font-[600]">
      {children}
    </span>
    {!!hint && <span className="text-[11px] text-textItemBlur/80">{hint}</span>}
  </div>
);

const Input: FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full bg-black/20 border border-white/[0.09] rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-btnPrimary/50 transition-colors"
  />
);

/** Message editor with variable and emoji insertion at the caret. */
const MessageBox: FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({
  value,
  onChange,
  placeholder,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [emoji, setEmoji] = useState(false);

  const insert = (token: string) => {
    const el = ref.current;
    if (!el) return onChange(`${value}${token}`);
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    onChange(value.slice(0, s) + token + value.slice(e));
  };

  return (
    <div className="flex flex-col gap-[7px]">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder={placeholder}
        className="w-full bg-black/20 border border-white/[0.09] rounded-[10px] p-[11px] text-[12.5px] leading-[1.5] outline-none focus:border-btnPrimary/50 transition-colors resize-y"
      />
      <div className="flex flex-wrap items-center gap-[5px]">
        {VARIABLES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insert(`{{${v}}}`)}
            className="text-[10.5px] font-mono px-[7px] py-[3px] rounded-[6px] bg-white/[0.05] border border-white/[0.08] text-textItemBlur hover:text-btnPrimary hover:border-btnPrimary/40 transition-colors"
          >
            {`{{${v}}}`}
          </button>
        ))}
        <div className="relative">
          <button
            type="button"
            onClick={() => setEmoji((s) => !s)}
            className="text-[10.5px] px-[7px] py-[3px] rounded-[6px] bg-white/[0.05] border border-white/[0.08] hover:border-white/[0.2]"
          >
            😊
          </button>
          {emoji && (
            <div className="absolute z-30 mt-[6px] p-[7px] rounded-[10px] bg-newBgColorInner border border-white/[0.12] shadow-xl flex flex-wrap gap-[3px] w-[172px]">
              {EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    insert(e);
                    setEmoji(false);
                  }}
                  className="text-[16px] w-[28px] h-[28px] rounded-[6px] hover:bg-white/10"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Button list editor, with ready-made sets. */
const ButtonEditor: FC<{ buttons: string[]; onChange: (b: string[]) => void }> = ({
  buttons,
  onChange,
}) => (
  <div className="flex flex-col gap-[9px]">
    <Label hint="They reply with the number. Native tappable buttons arrive when Instagram messaging is approved.">
      Buttons
    </Label>

    <div className="flex flex-wrap gap-[5px]">
      {BUTTON_TEMPLATES.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.buttons)}
          className="text-[11px] px-[9px] py-[4px] rounded-[7px] border border-white/[0.09] text-textItemBlur hover:border-btnPrimary/40 hover:text-btnPrimary transition-colors"
        >
          {t.label}
        </button>
      ))}
    </div>

    <div className="flex flex-col gap-[6px]">
      {buttons.map((b, i) => (
        <div key={i} className="flex items-center gap-[6px]">
          <span className="text-[11px] text-textItemBlur w-[14px] shrink-0">{i + 1}.</span>
          <input
            value={b}
            onChange={(e) => onChange(buttons.map((x, n) => (n === i ? e.target.value : x)))}
            className="flex-1 min-w-0 bg-black/20 border border-white/[0.09] rounded-[8px] px-[10px] py-[6px] text-[12px] outline-none focus:border-btnPrimary/50"
          />
          <button
            type="button"
            onClick={() => onChange(buttons.filter((_, n) => n !== i))}
            className="w-[24px] h-[24px] rounded-[7px] hover:bg-[#e2685f]/15 hover:text-[#e2685f] text-[12px] shrink-0"
            aria-label="Remove button"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...buttons, ''])}
        className="self-start text-[11.5px] text-textItemBlur hover:text-btnPrimary transition-colors"
      >
        + Add a button
      </button>
    </div>
  </div>
);

export const BlockInspector: FC<{
  block: Block | null;
  onChange: (config: Record<string, any>) => void;
}> = ({ block, onChange }) => {
  if (!block) {
    return (
      <div className="p-[18px] text-[12.5px] text-textItemBlur leading-[1.55]">
        Select a step on the left to edit it.
      </div>
    );
  }

  const meta = blockMeta(block.kind);
  const c = block.config ?? {};
  const set = (patch: Record<string, any>) => onChange({ ...c, ...patch });

  return (
    <div className="p-[16px] flex flex-col gap-[15px]">
      <div className="flex items-center gap-[10px]">
        <span
          className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[14px] shrink-0"
          style={{ background: `${meta?.accent ?? '#8b93a5'}22` }}
        >
          {meta?.icon}
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-[600]">{meta?.label}</div>
          <div className="text-[11px] text-textItemBlur">{meta?.summary}</div>
        </div>
      </div>

      {block.kind === 'send_message' && (
        <div className="flex flex-col gap-[7px]">
          <Label>Message</Label>
          <MessageBox
            value={c.message ?? ''}
            onChange={(v) => set({ message: v })}
            placeholder="Hi {{first_name}} 👋 thanks for reaching out!"
          />
        </div>
      )}

      {block.kind === 'ask_question' && (
        <>
          <div className="flex flex-col gap-[8px]">
            <Label hint="Pick one to fill everything in, then edit freely.">Ready-made</Label>
            <div className="flex flex-wrap gap-[5px]">
              {QUESTION_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() =>
                    set({ question: t.question, saveAs: t.saveAs, buttons: t.buttons ?? [] })
                  }
                  className="text-[11px] px-[9px] py-[4px] rounded-[7px] border border-white/[0.09] text-textItemBlur hover:border-btnPrimary/40 hover:text-btnPrimary transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label>Question</Label>
            <MessageBox
              value={c.question ?? ''}
              onChange={(v) => set({ question: v })}
              placeholder="What is your name?"
            />
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label hint="The name this answer is stored under, and how the lead shows it.">
              Save answer as
            </Label>
            <Input
              value={c.saveAs ?? ''}
              onChange={(v) => set({ saveAs: v })}
              placeholder="first_name"
            />
          </div>

          <ButtonEditor buttons={c.buttons ?? []} onChange={(b) => set({ buttons: b })} />
        </>
      )}

      {block.kind === 'show_buttons' && (
        <>
          <div className="flex flex-col gap-[7px]">
            <Label>Message</Label>
            <MessageBox
              value={c.message ?? ''}
              onChange={(v) => set({ message: v })}
              placeholder="What would you like to do?"
            />
          </div>
          <ButtonEditor buttons={c.buttons ?? []} onChange={(b) => set({ buttons: b })} />
        </>
      )}

      {block.kind === 'wait' && (
        <div className="flex flex-col gap-[7px]">
          <Label hint="Leave at 0 to simply wait for them to reply.">Wait for</Label>
          <div className="flex items-center gap-[8px]">
            <input
              type="number"
              min={0}
              value={c.minutes ?? 0}
              onChange={(e) => set({ minutes: Number(e.target.value) })}
              className="w-[80px] bg-black/20 border border-white/[0.09] rounded-[9px] px-[10px] py-[8px] text-[12.5px] outline-none focus:border-btnPrimary/50"
            />
            <span className="text-[12.5px] text-textItemBlur">minutes</span>
          </div>
        </div>
      )}

      {block.kind === 'condition' && (
        <div className="flex flex-col gap-[7px]">
          <Label hint="If their reply contains any of these, the flow continues. Otherwise it stops here.">
            If they say
          </Label>
          <Input
            value={(c.conditions?.[0]?.values ?? []).join(', ')}
            onChange={(v) =>
              set({
                conditions: [
                  {
                    kind: 'keyword',
                    match: 'contains',
                    values: v
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  },
                ],
              })
            }
            placeholder="yes, interested, price"
          />
        </div>
      )}

      {block.kind === 'collect_information' && (
        <div className="flex flex-col gap-[7px]">
          <Label hint="Their next message is stored under this name.">Save as</Label>
          <Input value={c.saveAs ?? ''} onChange={(v) => set({ saveAs: v })} placeholder="email" />
        </div>
      )}

      {block.kind === 'create_lead' && (
        <>
          <div className="flex flex-col gap-[8px]">
            <Label hint="Tick what this lead should store. Anything collected is kept regardless.">
              Save these fields
            </Label>
            <div className="grid grid-cols-2 gap-[5px]">
              {LEAD_FIELDS.map((f) => {
                const on = (c.fields ?? []).includes(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() =>
                      set({
                        fields: on
                          ? (c.fields ?? []).filter((x: string) => x !== f.key)
                          : [...(c.fields ?? []), f.key],
                      })
                    }
                    className={clsx(
                      'text-[11.5px] px-[9px] py-[6px] rounded-[8px] border text-left transition-colors',
                      on
                        ? 'border-[#47b985]/50 bg-[#47b985]/10 text-[#47b985]'
                        : 'border-white/[0.08] text-textItemBlur hover:border-white/[0.2]'
                    )}
                  >
                    {on ? '✓ ' : ''}
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Attribution is not a choice, so it must not look like one. */}
          <div className="rounded-[11px] border border-white/[0.07] bg-white/[0.03] p-[12px]">
            <div className="text-[11px] uppercase tracking-[0.05em] text-textItemBlur font-[600]">
              Always saved
            </div>
            <div className="flex flex-wrap gap-[4px] mt-[7px]">
              {ALWAYS_CAPTURED.map((a) => (
                <span
                  key={a}
                  className="text-[10.5px] px-[7px] py-[2px] rounded-[5px] bg-white/[0.05] text-textItemBlur"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {block.kind === 'add_tag' && (
        <div className="flex flex-col gap-[7px]">
          <Label>Tags</Label>
          <Input
            value={(c.tags ?? []).join(', ')}
            onChange={(v) =>
              set({
                tags: v
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
            placeholder="vip, newsletter"
          />
        </div>
      )}

      {block.kind === 'notify_team' && (
        <div className="flex flex-col gap-[7px]">
          <Label>What should your team see?</Label>
          <MessageBox
            value={c.message ?? ''}
            onChange={(v) => set({ message: v })}
            placeholder="New lead from {{handle}}"
          />
        </div>
      )}

      {block.kind === 'ai_action' && (
        <>
          <div className="text-[11.5px] rounded-[10px] px-[11px] py-[9px] border border-[#daa646]/35 bg-[#daa646]/10 text-[#daa646] leading-[1.5]">
            No AI provider is enabled yet, so this step is skipped when the flow runs. It will start
            working once one is configured.
          </div>
          <div className="flex flex-col gap-[7px]">
            <Label>What should the AI do?</Label>
            <MessageBox
              value={c.instruction ?? ''}
              onChange={(v) => set({ instruction: v })}
              placeholder="Answer their question using a friendly, brief tone."
            />
          </div>
        </>
      )}
    </div>
  );
};
