'use client';

import React, { FC, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Glass } from './automation.ui';

interface Setup {
  callbackUrl: string;
  verifyToken: string | null;
  verifyTokenSource: 'env' | 'derived';
  signatureSecretConfigured: boolean;
  subscribeFields: string[];
}

const CopyRow: FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => {
  const toast = useToaster();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked on insecure origins and in some embedded views;
      // the value is on screen either way, so say so rather than failing silently.
      toast.show('Could not copy — select the text manually', 'warning');
    }
  };

  return (
    <div className="flex flex-col gap-[6px]">
      <div className="text-[11px] uppercase tracking-[0.05em] text-textItemBlur font-[600]">
        {label}
      </div>
      <div className="flex items-stretch gap-[8px]">
        <div
          className={clsx(
            'flex-1 min-w-0 px-[12px] py-[10px] rounded-[10px] bg-black/25 border border-white/[0.09] text-[12.5px] break-all',
            mono && 'font-mono'
          )}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={copy}
          className={clsx(
            'shrink-0 px-[13px] rounded-[10px] border text-[12px] font-[500] transition-all duration-150',
            copied
              ? 'border-[#47b985]/50 bg-[#47b985]/12 text-[#47b985]'
              : 'border-white/[0.12] hover:border-btnPrimary hover:text-btnPrimary'
          )}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

/**
 * Webhook setup panel.
 *
 * Values come from the server rather than being written here, so what is shown
 * is exactly what the endpoint will accept — a documented value could drift the
 * first time anything changes.
 */
export const WebhookSetup: FC = () => {
  const fetchApi = useFetch();
  const [open, setOpen] = useState(false);

  const { data } = useSWR<Setup>('/automation/webhook-setup', async (url: string) =>
    (await fetchApi(url)).json()
  );

  const ready = !!data?.verifyToken && !!data?.signatureSecretConfigured;

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
            ready ? 'bg-[#47b985]' : 'bg-[#daa646]'
          )}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-[600]">Instagram webhook setup</span>
          <span className="block text-[11.5px] text-textItemBlur mt-[2px]">
            {ready
              ? 'Endpoint is live and configured — paste these two values into Meta'
              : 'Waiting on configuration'}
          </span>
        </span>
        <span className="text-[12px] text-textItemBlur shrink-0">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="px-[18px] pb-[18px] flex flex-col gap-[16px] border-t border-white/[0.06] pt-[16px]">
          <CopyRow label="Callback URL" value={data?.callbackUrl ?? '—'} mono />
          <CopyRow label="Verify Token" value={data?.verifyToken ?? '—'} mono />

          <div className="flex flex-col gap-[7px]">
            <div className="text-[11px] uppercase tracking-[0.05em] text-textItemBlur font-[600]">
              Subscribe to these fields
            </div>
            <div className="flex flex-wrap gap-[6px]">
              {(data?.subscribeFields ?? []).map((f) => (
                <span
                  key={f}
                  className="text-[11.5px] font-mono px-[9px] py-[4px] rounded-[7px] bg-white/[0.06] border border-white/[0.09]"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          <div className="text-[11.5px] text-textItemBlur leading-[1.6] border-t border-white/[0.06] pt-[13px]">
            <p>
              In the Meta App dashboard: <b>Webhooks → Instagram → Edit subscription</b>. Paste both
              values, click <b>Verify and Save</b>, then subscribe the fields above.
            </p>
            <p className="mt-[7px]">
              {data?.verifyTokenSource === 'derived'
                ? 'This token is derived from your Instagram app secret, so there is nothing to configure on the server. It stays the same unless that secret changes.'
                : 'This token comes from INSTAGRAM_WEBHOOK_VERIFY_TOKEN in your environment.'}
            </p>
            {!data?.signatureSecretConfigured && (
              <p className="mt-[7px] text-[#daa646]">
                INSTAGRAM_APP_SECRET is not set, so signed payloads will be rejected. Set it before
                going live.
              </p>
            )}
            <p className="mt-[7px]">
              <b>comments</b> works as soon as this is verified. <b>messages</b> stays silent until
              Meta grants Advanced Access for <code>instagram_business_manage_messages</code>.
            </p>
          </div>
        </div>
      )}
    </Glass>
  );
};
