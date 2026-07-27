'use client';
import { FC, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';

export const MenuItem: FC<{
  label: string;
  icon: ReactNode;
  path: string;
  onClick?: () => void;
  collapsed?: boolean;
  badge?: number;
}> = ({ label, icon, path, onClick, collapsed, badge }) => {
  const currentPath = usePathname();
  const isActive =
    path === '/dashboard'
      ? currentPath === '/dashboard' || currentPath === '/'
      : currentPath.indexOf(path) === 0;

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
      prefetch={true}
      href={path}
      title={label}
      {...path.indexOf('http') === 0 && { target: '_blank' }}
      className={className}
    >
      {inner}
    </Link>
  );
};
