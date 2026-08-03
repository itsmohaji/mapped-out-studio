'use client';

import React, { FC, useState } from 'react';
import clsx from 'clsx';
import {
  BLOCKS,
  BlockKind,
  blockMeta,
} from '@gitroom/nestjs-libraries/automation/automation.blocks';
import { Block } from '@gitroom/nestjs-libraries/automation/automation.blockgraph';

/**
 * The workflow canvas.
 *
 * Vertical, compact, and connected — the flow reads top to bottom like the
 * conversation it produces. A card shows a one-line summary of what it will
 * actually do; settings live in the inspector, so nothing here expands and
 * pushes the rest of the flow off screen.
 */

/** One line describing what this card will really do, from its own settings. */
function summarise(block: Block): string {
  const c = block.config ?? {};
  switch (block.kind) {
    case 'send_message':
      return c.message?.trim() || 'No message yet';
    case 'ask_question':
      return c.question?.trim()
        ? `“${c.question.trim()}” → ${c.saveAs || 'answer'}`
        : 'No question yet';
    case 'show_buttons':
      return (c.buttons ?? []).length ? (c.buttons ?? []).join(' · ') : 'No buttons yet';
    case 'wait':
      return c.minutes ? `${c.minutes} minutes` : 'Waits for their reply';
    case 'condition':
      return (c.conditions?.[0]?.values ?? []).length
        ? `If they say: ${(c.conditions[0].values ?? []).join(', ')}`
        : 'No condition set';
    case 'collect_information':
      return `Saves as ${c.saveAs || 'answer'}`;
    case 'create_lead':
      return (c.fields ?? []).length
        ? `Saves ${(c.fields ?? []).length} fields`
        : 'Saves everything collected';
    case 'add_tag':
      return (c.tags ?? []).length ? (c.tags ?? []).join(', ') : 'No tags yet';
    case 'notify_team':
      return c.message?.trim() || 'Tells your team';
    case 'ai_action':
      return c.instruction?.trim() || 'Needs an AI provider';
    default:
      return '';
  }
}

const Connector: FC = () => (
  <div className="flex justify-center py-[2px]" aria-hidden>
    <span className="w-[2px] h-[16px] rounded-full bg-white/[0.13]" />
  </div>
);

const AddButton: FC<{ onPick: (kind: BlockKind) => void; label?: string }> = ({
  onPick,
  label,
}) => {
  const [open, setOpen] = useState(false);
  const groups = ['Conversation', 'Logic', 'Outcome'] as const;

  return (
    <div className="relative flex flex-col items-center">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={clsx(
          'rounded-full border border-dashed transition-all duration-150 flex items-center justify-center',
          label
            ? 'w-full py-[11px] text-[12.5px] font-[500] rounded-[12px]'
            : 'w-[24px] h-[24px] text-[14px] leading-none',
          open
            ? 'border-btnPrimary/60 text-btnPrimary bg-btnPrimary/[0.07]'
            : 'border-white/[0.16] text-textItemBlur hover:border-btnPrimary/50 hover:text-btnPrimary'
        )}
        aria-label="Add a step"
      >
        {label ?? '+'}
      </button>

      {open && (
        <div className="absolute top-full mt-[8px] z-30 w-[268px] p-[12px] rounded-[14px] bg-newBgColorInner border border-white/[0.12] shadow-[0_18px_44px_-14px_rgba(0,0,0,0.7)] flex flex-col gap-[12px]">
          {groups.map((group) => (
            <div key={group}>
              <div className="text-[10px] uppercase tracking-[0.06em] text-textItemBlur font-[600] mb-[6px]">
                {group}
              </div>
              <div className="flex flex-col gap-[3px]">
                {BLOCKS.filter((b) => b.group === group).map((b) => (
                  <button
                    key={b.kind}
                    type="button"
                    onClick={() => {
                      onPick(b.kind);
                      setOpen(false);
                    }}
                    className="flex items-center gap-[9px] text-left px-[9px] py-[7px] rounded-[9px] hover:bg-white/[0.06] transition-colors"
                  >
                    <span
                      className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-[12px] shrink-0"
                      style={{ background: `${b.accent}22` }}
                    >
                      {b.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-[500]">{b.label}</span>
                      <span className="block text-[10.5px] text-textItemBlur truncate">
                        {b.summary}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const BlockCanvas: FC<{
  blocks: Block[];
  selectedId: string | null;
  triggerLabel: string;
  onSelect: (id: string | null) => void;
  onAdd: (kind: BlockKind, atIndex: number) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onSelectTrigger: () => void;
  triggerSelected: boolean;
}> = ({
  blocks,
  selectedId,
  triggerLabel,
  onSelect,
  onAdd,
  onRemove,
  onMove,
  onSelectTrigger,
  triggerSelected,
}) => (
  <div className="flex flex-col">
    {/* The trigger is a card like any other, so the flow has one visual grammar. */}
    <button
      type="button"
      onClick={onSelectTrigger}
      className={clsx(
        'text-left rounded-[14px] border p-[14px] transition-all duration-150',
        triggerSelected
          ? 'border-btnPrimary/60 bg-btnPrimary/[0.08]'
          : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.2]'
      )}
    >
      <div className="flex items-center gap-[11px]">
        <span className="w-[30px] h-[30px] rounded-[9px] bg-[#47b985]/18 flex items-center justify-center text-[14px] shrink-0">
          ⚡
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.06em] text-textItemBlur font-[600]">
            When this happens
          </span>
          <span className="block text-[13px] font-[600] truncate mt-[1px]">{triggerLabel}</span>
        </span>
      </div>
    </button>

    {blocks.map((block, i) => {
      const meta = blockMeta(block.kind);
      const selected = selectedId === block.id;

      return (
        <React.Fragment key={block.id}>
          <Connector />
          <div className="flex justify-center">
            <AddButton onPick={(kind) => onAdd(kind, i)} />
          </div>
          <Connector />

          <div
            onClick={() => onSelect(block.id)}
            className={clsx(
              'group rounded-[14px] border p-[13px] cursor-pointer transition-all duration-150',
              selected
                ? 'border-btnPrimary/60 bg-btnPrimary/[0.08] shadow-[0_0_0_3px_rgba(107,163,218,0.09)]'
                : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.2]'
            )}
          >
            <div className="flex items-start gap-[11px]">
              <span
                className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[14px] shrink-0"
                style={{ background: `${meta?.accent ?? '#8b93a5'}22` }}
              >
                {meta?.icon ?? '•'}
              </span>

              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-[600]">{meta?.label ?? block.kind}</div>
                <div className="text-[11.5px] text-textItemBlur mt-[2px] line-clamp-2 leading-[1.45]">
                  {summarise(block)}
                </div>
              </div>

              <div className="flex items-center gap-[1px] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(i, -1);
                  }}
                  disabled={i === 0}
                  className="w-[24px] h-[24px] rounded-[7px] hover:bg-white/[0.09] disabled:opacity-25 text-[11px]"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(i, 1);
                  }}
                  disabled={i === blocks.length - 1}
                  className="w-[24px] h-[24px] rounded-[7px] hover:bg-white/[0.09] disabled:opacity-25 text-[11px]"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(block.id);
                  }}
                  className="w-[24px] h-[24px] rounded-[7px] hover:bg-[#e2685f]/15 hover:text-[#e2685f] text-[12px]"
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    })}

    <Connector />
    <AddButton onPick={(kind) => onAdd(kind, blocks.length)} label="+ Add a step" />

    {blocks.length > 0 && (
      <>
        <Connector />
        <div className="flex justify-center">
          <span className="text-[10.5px] text-textItemBlur px-[11px] py-[4px] rounded-full bg-white/[0.04]">
            End of flow
          </span>
        </div>
      </>
    )}
  </div>
);
