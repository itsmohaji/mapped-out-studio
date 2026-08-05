'use client';

import React, { FC } from 'react';
import clsx from 'clsx';
import type { RenderedSection } from '@gitroom/helpers/utils/ai.capabilities';

/**
 * An AI answer, rendered as a document rather than a wall of text.
 *
 * The sections come parsed from the server, so this component does no string
 * munging and has no idea which model produced them — it renders a known shape
 * into a known layout. That is the whole reason the output contract exists.
 *
 * Typography does the work: one accent, generous leading, headings that are
 * quiet enough to scan past and loud enough to find. No card-in-card, no
 * borders around every block — the brief asked for scannable, and lines a
 * reader has to step over are the opposite.
 */

const Heading: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10.5px] font-[700] uppercase tracking-[0.09em] text-textItemBlur">
    {children}
  </div>
);

const Bullets: FC<{ items: string[]; ordered?: boolean }> = ({
  items,
  ordered,
}) => (
  <div className="flex flex-col gap-[9px]">
    {items.map((item, i) => (
      <div key={i} className="flex gap-[10px] items-start">
        {ordered ? (
          // A numbered step is a sequence; the number carries meaning, so it
          // gets weight rather than being a decoration.
          <span className="shrink-0 mt-[1px] w-[19px] h-[19px] rounded-full bg-btnPrimary/12 text-btnPrimary text-[10.5px] font-[700] flex items-center justify-center tabular-nums">
            {i + 1}
          </span>
        ) : (
          <span className="shrink-0 mt-[7px] w-[4px] h-[4px] rounded-full bg-btnPrimary/60" />
        )}
        <span className="text-[13px] leading-[1.62] flex-1">{item}</span>
      </div>
    ))}
  </div>
);

const Metrics: FC<{ items: { label: string; value: string }[] }> = ({
  items,
}) => (
  <div className="grid grid-cols-2 lg:grid-cols-3 gap-[8px]">
    {items.map((m, i) => (
      <div
        key={i}
        className="rounded-[12px] px-[12px] py-[10px] bg-[var(--glass-2)] flex flex-col gap-[3px] min-w-0"
      >
        <div className="text-[10.5px] font-[600] text-textItemBlur truncate">
          {m.label}
        </div>
        {/* tabular-nums so a column of figures lines up instead of shimmering */}
        <div className="text-[15px] font-[600] tabular-nums leading-tight break-words">
          {m.value || '—'}
        </div>
      </div>
    ))}
  </div>
);

const Schedule: FC<{ items: { when: string; what: string }[] }> = ({
  items,
}) => (
  <div className="flex flex-col">
    {items.map((row, i) => (
      <div
        key={i}
        className={clsx(
          'flex gap-[14px] py-[10px] items-baseline',
          i > 0 && 'border-t border-[var(--gline)]'
        )}
      >
        <div className="shrink-0 w-[104px] text-[11.5px] font-[600] text-btnPrimary">
          {row.when || '—'}
        </div>
        <div className="text-[13px] leading-[1.55] flex-1 min-w-0">
          {row.what}
        </div>
      </div>
    ))}
  </div>
);

export const AiAnswer: FC<{
  sections: RenderedSection[];
  className?: string;
}> = ({ sections, className }) => {
  // A boundary can only be trusted so far: rows written before the controller
  // validated `sections` can still hold a non-array. `.length` alone lets a
  // string through (`'x'.length` is truthy), which then crashes on `.map`.
  if (!Array.isArray(sections) || !sections.length) return null;

  return (
    <div className={clsx('flex flex-col gap-[20px]', className)}>
      {sections.map((section) => (
        <div key={section.key} className="flex flex-col gap-[9px]">
          {/* The lead summary needs no heading — a label above the first two
              sentences is a speed bump before the thing people came to read. */}
          {section.kind !== 'summary' && <Heading>{section.title}</Heading>}

          {section.kind === 'summary' && (
            <div className="text-[14px] leading-[1.65]">{section.text}</div>
          )}
          {section.kind === 'list' && <Bullets items={section.items || []} />}
          {section.kind === 'steps' && (
            <Bullets items={section.items || []} ordered />
          )}
          {section.kind === 'metrics' && (
            <Metrics items={section.metrics || []} />
          )}
          {section.kind === 'schedule' && (
            <Schedule items={section.schedule || []} />
          )}
        </div>
      ))}
    </div>
  );
};
