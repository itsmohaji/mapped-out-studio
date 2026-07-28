'use client';

import { FC } from 'react';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';

export const PicksSocialsComponent: FC<{ toolTip?: boolean }> = ({
  toolTip,
}) => {
  const exising = useExistingData();

  const {
    locked,
    addOrRemoveSelectedIntegration,
    integrations,
    selectedIntegrations,
  } = useLaunchStore(
    useShallow((state) => ({
      integrations: state.integrations,
      selectedIntegrations: state.selectedIntegrations,
      addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      locked: state.locked,
    }))
  );

  return (
    <div className={clsx('flex', locked && 'opacity-50 pointer-events-none')}>
      <div className="flex flex-1">
        {/* `innerComponent` was a dead class — no CSS rule anywhere. */}
        <div className="flex-1 flex">
          <div className="flex flex-wrap gap-[10px] flex-1">
            {integrations
              .filter((f) => {
                if (exising.integration) {
                  return f.id === exising.integration;
                }
                return !f.inBetweenSteps && !f.disabled;
              })
              .map((integration) => (
                <div
                  key={integration.id}
                  className="flex gap-[8px] items-center"
                  {...(toolTip && {
                    'data-tooltip-id': 'tooltip',
                    'data-tooltip-content': integration.name,
                  })}
                >
                  <div
                    onClick={() => {
                      if (exising.integration) {
                        return;
                      }
                      addOrRemoveSelectedIntegration(integration, {});
                    }}
                    className={clsx(
                      'cursor-pointer border-[2px] relative rounded-full flex justify-center items-center bg-fifth filter transition-all duration-300',
                      selectedIntegrations.findIndex(
                        (p) => p.integration.id === integration.id
                      ) === -1
                        ? // Readable when off, obviously off. Full grayscale
                          // read as "broken account" rather than "not picked".
                          'grayscale-[0.85] opacity-55 border-transparent hover:opacity-100 hover:grayscale-0'
                        : 'border-btnPrimary shadow-[0_0_0_4px_var(--accent-dim)]'
                    )}
                  >
                    <ImageWithFallback
                      fallbackSrc="/no-picture.jpg"
                      src={integration.picture || '/no-picture.jpg'}
                      className="rounded-full transition-all min-w-[42px] min-h-[42px]"
                      alt={integration.identifier}
                      width={42}
                      height={42}
                    />
                    {selectedIntegrations.findIndex(
                      (p) => p.integration.id === integration.id
                    ) !== -1 && (
                      <div className="absolute -top-[3px] -start-[3px] w-[16px] h-[16px] rounded-full bg-btnPrimary flex items-center justify-center z-20 border-2 border-newBgColorInner">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </div>
                    )}
                    {integration.identifier === 'youtube' ? (
                      <img
                        src="/icons/platforms/youtube.svg"
                        className="absolute z-10 bottom-0 -end-[5px] min-w-[16px]"
                        width={16}
                      />
                    ) : (
                      <SafeImage
                        src={`/icons/platforms/${integration.identifier}.png`}
                        className="rounded-[4px] absolute z-10 bottom-0 -end-[5px] min-w-[16px] min-h-[16px]"
                        alt={integration.identifier}
                        width={16}
                        height={16}
                      />
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
