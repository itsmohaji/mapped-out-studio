'use client';

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Channel filter for the calendar. Empty selection = every channel, which is
// also the reset state — so "clear" and "select all" are the same action.
export const ChannelFilter: FC = () => {
  const t = useT();
  const { integrations, channelIds, setChannelIds } = useCalendar();
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

  const label = useMemo(() => {
    if (!channelIds.length) return t('all_channels', 'All channels');
    if (channelIds.length === 1) {
      const one = integrations.find((i) => i.id === channelIds[0]);
      return one?.name || t('one_channel', '1 channel');
    }
    return `${channelIds.length} ${t('channels', 'channels')}`;
  }, [channelIds, integrations, t]);

  if (integrations.length < 2) return null;

  const toggle = (id: string) =>
    setChannelIds(
      channelIds.includes(id)
        ? channelIds.filter((x) => x !== id)
        : [...channelIds, id]
    );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex items-center gap-[8px] h-[38px] px-[12px] border rounded-[8px] text-[14px] font-[500] transition-colors',
          channelIds.length
            ? 'border-btnPrimary text-textItemFocused'
            : 'border-newTableBorder'
        )}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
        <span className="max-w-[130px] truncate">{label}</span>
      </button>

      {open && (
        <div className="absolute z-[300] mt-[6px] start-0 min-w-[240px] max-h-[320px] overflow-auto bg-newBgColorInner border border-newTableBorder rounded-[12px] shadow-xl p-[6px]">
          <button
            type="button"
            onClick={() => setChannelIds([])}
            className={clsx(
              'w-full text-start px-[10px] py-[8px] rounded-[8px] text-[13px] font-[600] hover:bg-boxHover',
              !channelIds.length && 'text-textItemFocused bg-boxFocused'
            )}
          >
            {t('all_channels', 'All channels')}
          </button>
          <div className="h-px bg-newTableBorder my-[5px]" />
          {integrations.map((i) => {
            const on = channelIds.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => toggle(i.id)}
                className="w-full flex items-center gap-[9px] px-[10px] py-[7px] rounded-[8px] text-[13px] hover:bg-boxHover text-start"
              >
                <span
                  className={clsx(
                    'w-[16px] h-[16px] rounded-[5px] border-2 flex items-center justify-center shrink-0',
                    on
                      ? 'bg-btnPrimary border-btnPrimary'
                      : 'border-newTableBorder'
                  )}
                >
                  {on && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
                <span className="relative shrink-0">
                  <img
                    className="w-[20px] h-[20px] rounded-[6px]"
                    src={i.picture || '/no-picture.jpg'}
                    alt=""
                  />
                  <img
                    className="w-[11px] h-[11px] rounded-[4px] absolute -bottom-[2px] -end-[2px] border border-fifth"
                    src={`/icons/platforms/${i.identifier}.png`}
                    alt=""
                  />
                </span>
                <span className="truncate">{i.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
