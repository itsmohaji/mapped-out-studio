'use client';

import { FC, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { LogoutComponent } from '@gitroom/frontend/components/layout/logout.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const AccountMenu: FC = () => {
  const user = useUser() as any;
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const email: string = user?.email || '';
  const name: string = user?.name || email;
  const initial = (name || email || '?').trim().slice(0, 1).toUpperCase();
  const roleRaw = (user?.role || '').toString().toUpperCase();
  const roleLabel =
    roleRaw === 'SUPERADMIN'
      ? 'Super Admin'
      : roleRaw === 'ADMIN'
      ? 'Admin'
      : roleRaw === 'USER'
      ? 'Member'
      : '';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('account', 'Account')}
        className="flex items-center gap-[9px] ps-[12px] pe-[5px] py-[5px] rounded-[14px] glass-surface hover:brightness-110 transition"
      >
        {name && (
          <div className="hidden sm:block text-end leading-tight">
            <div className="text-[12.5px] font-[600] text-newTextColor truncate max-w-[140px]">
              {name}
            </div>
            {roleLabel && (
              <div className="text-[10px] text-textItemBlur">{roleLabel}</div>
            )}
          </div>
        )}
        <div className="w-[30px] h-[30px] rounded-[9px] bg-[linear-gradient(140deg,#8fbbe4,var(--new-btn-primary))] flex items-center justify-center text-[11px] font-[700] text-white shrink-0">
          {initial}
        </div>
      </button>
      {open && (
        <div className="absolute end-0 mt-[10px] min-w-[210px] bg-newBgColorInner border border-newTableBorder rounded-[12px] shadow-xl p-[6px] z-[300]">
          {name && (
            <div className="px-[10px] py-[8px] mb-[4px] border-b border-newTableBorder">
              <div className="text-[13px] font-[600] text-newTextColor truncate">
                {name}
              </div>
              {email && email !== name && (
                <div className="text-[11px] text-textItemBlur truncate">
                  {email}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push('/settings');
            }}
            className="w-full text-start px-[10px] py-[8px] rounded-[8px] text-[13px] text-newTextColor hover:bg-newBgLineColor transition-colors"
          >
            {t('settings', 'Settings')}
          </button>
          <div className="px-[10px] py-[8px] rounded-[8px] hover:bg-newBgLineColor transition-colors text-[13px]">
            <LogoutComponent />
          </div>
        </div>
      )}
    </div>
  );
};
