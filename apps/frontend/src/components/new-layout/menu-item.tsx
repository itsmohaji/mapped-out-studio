'use client';
import { FC, ReactNode, useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';

/**
 * The section people land in most. Prefetched once the browser is idle; every
 * other section is prefetched on intent (hover / focus / touch) instead.
 *
 * `prefetch={true}` on every sidebar link made each page load download every
 * other section's code in the background — 5–10 MB, 1.4–3.1 MB on the wire
 * (performance baseline, 2026-09-19). Hover → click is typically a few hundred
 * milliseconds, enough to hide most of the ~165 ms round trip.
 */
const LIKELY_NEXT = '/launches';

const saveData = () =>
  typeof navigator !== 'undefined' && (navigator as any).connection?.saveData === true;

export const MenuItem: FC<{
  label: string;
  icon: ReactNode;
  path: string;
  onClick?: () => void;
  collapsed?: boolean;
  badge?: number;
}> = ({ label, icon, path, onClick, collapsed, badge }) => {
  const currentPath = usePathname();
  const router = useRouter();
  const internal = path.indexOf('http') !== 0;
  const prefetch = useCallback(() => {
    if (internal) router.prefetch(path);
  }, [internal, path, router]);
  const isActive =
    path === '/dashboard'
      ? currentPath === '/dashboard' || currentPath === '/'
      : currentPath.indexOf(path) === 0;

  useEffect(() => {
    if (path !== LIKELY_NEXT || isActive || saveData()) return;
    const idle = (window as any).requestIdleCallback as
      | ((cb: () => void, o?: { timeout: number }) => number)
      | undefined;
    if (idle) {
      const id = idle(prefetch, { timeout: 5000 });
      return () => (window as any).cancelIdleCallback?.(id);
    }
    const t = setTimeout(prefetch, 2000);
    return () => clearTimeout(t);
  }, [path, isActive, prefetch]);

  const className = clsx(
    'group w-full h-[46px] gap-[13px] flex flex-row font-[500] items-center rounded-[12px] text-[13px] transition-colors hover:text-textItemFocused hover:bg-[var(--glass-hover)]',
    collapsed ? 'px-0 justify-center' : 'px-[14px]',
    isActive ? 'text-textItemFocused bg-boxFocused' : 'text-textItemBlur'
  );

  const inner = (
    <>
      <div className="shrink-0 flex items-center justify-center w-[20px] transition-transform">
        {icon}
      </div>
      {!collapsed && (
        <div className="leading-[1.1] whitespace-nowrap overflow-hidden text-ellipsis flex-1 flex items-center gap-[8px]">
          <span className="overflow-hidden text-ellipsis">{label}</span>
          {!!badge && (
            <span className="rounded-full bg-btnPrimary text-white text-[10px] px-[6px] py-[1px] leading-[1.4] shrink-0">
              {badge}
            </span>
          )}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} title={label} className={className}>
        {inner}
      </button>
    );
  }

  return (
    <Link
      prefetch={false}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
      href={path}
      title={label}
      {...path.indexOf('http') === 0 && { target: '_blank' }}
      className={className}
    >
      {inner}
    </Link>
  );
};
