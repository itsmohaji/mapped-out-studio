'use client';

import { useEffect } from 'react';

/**
 * Without this file a crash inside any page renders NOTHING — a white page with
 * no clue what happened. That cost hours on the calendar: the only way to see
 * the cause was to open devtools and reproduce it by hand.
 *
 * Next.js renders this in place of the failed segment, so the rest of the app
 * keeps working and the error is on screen where anyone can read it back.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Also put it in the console with a stack, for whoever has devtools open.
    console.error('[Mapped Out] page crashed:', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-[24px]">
      <div className="glass-surface rounded-[16px] p-[24px] max-w-[640px] w-full flex flex-col gap-[14px]">
        <div className="text-[18px] font-[600]">This page failed to load</div>

        <div className="text-[13px] text-textItemBlur">
          The rest of the app is still working. Sending this message to support
          is enough to identify the problem.
        </div>

        <div className="bg-newBgLineColor border border-newTableBorder rounded-[10px] p-[12px] text-[12.5px] font-mono break-words whitespace-pre-wrap max-h-[240px] overflow-y-auto">
          {error?.message || 'Unknown error'}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ''}
        </div>

        <div className="flex gap-[10px]">
          <button
            onClick={reset}
            className="rounded-[12px] font-[600] px-[16px] py-[9px] text-[13px] bg-btnPrimary text-white"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-[12px] font-[600] px-[16px] py-[9px] text-[13px] border border-newTableBorder"
          >
            Reload the page
          </button>
        </div>
      </div>
    </div>
  );
}
