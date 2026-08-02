'use client';

import React, { FC, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Glass, PageHeader, Skeleton } from './automation.ui';

export interface Template {
  key: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  accent: string;
  channels: string[];
  trigger: string;
  category: string;
  keywords?: string[];
  requiresMessaging: boolean;
  comingSoon?: boolean;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'lead', label: 'Leads' },
  { key: 'support', label: 'Support' },
  { key: 'booking', label: 'Booking' },
  { key: 'advanced', label: 'Advanced' },
];

const TemplateCard: FC<{ template: Template; onPick: () => void }> = ({ template, onPick }) => (
  <Glass
    hoverable
    onClick={onPick}
    className="p-[20px] flex flex-col gap-[12px] relative overflow-hidden group"
  >
    {/* Accent wash — the only colour each card carries, so the grid stays calm. */}
    <div
      className="absolute inset-x-0 top-0 h-[2px] opacity-60 group-hover:opacity-100 transition-opacity"
      style={{ background: template.accent }}
    />

    <div className="flex items-start justify-between gap-[10px]">
      <div
        className="w-[42px] h-[42px] rounded-[12px] flex items-center justify-center text-[20px] shrink-0"
        style={{ background: `${template.accent}22` }}
      >
        {template.icon}
      </div>
      {template.comingSoon && (
        <span className="text-[10px] uppercase tracking-[0.05em] font-[600] px-[8px] py-[3px] rounded-full bg-white/[0.06] text-textItemBlur border border-white/[0.1]">
          Soon
        </span>
      )}
    </div>

    <div>
      <div className="text-[14.5px] font-[600] leading-tight">{template.name}</div>
      <div className="text-[11.5px] text-textItemBlur mt-[3px]">{template.tagline}</div>
    </div>

    <p className="text-[12.5px] text-textItemBlur leading-[1.55] flex-1">{template.description}</p>

    {!!template.keywords?.length && (
      <div className="flex flex-wrap gap-[5px]">
        {template.keywords.slice(0, 3).map((k) => (
          <span
            key={k}
            className="text-[10.5px] font-[600] px-[7px] py-[2px] rounded-[5px] bg-white/[0.06] border border-white/[0.08]"
          >
            {k}
          </span>
        ))}
      </div>
    )}

    <div className="flex items-center justify-between pt-[12px] border-t border-white/[0.06]">
      <span className="text-[11.5px] text-textItemBlur">
        {template.requiresMessaging ? 'Needs DM access' : 'Ready to use'}
      </span>
      <span className="text-[12px] font-[500] text-btnPrimary opacity-0 group-hover:opacity-100 transition-opacity">
        Use this →
      </span>
    </div>
  </Glass>
);

export const TemplatesView: FC<{
  templates?: Template[];
  loading: boolean;
  accountName: string;
  onPick: (t: Template) => void;
  onBack: () => void;
}> = ({ templates, loading, accountName, onPick, onBack }) => {
  const [category, setCategory] = useState('all');

  const shown = useMemo(
    () =>
      (templates ?? []).filter((t) => category === 'all' || t.category === category),
    [templates, category]
  );

  return (
    <div className="flex flex-col gap-[24px]">
      <PageHeader
        title="Start from a template"
        subtitle={`Pick what you want to happen on ${accountName}. Every template is a normal automation — you can change any step afterwards.`}
        back={onBack}
        backLabel="All accounts"
      />

      <div className="flex flex-wrap gap-[7px]">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={clsx(
              'text-[12.5px] px-[13px] py-[7px] rounded-full border transition-all duration-150',
              category === c.key
                ? 'bg-btnPrimary/15 border-btnPrimary/40 text-btnPrimary font-[500]'
                : 'border-white/[0.09] text-textItemBlur hover:border-white/20 hover:text-textColor'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-[16px] grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[220px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-[16px] grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {shown.map((t) => (
            <TemplateCard key={t.key} template={t} onPick={() => onPick(t)} />
          ))}
        </div>
      )}
    </div>
  );
};
