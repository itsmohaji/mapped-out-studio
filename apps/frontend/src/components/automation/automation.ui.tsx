'use client';

import React, { FC, ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Shared primitives for the Automation module.
 *
 * Kept in one place so every surface in the module has the same corner radius,
 * spacing rhythm and hover behaviour. The rest of the app uses tighter
 * developer-tool density; Automation is deliberately roomier.
 */

export const RADIUS = 'rounded-[16px]';

/** Frosted panel. The blur only reads on top of content, so it stays subtle. */
export const Glass: FC<{
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}> = ({ children, className, onClick, hoverable }) => (
  <div
    onClick={onClick}
    className={clsx(
      RADIUS,
      'border border-white/[0.07] bg-white/[0.03] backdrop-blur-[12px]',
      'shadow-[0_1px_2px_rgba(0,0,0,0.18)]',
      hoverable &&
        'transition-all duration-200 ease-out cursor-pointer hover:border-white/[0.16] hover:bg-white/[0.055] hover:-translate-y-[2px] hover:shadow-[0_10px_28px_-12px_rgba(0,0,0,0.55)]',
      className
    )}
  >
    {children}
  </div>
);

export const PageHeader: FC<{
  title: string;
  subtitle?: string;
  back?: () => void;
  backLabel?: string;
  right?: ReactNode;
}> = ({ title, subtitle, back, backLabel, right }) => (
  <div className="flex flex-col gap-[14px]">
    {!!back && (
      <button
        onClick={back}
        className="self-start text-[13px] text-textItemBlur hover:text-textColor transition-colors flex items-center gap-[6px] group"
      >
        <span className="transition-transform group-hover:-translate-x-[2px]">←</span>
        {backLabel || 'Back'}
      </button>
    )}
    <div className="flex flex-wrap items-start gap-[16px]">
      <div className="flex-1 min-w-[240px]">
        <h1 className="text-[26px] leading-[1.15] font-[600] tracking-[-0.02em]">{title}</h1>
        {!!subtitle && (
          <p className="text-[13.5px] text-textItemBlur mt-[6px] max-w-[560px] leading-[1.5]">
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </div>
  </div>
);

const HEALTH: Record<string, { label: string; dot: string; text: string }> = {
  running: { label: 'Running', dot: 'bg-[#47b985]', text: 'text-[#47b985]' },
  idle: { label: 'No automations', dot: 'bg-[#8b93a5]', text: 'text-[#8b93a5]' },
  reconnect: { label: 'Needs reconnect', dot: 'bg-[#daa646]', text: 'text-[#daa646]' },
  disabled: { label: 'Disabled', dot: 'bg-[#e2685f]', text: 'text-[#e2685f]' },
  unsupported: { label: 'Not supported', dot: 'bg-[#8b93a5]', text: 'text-[#8b93a5]' },
};

export const HealthDot: FC<{ health: string }> = ({ health }) => {
  const h = HEALTH[health] ?? HEALTH.idle;
  return (
    <span className={clsx('flex items-center gap-[6px] text-[11.5px] font-[500]', h.text)}>
      <span className={clsx('w-[6px] h-[6px] rounded-full', h.dot)} />
      {h.label}
    </span>
  );
};

export const StatusPill: FC<{ status: string }> = ({ status }) => {
  const map: Record<string, string> = {
    active: 'bg-[#47b985]/15 text-[#47b985] border-[#47b985]/25',
    draft: 'bg-white/[0.06] text-textItemBlur border-white/[0.1]',
    paused: 'bg-[#daa646]/15 text-[#daa646] border-[#daa646]/25',
  };
  return (
    <span
      className={clsx(
        'px-[9px] py-[3px] rounded-full text-[10.5px] font-[600] uppercase tracking-[0.04em] border shrink-0',
        map[status] ?? map.draft
      )}
    >
      {status === 'active' ? 'Live' : status}
    </span>
  );
};

/** Platform glyph. Emoji beats a broken icon import, and reads at any size. */
export const PLATFORM_ICON: Record<string, string> = {
  instagram: '📸',
  facebook: '👥',
  whatsapp: '💚',
  website: '🌐',
  tiktok: '🎵',
  linkedin: '💼',
  threads: '🧵',
};

export const PLATFORM_TINT: Record<string, string> = {
  instagram: 'from-[#c13584]/25 to-[#f56040]/10',
  facebook: 'from-[#1877f2]/25 to-[#1877f2]/5',
  whatsapp: 'from-[#25d366]/25 to-[#25d366]/5',
  website: 'from-[#6ba3da]/25 to-[#6ba3da]/5',
  tiktok: 'from-white/15 to-white/[0.03]',
  linkedin: 'from-[#0a66c2]/25 to-[#0a66c2]/5',
  threads: 'from-white/15 to-white/[0.03]',
};

/** "2 hours ago" — nobody wants to read a timestamp on a dashboard card. */
export function timeAgo(iso?: string | null): string {
  if (!iso) return 'Never run';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Never run';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

export const EmptyState: FC<{ icon: string; title: string; body: string; action?: ReactNode }> = ({
  icon,
  title,
  body,
  action,
}) => (
  <div className="flex flex-col items-center text-center py-[56px] px-[24px]">
    <div className="text-[36px] mb-[14px] opacity-80">{icon}</div>
    <div className="text-[16px] font-[600]">{title}</div>
    <p className="text-[13px] text-textItemBlur mt-[6px] max-w-[400px] leading-[1.55]">{body}</p>
    {!!action && <div className="mt-[18px]">{action}</div>}
  </div>
);

export const Skeleton: FC<{ className?: string }> = ({ className }) => (
  <div className={clsx('animate-pulse bg-white/[0.05] rounded-[10px]', className)} />
);
