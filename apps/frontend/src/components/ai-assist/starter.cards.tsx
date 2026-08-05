'use client';

import React, { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { STARTER_CARDS, StarterCard } from '@gitroom/helpers/utils/ai.threads';

/**
 * The three starters above the composer.
 *
 * Cards name what they will do, not which capability serves it — "Build a
 * campaign", not "Campaign Strategy". Only one card is filled, because only one
 * carries a finding; filling all three would flatten that difference.
 *
 * Phase A: the recommendation card runs on click like the others. It becomes
 * proactive only when per-post metrics are stored, which is Phase B — until
 * then it must never assert a measured comparison it cannot support.
 */
export const StarterCards: FC<{
  onAssisted: (card: StarterCard) => void;
  onAutomatic: (card: StarterCard) => void;
}> = ({ onAssisted, onAutomatic }) => {
  const t = useT();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-[10px]">
      {STARTER_CARDS.map((card) => {
        const filled = card.mode === 'automatic';
        return (
          <button
            key={card.key}
            type="button"
            onClick={() =>
              card.mode === 'automatic' ? onAutomatic(card) : onAssisted(card)
            }
            className={clsx(
              'rounded-[14px] p-[13px] text-start flex flex-col min-h-[118px]',
              'transition-all duration-200 hover:brightness-110 active:scale-[0.99]',
              filled ? 'bg-btnPrimary text-white' : 'glass-surface'
            )}
          >
            <div className="text-[12.5px] leading-[1.5] flex-1">
              {t(`starter_${card.key}`, defaultCopy(card.key))}
            </div>
            <div
              className={clsx(
                'flex items-center justify-between mt-[11px] pt-[9px] border-t',
                filled ? 'border-white/25' : 'border-[var(--gline)]'
              )}
            >
              <span
                className={clsx(
                  'text-[10.5px]',
                  filled ? 'text-white/85' : 'text-textItemBlur'
                )}
              >
                {t(`starter_label_${card.key}`, card.label)}
              </span>
              <span
                className={clsx(
                  'text-[10.5px] font-[600]',
                  filled ? 'text-white' : 'text-btnPrimary'
                )}
              >
                {t(`starter_action_${card.key}`, card.action)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

/**
 * Card copy. Deliberately states no figure: Phase A has no stored per-post
 * history, so a number here would be an assertion rather than a measurement.
 */
function defaultCopy(key: string): string {
  if (key === 'recommendation')
    return 'Look at what your recent posts did, and what to change next.';
  if (key === 'campaign')
    return 'Plan a campaign — the angle, the beats and how it is judged.';
  return 'Ideas for next week, grounded in what already performed.';
}
