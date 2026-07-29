'use client';

import { FC, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  SelectedIntegrations,
  useLaunchStore,
} from '@gitroom/frontend/components/new-launch/store';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useShallow } from 'zustand/react/shallow';
import { GlobalIcon } from '@gitroom/frontend/components/ui/icons';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import {
  useDecisionModal,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';

export function useHasScroll(ref: RefObject<HTMLElement | null>): boolean {
  const [hasHorizontalScroll, setHasHorizontalScroll] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const checkScroll = () => {
      const el = ref.current;
      if (el) {
        setHasHorizontalScroll(el.scrollWidth > el.clientWidth);
      }
    };

    checkScroll(); // initial check

    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(ref.current);

    const mutationObserver = new MutationObserver(checkScroll);
    mutationObserver.observe(ref.current, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref]);

  return hasHorizontalScroll;
}

export const SelectCurrent: FC = () => {
  const t = useT();
  const modals = useDecisionModal();
  const {
    selectedIntegrations,
    current,
    setCurrent,
    locked,
    setHide,
    addOrRemoveSelectedIntegration,
  } = useLaunchStore(
    useShallow((state) => ({
      selectedIntegrations: state.selectedIntegrations,
      addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      current: state.current,
      setCurrent: state.setCurrent,
      locked: state.locked,
      setHide: state.setHide,
    }))
  );

  const contentRef = useRef<HTMLDivElement>(null);
  const hasScroll = useHasScroll(contentRef);

  const removeSocial = useCallback(
    (sIntegration: Integrations) => async (e: any) => {
      e.stopPropagation();
      e.preventDefault();
      const open = await modals.open({
        title: 'Remove Social Account',
        description:
          'Are you sure you want to remove this social from scheduling?',
      });

      if (!open) {
        return;
      }

      addOrRemoveSelectedIntegration(sIntegration, {});
    },
    []
  );

  return (
    <>
      <div className="select-none left-0 absolute w-full z-[100] px-[20px]">
        <div
          ref={contentRef}
          className={clsx(
            'flex gap-[6px] w-full overflow-x-auto scrollbar scrollbar-thumb-tableBorder scrollbar-track-secondary',
            locked && 'opacity-50 pointer-events-none'
          )}
        >
          <div
            onClick={() => {
              setHide(true);
              setCurrent('global');
            }}
            className={clsx(
              'cursor-pointer flex gap-[7px] rounded-[10px] h-[40px] px-[12px] justify-center items-center border transition-all shrink-0 text-[12px] font-[600]',
              current !== 'global'
                ? 'bg-newBgLineColor border-transparent text-textItemBlur hover:text-newTextColor'
                : 'bg-btnPrimary/10 border-btnPrimary text-btnPrimary'
            )}
            data-tooltip-id="tooltip"
            data-tooltip-content={t('all_channels_tab', 'Write once for every channel')}
          >
            <GlobalIcon />
            <span>{t('all', 'All')}</span>
          </div>
          {selectedIntegrations.map(({ integration }) => (
            <div
              onClick={() => {
                setHide(true);
                setCurrent(integration.id);
              }}
              key={integration.id}
              className={clsx(
                'border cursor-pointer relative flex gap-[8px] w-[40px] h-[40px] rounded-[10px] items-center justify-center transition-all shrink-0 group/tab',
                current === integration.id
                  ? 'bg-btnPrimary/10 border-btnPrimary'
                  : 'bg-newBgLineColor border-transparent hover:border-newTableBorder'
              )}
            >
              <div
                onClick={removeSocial(integration)}
                data-tooltip-id="tooltip"
                data-tooltip-content={t('remove_channel', 'Remove this channel')}
                className="absolute z-20 justify-center items-center flex w-[15px] h-[15px] -top-[5px] -end-[5px] bg-newBgColorInner border border-newTableBorder hover:bg-[#e2685f] hover:border-[#e2685f] hover:text-white text-textItemBlur rounded-full text-[9px] opacity-0 group-hover/tab:opacity-100 transition-all"
              >
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </div>
              <IsGlobal id={integration.id} />
              <div
                {...{
                  'data-tooltip-id': 'tooltip',
                  'data-tooltip-content': integration.name,
                }}
                className={clsx(
                  'relative w-full h-full rounded-full flex justify-center items-center filter transition-all duration-500'
                )}
              >
                <SafeImage
                  src={integration.picture || '/no-picture.jpg'}
                  className="rounded-full min-w-[26px]"
                  alt={integration.identifier}
                  width={26}
                  height={26}
                  onError={(e) => {
                    e.currentTarget.src = '/no-picture.jpg';
                    e.currentTarget.srcset = '/no-picture.jpg';
                  }}
                />
                {integration.identifier === 'youtube' ? (
                  <img
                    src="/icons/platforms/youtube.svg"
                    className="absolute z-10 bottom-[2px] end-[2px] min-w-[12px]"
                    width={12}
                  />
                ) : (
                  <SafeImage
                    src={`/icons/platforms/${integration.identifier}.png`}
                    className="min-w-[12px] min-h-[12px] rounded-[3px] absolute z-10 bottom-[6px] end-[6px]"
                    alt={integration.identifier}
                    width={12}
                    height={12}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={clsx(hasScroll ? 'h-[55px]' : 'h-[40px]')} />
    </>
  );
};

export const IsGlobal: FC<{ id: string }> = ({ id }) => {
  const t = useT();
  const { isInternal } = useLaunchStore(
    useShallow((state) => ({
      isInternal: !!state.internal.find((p) => p.integration.id === id),
    }))
  );

  if (!isInternal) {
    return null;
  }

  return (
    <div
      data-tooltip-id="tooltip"
      data-tooltip-content={t(
        'no_longer_global_mode',
        'No longer in global mode'
      )}
      className="w-[8px] h-[8px] bg-[#8fbbe4] -top-[1px] -end-[3px] absolute rounded-full"
    />
  );
};
