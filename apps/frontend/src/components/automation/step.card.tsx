'use client';

import React, { FC, useState } from 'react';
import clsx from 'clsx';
import { Glass } from './automation.ui';

export interface StepDraft {
  id?: string;
  key: string;
  kind: string;
  config: Record<string, any>;
}

export const STEP_META: Record<
  string,
  { label: string; hint: string; icon: string; accent: string; group: string }
> = {
  send_dm: {
    label: 'Send a message',
    hint: 'Goes out as a private reply when it follows a comment',
    icon: '💬',
    accent: '#6ba3da',
    group: 'Message',
  },
  reply_comment: {
    label: 'Reply to the comment',
    hint: 'Posts a public reply on the thread',
    icon: '↩️',
    accent: '#6ba3da',
    group: 'Message',
  },
  wait_reply: {
    label: 'Wait for their reply',
    hint: 'Nothing else sends until they answer',
    icon: '⏳',
    accent: '#daa646',
    group: 'Flow',
  },
  collect_field: {
    label: 'Collect an answer',
    hint: 'Saves their next message into a field',
    icon: '📥',
    accent: '#47b985',
    group: 'Flow',
  },
  branch: {
    label: 'Condition',
    hint: 'Split the flow into two paths',
    icon: '🔀',
    accent: '#b57edc',
    group: 'Flow',
  },
  wait: { label: 'Wait', hint: 'Pause for a set time', icon: '⏸️', accent: '#daa646', group: 'Flow' },
  add_tag: {
    label: 'Add a tag',
    hint: 'Label the contact for later',
    icon: '🏷️',
    accent: '#47b985',
    group: 'Contact',
  },
  create_lead: {
    label: 'Create a lead',
    hint: 'Saves the contact and sends it to the CRM',
    icon: '🎯',
    accent: '#47b985',
    group: 'Contact',
  },
  notify_team: {
    label: 'Notify the team',
    hint: 'Sends an in-app notification',
    icon: '🔔',
    accent: '#e2685f',
    group: 'Team',
  },
  assign_manager: {
    label: 'Assign an account manager',
    hint: 'Routes it to the right person',
    icon: '👤',
    accent: '#e2685f',
    group: 'Team',
  },
  create_task: {
    label: 'Create a task',
    hint: 'Not enabled yet — this step is skipped',
    icon: '✅',
    accent: '#8b93a5',
    group: 'Team',
  },
  call_webhook: {
    label: 'Call a webhook',
    hint: 'Sends the details to another system',
    icon: '🔗',
    accent: '#8b93a5',
    group: 'Advanced',
  },
};

const VARIABLES = ['first_name', 'handle', 'comment_text', 'email'];
const QUICK_EMOJI = ['👋', '🙏', '🎉', '🔥', '❤️', '✨', '👇', '✅'];

/** Insert at the caret so a variable lands where the writer is looking. */
function insertAt(el: HTMLTextAreaElement | null, current: string, token: string): string {
  if (!el) return `${current}${token}`;
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  return current.slice(0, start) + token + current.slice(end);
}

const MessageEditor: FC<{
  value: string;
  onChange: (v: string) => void;
  index: number;
}> = ({ value, onChange, index }) => {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);

  return (
    <div className="flex flex-col gap-[9px]">
      <div className="text-[11px] text-textItemBlur uppercase tracking-[0.05em] font-[600]">
        Message {index}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Hi {{first_name}} 👋 Thanks for reaching out!"
        className="w-full bg-black/20 border border-white/[0.09] rounded-[10px] p-[11px] text-[13px] leading-[1.5] resize-y min-h-[78px] focus:border-btnPrimary/50 outline-none transition-colors"
      />

      <div className="flex flex-wrap items-center gap-[6px]">
        {VARIABLES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(insertAt(ref.current, value, `{{${v}}}`))}
            className="text-[11px] px-[8px] py-[4px] rounded-[6px] bg-white/[0.05] border border-white/[0.08] text-textItemBlur hover:text-btnPrimary hover:border-btnPrimary/40 transition-colors font-mono"
          >
            {`{{${v}}}`}
          </button>
        ))}

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            className="text-[11px] px-[8px] py-[4px] rounded-[6px] bg-white/[0.05] border border-white/[0.08] hover:border-white/[0.2] transition-colors"
          >
            😊 Emoji
          </button>
          {showEmoji && (
            <div className="absolute z-20 mt-[6px] p-[8px] rounded-[10px] bg-customColor2 border border-white/[0.12] shadow-xl flex gap-[4px] flex-wrap w-[186px]">
              {QUICK_EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    onChange(insertAt(ref.current, value, e));
                    setShowEmoji(false);
                  }}
                  className="text-[17px] w-[30px] h-[30px] rounded-[7px] hover:bg-white/10 transition-colors"
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

export const StepCard: FC<{
  step: StepDraft;
  index: number;
  messageIndex: number;
  isLast: boolean;
  onChange: (s: StepDraft) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}> = ({ step, index, messageIndex, isLast, onChange, onRemove, onMove }) => {
  const meta = STEP_META[step.kind] ?? {
    label: step.kind,
    hint: '',
    icon: '•',
    accent: '#8b93a5',
    group: '',
  };
  const set = (patch: Record<string, any>) =>
    onChange({ ...step, config: { ...step.config, ...patch } });

  return (
    <div className="flex flex-col items-stretch">
      <Glass className="p-[16px] flex flex-col gap-[13px] group/step relative">
        <div
          className="absolute left-0 top-[16px] bottom-[16px] w-[2px] rounded-full opacity-70"
          style={{ background: meta.accent }}
        />

        <div className="flex items-start gap-[11px] pl-[10px]">
          <div
            className="w-[32px] h-[32px] rounded-[10px] flex items-center justify-center text-[15px] shrink-0"
            style={{ background: `${meta.accent}20` }}
          >
            {meta.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-[600] leading-tight">{meta.label}</div>
            <div className="text-[11.5px] text-textItemBlur mt-[2px] leading-[1.4]">{meta.hint}</div>
          </div>

          <div className="flex items-center gap-[2px] opacity-0 group-hover/step:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              className="w-[26px] h-[26px] rounded-[7px] hover:bg-white/[0.08] disabled:opacity-25 transition-colors text-[12px]"
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={isLast}
              className="w-[26px] h-[26px] rounded-[7px] hover:bg-white/[0.08] disabled:opacity-25 transition-colors text-[12px]"
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="w-[26px] h-[26px] rounded-[7px] hover:bg-[#e2685f]/15 hover:text-[#e2685f] transition-colors text-[13px]"
              aria-label="Remove step"
            >
              ×
            </button>
          </div>
        </div>

        <div className="pl-[10px]">
          {(step.kind === 'send_dm' || step.kind === 'reply_comment') && (
            <MessageEditor
              index={messageIndex}
              value={step.config.message ?? ''}
              onChange={(v) => set({ message: v })}
            />
          )}

          {step.kind === 'collect_field' && (
            <div className="flex flex-col gap-[7px]">
              <label className="text-[11.5px] text-textItemBlur">Save their answer as</label>
              <div className="flex flex-wrap gap-[6px]">
                {['first_name', 'email', 'phone', 'company'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => set({ field: f })}
                    className={clsx(
                      'text-[11.5px] px-[10px] py-[5px] rounded-[7px] border transition-colors',
                      step.config.field === f
                        ? 'border-btnPrimary/50 bg-btnPrimary/10 text-btnPrimary'
                        : 'border-white/[0.08] text-textItemBlur hover:border-white/[0.2]'
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <input
                value={step.config.field ?? ''}
                onChange={(e) => set({ field: e.target.value })}
                placeholder="or type your own field name"
                className="bg-black/20 border border-white/[0.09] rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-btnPrimary/50 transition-colors"
              />
            </div>
          )}

          {step.kind === 'wait_reply' && (
            <label className="flex items-center gap-[9px] text-[12.5px] text-textItemBlur">
              Give up after
              <input
                type="number"
                min={1}
                value={step.config.timeoutDays ?? 7}
                onChange={(e) => set({ timeoutDays: Number(e.target.value) })}
                className="w-[62px] bg-black/20 border border-white/[0.09] rounded-[8px] px-[9px] py-[6px] text-[12.5px] outline-none focus:border-btnPrimary/50"
              />
              days
            </label>
          )}

          {step.kind === 'wait' && (
            <label className="flex items-center gap-[9px] text-[12.5px] text-textItemBlur">
              Pause for
              <input
                type="number"
                min={1}
                value={step.config.minutes ?? 5}
                onChange={(e) => set({ minutes: Number(e.target.value) })}
                className="w-[62px] bg-black/20 border border-white/[0.09] rounded-[8px] px-[9px] py-[6px] text-[12.5px] outline-none focus:border-btnPrimary/50"
              />
              minutes
            </label>
          )}

          {step.kind === 'branch' && (
            <div className="flex flex-col gap-[9px]">
              <label className="text-[11.5px] text-textItemBlur">
                If their reply contains any of these
              </label>
              <input
                value={(step.config.conditions?.[0]?.values ?? []).join(', ')}
                onChange={(e) =>
                  set({
                    conditions: [
                      {
                        kind: 'keyword',
                        match: 'contains',
                        values: e.target.value
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean),
                      },
                    ],
                  })
                }
                placeholder="PRICE, COST, HOW MUCH"
                className="bg-black/20 border border-white/[0.09] rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-btnPrimary/50 transition-colors"
              />
              <div className="flex gap-[8px] text-[11px] text-textItemBlur">
                <span className="px-[8px] py-[3px] rounded-[6px] bg-[#47b985]/12 text-[#47b985]">
                  Match → next step
                </span>
                <span className="px-[8px] py-[3px] rounded-[6px] bg-white/[0.05]">
                  No match → skips ahead
                </span>
              </div>
            </div>
          )}

          {step.kind === 'add_tag' && (
            <input
              value={(step.config.tags ?? []).join(', ')}
              onChange={(e) =>
                set({
                  tags: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="vip, newsletter"
              className="w-full bg-black/20 border border-white/[0.09] rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-btnPrimary/50 transition-colors"
            />
          )}

          {(step.kind === 'notify_team' || step.kind === 'assign_manager') && (
            <input
              value={step.config.message ?? ''}
              onChange={(e) => set({ message: e.target.value })}
              placeholder="New lead from {{handle}}"
              className="w-full bg-black/20 border border-white/[0.09] rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-btnPrimary/50 transition-colors"
            />
          )}

          {step.kind === 'call_webhook' && (
            <input
              value={step.config.url ?? ''}
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://example.com/hook"
              className="w-full bg-black/20 border border-white/[0.09] rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-btnPrimary/50 transition-colors"
            />
          )}
        </div>
      </Glass>

      {!isLast && (
        <div className="flex justify-center py-[7px]">
          <span className="text-[13px] text-textItemBlur/50 leading-none">↓</span>
        </div>
      )}
    </div>
  );
};
