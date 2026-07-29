'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Button } from '@gitroom/react/form/button';

interface Capability {
  key: string;
  name: string;
  kind: string;
  available: boolean;
  unavailableMessage?: string;
}
interface Credits {
  creditsUsed: number;
  creditsRemaining: number;
  imagesUsed: number;
  imagesRemaining: number;
}

const Meter: FC<{ label: string; used: number; left: number }> = ({
  label,
  used,
  left,
}) => {
  const total = used + left;
  const pct = total ? Math.round((used / total) * 100) : 0;
  return (
    <div className="glass-surface rounded-[16px] p-[16px] flex flex-col gap-[8px]">
      <div className="text-[11px] font-[600] text-textItemBlur">{label}</div>
      <div className="text-[24px] font-[600] tabular-nums leading-none">
        {left}
        <span className="text-[13px] text-textItemBlur font-[500]"> / {total}</span>
      </div>
      <div className="h-[5px] rounded-full bg-newBgLineColor overflow-hidden">
        <div
          className="h-full rounded-full bg-btnPrimary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const CapabilityRunner: FC<{
  capability: Capability;
  onDone: () => void;
}> = ({ capability, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setOutput('');
    try {
      const res = await (
        await fetch('/ai-orchestra/run', {
          method: 'POST',
          body: JSON.stringify({ capabilityKey: capability.key, input }),
        })
      ).json();
      if (!res?.ok) {
        toast.show(res?.message || t('action_failed', 'Action failed'), 'warning');
        return;
      }
      setOutput(res.output || '');
      onDone();
    } finally {
      setBusy(false);
    }
  }, [input, busy, capability.key, onDone, t]);

  return (
    <div
      className={clsx(
        'glass-surface rounded-[16px] p-[16px] flex flex-col gap-[10px]',
        !capability.available && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-[8px]">
        <div className="text-[13.5px] font-[600] flex-1">{capability.name}</div>
        {capability.kind === 'image' && (
          <span className="text-[10px] font-[600] uppercase tracking-wide px-[7px] py-[2px] rounded-full bg-btnPrimary/15 text-btnPrimary">
            {t('image', 'Image')}
          </span>
        )}
      </div>

      {!capability.available ? (
        <div className="text-[12px] text-textItemBlur">
          {capability.unavailableMessage ||
            t('capability_unavailable', 'Not available yet.')}
        </div>
      ) : !open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-[12.5px] text-btnPrimary hover:underline self-start"
        >
          {t('use_capability', 'Use')} →
        </button>
      ) : (
        <div className="flex flex-col gap-[10px]">
          <textarea
            autoFocus
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t(
              'ai_input_ph',
              'What is this for? Brand, audience, goal…'
            )}
            className="w-full bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[12px] py-[9px] text-[13px] outline-none focus:border-btnPrimary resize-none"
          />
          <div className="flex items-center gap-[10px]">
            <Button onClick={run} loading={busy}>
              {t('generate', 'Generate')}
            </Button>
            <button
              onClick={() => setOpen(false)}
              className="text-[12.5px] text-textItemBlur hover:underline"
            >
              {t('cancel', 'Cancel')}
            </button>
          </div>
          {output && (
            <div className="flex flex-col gap-[8px]">
              <div className="text-[11px] font-[600] uppercase tracking-wider text-textItemBlur">
                {t('draft_output', 'Draft — for your review')}
              </div>
              <div className="bg-newBgLineColor border border-newTableBorder rounded-[10px] p-[12px] text-[13px] whitespace-pre-wrap max-h-[320px] overflow-y-auto">
                {output}
              </div>
              <div className="text-[11px] text-textItemBlur">
                {t(
                  'ai_never_publishes',
                  'Nothing here is scheduled or published. Copy it into a post when you are happy with it.'
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AdminConsole: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  const { data, mutate } = useSWR('/ai-orchestra/admin/overview', load, {
    revalidateOnFocus: false,
  });

  const toggleCapability = useCallback(
    async (key: string, enabled: boolean) => {
      await fetch(`/ai-orchestra/admin/capability/${key}`, {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      });
      mutate();
    },
    [mutate]
  );

  const [credits, setCredits] = useState('');
  const [images, setImages] = useState('');

  const saveEntitlement = useCallback(async () => {
    await fetch('/ai-orchestra/admin/entitlement', {
      method: 'POST',
      body: JSON.stringify({
        monthlyCredits: Number(credits) || 0,
        monthlyImages: Number(images) || 0,
      }),
    });
    toast.show(t('saved', 'Saved'));
    mutate();
  }, [credits, images, mutate, t]);

  if (!data) return null;

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="glass-surface rounded-[16px] overflow-hidden">
        <div className="px-[16px] py-[12px] border-b border-newTableBorder text-[13px] font-[600]">
          {t('providers', 'Providers')}
        </div>
        <div className="divide-y divide-newTableBorder">
          {(data.providers || []).map((p: any) => (
            <div
              key={p.key}
              className="px-[16px] py-[10px] flex items-center gap-[10px]"
            >
              <div className="text-[13px] flex-1">{p.label}</div>
              <span
                className={clsx(
                  'text-[10.5px] font-[600] uppercase tracking-wide px-[8px] py-[3px] rounded-full',
                  p.available
                    ? 'bg-[#47b985]/15 text-[#47b985]'
                    : 'bg-[#8b93a5]/15 text-[#8b93a5]'
                )}
              >
                {p.available
                  ? t('connected', 'Connected')
                  : t('not_configured', 'Not configured')}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-surface rounded-[16px] overflow-hidden">
        <div className="px-[16px] py-[12px] border-b border-newTableBorder text-[13px] font-[600]">
          {t('capabilities', 'Capabilities')}
        </div>
        <div className="divide-y divide-newTableBorder">
          {(data.capabilities || []).map((c: any) => (
            <div
              key={c.key}
              className="px-[16px] py-[10px] flex items-center gap-[10px]"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-[600] truncate">{c.name}</div>
                <div className="text-[11px] text-textItemBlur truncate">
                  {c.skillKeys || t('no_skills_wired', 'No skills wired up')} ·{' '}
                  {c.minPlan}
                </div>
              </div>
              <button
                onClick={() => toggleCapability(c.key, !c.enabled)}
                className={clsx(
                  'text-[11px] font-[600] px-[10px] py-[5px] rounded-[8px] transition-colors',
                  c.enabled
                    ? 'bg-btnPrimary/15 text-btnPrimary'
                    : 'bg-newBgLineColor text-textItemBlur'
                )}
              >
                {c.enabled ? t('enabled', 'Enabled') : t('disabled', 'Disabled')}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[16px] items-start">
        <div className="glass-surface rounded-[16px] overflow-hidden">
          <div className="px-[16px] py-[12px] border-b border-newTableBorder text-[13px] font-[600]">
            {t('skills', 'Internal skills')}
          </div>
          <div className="divide-y divide-newTableBorder">
            {(data.skills || []).map((s: any) => (
              <div key={s.key} className="px-[16px] py-[10px] flex items-center gap-[10px]">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate">{s.name}</div>
                  <div className="text-[11px] text-textItemBlur truncate">
                    {s.provider} · {s.model} · v{s.versions?.[0]?.version ?? '—'}
                  </div>
                </div>
                <span
                  className={clsx(
                    'text-[10.5px] font-[600] uppercase px-[8px] py-[3px] rounded-full',
                    s.active
                      ? 'bg-[#47b985]/15 text-[#47b985]'
                      : 'bg-[#8b93a5]/15 text-[#8b93a5]'
                  )}
                >
                  {s.active ? t('active', 'Active') : t('inactive', 'Inactive')}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-surface rounded-[16px] overflow-hidden">
          <div className="px-[16px] py-[12px] border-b border-newTableBorder text-[13px] font-[600]">
            {t('limits_and_usage', 'Limits & usage')}
          </div>
          <div className="p-[16px] flex flex-col gap-[12px]">
            <div className="text-[12px] text-textItemBlur">
              {t('this_month', 'This month')}: {data.usage?.runs ?? 0}{' '}
              {t('runs_lower', 'runs')} · {data.usage?.creditsUsed ?? 0}{' '}
              {t('credits_lower', 'credits')} ·{' '}
              {((data.usage?.costMicros || 0) / 1_000_000).toFixed(2)}{' '}
              {t('approx_cost', 'approx. cost')}
            </div>
            <div className="grid grid-cols-2 gap-[10px]">
              <div className="flex flex-col gap-[6px]">
                <div className="text-[11px] font-[600] text-textItemBlur">
                  {t('monthly_credits', 'Monthly credits')}
                </div>
                <input
                  value={credits}
                  onChange={(e) => setCredits(e.target.value)}
                  placeholder={String(data.entitlement?.monthlyCredits ?? 0)}
                  className="bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[12px] py-[8px] text-[13px] outline-none focus:border-btnPrimary"
                />
              </div>
              <div className="flex flex-col gap-[6px]">
                <div className="text-[11px] font-[600] text-textItemBlur">
                  {t('monthly_images', 'Monthly images')}
                </div>
                <input
                  value={images}
                  onChange={(e) => setImages(e.target.value)}
                  placeholder={String(data.entitlement?.monthlyImages ?? 0)}
                  className="bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[12px] py-[8px] text-[13px] outline-none focus:border-btnPrimary"
                />
              </div>
            </div>
            <div>
              <Button onClick={saveEntitlement} secondary>
                {t('save', 'Save')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-surface rounded-[16px] overflow-hidden">
        <div className="px-[16px] py-[12px] border-b border-newTableBorder text-[13px] font-[600]">
          {t('ai_audit_log', 'AI audit log')}
        </div>
        {!data.runs?.length ? (
          <div className="px-[16px] py-[24px] text-[12.5px] text-textItemBlur">
            {t('no_ai_runs', 'No AI runs yet.')}
          </div>
        ) : (
          <div className="divide-y divide-newTableBorder max-h-[360px] overflow-y-auto">
            {data.runs.map((r: any) => (
              <div key={r.id} className="px-[16px] py-[9px] flex items-center gap-[10px]">
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] truncate">{r.capabilityKey}</div>
                  <div className="text-[11px] text-textItemBlur truncate">
                    {dayjs(r.createdAt).format('MMM D, HH:mm')}
                    {r.model ? ` · ${r.model}` : ''}
                    {r.refusedReason ? ` · ${r.refusedReason}` : ''}
                  </div>
                </div>
                <span
                  className={clsx(
                    'text-[10.5px] font-[600] uppercase px-[8px] py-[3px] rounded-full shrink-0',
                    r.status === 'ok'
                      ? 'bg-[#47b985]/15 text-[#47b985]'
                      : r.status === 'refused'
                      ? 'bg-[#daa646]/15 text-[#daa646]'
                      : 'bg-[#e2685f]/15 text-[#e2685f]'
                  )}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const AiOrchestraComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const user = useUser();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
  const [tab, setTab] = useState<'use' | 'admin'>('use');

  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  const { data, mutate } = useSWR<{
    capabilities: Capability[];
    credits: Credits;
  }>('/ai-orchestra/capabilities', load, { revalidateOnFocus: false });

  return (
    <div className="flex-1 flex flex-col gap-[16px] p-[20px]">
      <div className="flex items-start gap-[12px] flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-[22px] font-[600]">
            {t('ai_assistant', 'AI Assistant')}
          </h1>
          <p className="text-[13px] text-textItemBlur mt-[2px]">
            {t(
              'ai_assistant_sub',
              'Generates drafts for you to review. It never schedules or publishes anything by itself.'
            )}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-[3px] p-[3px] rounded-[10px] glass-surface">
            {(['use', 'admin'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={clsx(
                  'px-[12px] py-[6px] rounded-[8px] text-[12.5px] font-[600] transition-colors',
                  tab === k
                    ? 'bg-forth text-white'
                    : 'text-textItemBlur hover:text-primary'
                )}
              >
                {k === 'use'
                  ? t('capabilities', 'Capabilities')
                  : t('console', 'Console')}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'admin' && isAdmin ? (
        <AdminConsole />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
            <Meter
              label={t('credits_remaining', 'AI credits remaining')}
              used={data?.credits?.creditsUsed ?? 0}
              left={data?.credits?.creditsRemaining ?? 0}
            />
            <Meter
              label={t('images_remaining', 'Image generations remaining')}
              used={data?.credits?.imagesUsed ?? 0}
              left={data?.credits?.imagesRemaining ?? 0}
            />
          </div>

          {!data?.capabilities?.length ? (
            <div className="glass-surface rounded-[16px] px-[18px] py-[46px] text-center">
              <div className="text-[14px] font-[600]">
                {t('no_capabilities', 'No capabilities yet')}
              </div>
              <div className="text-[12.5px] text-textItemBlur mt-[5px]">
                {t(
                  'no_capabilities_help',
                  'An administrator enables these once they are ready.'
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[14px]">
              {data.capabilities.map((c) => (
                <CapabilityRunner
                  key={c.key}
                  capability={c}
                  onDone={mutate}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AiOrchestraComponent;
