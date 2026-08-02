'use client';

import React, { FC, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Glass, Skeleton, timeAgo } from './automation.ui';

/**
 * Live end-to-end check for one connected account.
 *
 * Every row is verified against the real Instagram API using the stored token,
 * in the order things actually fail. Configuration that "looks right" is not
 * evidence — this asks Instagram.
 */

interface Diagnostics {
  account: {
    id: string;
    name: string;
    platformId: string;
    username?: string | null;
    mediaCount?: number | null;
    disabled: boolean;
    refreshNeeded: boolean;
  };
  token: { stored: boolean; valid: boolean; detail: string | null };
  media: { readable: boolean; count: number; detail: string | null };
  subscription: { subscribed: boolean; fields: string[]; detail: string | null };
  events: { received: number; lastAt: string | null; lastKind: string | null };
}

const Row: FC<{
  state: 'pass' | 'fail' | 'warn';
  label: string;
  detail?: string | null;
  action?: React.ReactNode;
}> = ({ state, label, detail, action }) => (
  <div className="flex items-start gap-[11px] py-[11px] border-b border-white/[0.05] last:border-b-0">
    <span
      className={clsx(
        'w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] shrink-0 mt-[1px]',
        state === 'pass' && 'bg-[#47b985]/18 text-[#47b985]',
        state === 'warn' && 'bg-[#daa646]/18 text-[#daa646]',
        state === 'fail' && 'bg-[#e2685f]/18 text-[#e2685f]'
      )}
    >
      {state === 'pass' ? '✓' : state === 'warn' ? '!' : '✕'}
    </span>
    <div className="flex-1 min-w-0">
      <div className="text-[12.5px] font-[500]">{label}</div>
      {!!detail && (
        <div className="text-[11.5px] text-textItemBlur mt-[3px] leading-[1.5] break-words">
          {detail}
        </div>
      )}
    </div>
    {!!action && <div className="shrink-0">{action}</div>}
  </div>
);

export const AccountDiagnostics: FC<{ integrationId: string }> = ({ integrationId }) => {
  const fetchApi = useFetch();
  const toast = useToaster();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, mutate } = useSWR<Diagnostics>(
    open ? `/automation/accounts/${integrationId}/diagnostics` : null,
    async (url: string) => (await fetchApi(url)).json()
  );

  const subscribe = async () => {
    setBusy(true);
    try {
      const res = await (
        await fetchApi(`/automation/accounts/${integrationId}/subscribe`, { method: 'POST' })
      ).json();
      toast.show(res?.ok ? 'Subscribed to webhook events' : res?.detail || 'Could not subscribe',
        res?.ok ? 'success' : 'warning');
      await mutate();
    } finally {
      setBusy(false);
    }
  };

  const allGood =
    data?.token.valid && data?.media.readable && data?.subscription.subscribed;

  return (
    <Glass className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center gap-[12px] px-[18px] py-[14px] text-left"
      >
        <span
          className={clsx(
            'w-[8px] h-[8px] rounded-full shrink-0',
            !data ? 'bg-[#8b93a5]' : allGood ? 'bg-[#47b985]' : 'bg-[#daa646]'
          )}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-[600]">Connection check</span>
          <span className="block text-[11.5px] text-textItemBlur mt-[2px]">
            Token, posts, webhook subscription and events received
          </span>
        </span>
        <span className="text-[12px] text-textItemBlur shrink-0">{open ? 'Hide' : 'Run'}</span>
      </button>

      {open && (
        <div className="px-[18px] pb-[16px] border-t border-white/[0.06]">
          {isLoading && (
            <div className="flex flex-col gap-[8px] pt-[14px]">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[38px]" />
              ))}
            </div>
          )}

          {!!data && (
            <>
              <Row
                state={data.token.valid ? 'pass' : 'fail'}
                label={
                  data.token.valid
                    ? 'Access token is stored and accepted by Instagram'
                    : 'Access token problem'
                }
                detail={data.token.detail}
              />

              <Row
                state={data.media.readable ? (data.media.count ? 'pass' : 'warn') : 'fail'}
                label={
                  data.media.readable
                    ? `Instagram returned ${data.media.count} post${
                        data.media.count === 1 ? '' : 's'
                      }`
                    : 'Could not read this account’s posts'
                }
                detail={data.media.detail}
              />

              <Row
                state={data.subscription.subscribed ? 'pass' : 'warn'}
                label={
                  data.subscription.subscribed
                    ? `Subscribed to: ${data.subscription.fields.join(', ')}`
                    : 'Not subscribed to webhook events'
                }
                detail={data.subscription.detail}
                action={
                  !data.subscription.subscribed && (
                    <button
                      type="button"
                      onClick={subscribe}
                      disabled={busy}
                      className="text-[11.5px] px-[11px] py-[6px] rounded-[8px] border border-btnPrimary/45 text-btnPrimary hover:bg-btnPrimary/10 transition-colors disabled:opacity-50"
                    >
                      {busy ? 'Working…' : 'Subscribe'}
                    </button>
                  )
                }
              />

              <Row
                state={data.events.received > 0 ? 'pass' : 'warn'}
                label={
                  data.events.received > 0
                    ? `${data.events.received} webhook event${
                        data.events.received === 1 ? '' : 's'
                      } received`
                    : 'No webhook events received yet'
                }
                detail={
                  data.events.received > 0
                    ? `Last: ${data.events.lastKind} · ${timeAgo(data.events.lastAt)}`
                    : 'Comment on one of this account’s posts to produce one. Events only arrive once the callback is verified in Meta AND this account is subscribed above.'
                }
              />

              <div className="pt-[12px] flex items-center gap-[10px]">
                <button
                  type="button"
                  onClick={() => mutate()}
                  className="text-[11.5px] px-[11px] py-[6px] rounded-[8px] border border-white/[0.1] hover:border-btnPrimary hover:text-btnPrimary transition-colors"
                >
                  Re-run
                </button>
                <span className="text-[11px] text-textItemBlur">
                  Checked live against Instagram, not from saved settings.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </Glass>
  );
};
