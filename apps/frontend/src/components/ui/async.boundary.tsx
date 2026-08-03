'use client';

import React, { FC, ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

/**
 * The three states every fetched screen actually has.
 *
 * Pages here were written as `if (!data) return null`, which conflates "still
 * loading" with "the request failed" and renders NOTHING for both. A 403, a
 * 500, or the API being briefly unavailable during a deploy left a permanently
 * blank page with no error and no way to retry — the user's only recourse was
 * to reload and hope.
 *
 * A blank screen is the worst possible failure mode: it is indistinguishable
 * from a broken build, so it gets reported as "the page stopped working" rather
 * than "the server returned an error".
 *
 * Wrap a screen in this instead. `error` and `isLoading` come straight from
 * SWR, so adopting it is a three-line change per page.
 */
export const AsyncBoundary: FC<{
  isLoading?: boolean;
  error?: any;
  /** Undefined means "nothing arrived" — treated as still loading, not as empty. */
  data?: unknown;
  onRetry?: () => void;
  /** Shown when the request succeeded but returned nothing to display. */
  empty?: ReactNode;
  children: ReactNode;
}> = ({ isLoading, error, data, onRetry, empty, children }) => {
  const t = useT();

  if (error) {
    return (
      <div className="glass-surface rounded-[16px] p-[28px] flex flex-col items-center gap-[12px] text-center">
        <div className="w-[38px] h-[38px] rounded-full bg-[#e2685f]/15 flex items-center justify-center">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#e2685f" strokeWidth="1.9" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.01" />
          </svg>
        </div>
        <div>
          <div className="text-[13.5px] font-[600]">
            {t('could_not_load', 'This didn’t load')}
          </div>
          <div className="text-[12px] text-textItemBlur mt-[3px] max-w-[380px]">
            {t(
              'could_not_load_help',
              'The request failed. This is usually temporary — try again in a moment.'
            )}
          </div>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="h-[34px] px-[15px] rounded-[11px] bg-btnPrimary text-white text-[12px] font-[600] hover:brightness-110 transition"
          >
            {t('try_again', 'Try again')}
          </button>
        )}
      </div>
    );
  }

  // `isLoading` alone is not enough: SWR reports false once a request settles,
  // including when it settled with nothing usable.
  if (isLoading || data === undefined) {
    return <LoadingComponent />;
  }

  if (empty && Array.isArray(data) && data.length === 0) {
    return <>{empty}</>;
  }

  return <>{children}</>;
};
