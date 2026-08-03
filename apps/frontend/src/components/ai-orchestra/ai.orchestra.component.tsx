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
import { AsyncBoundary } from '@gitroom/frontend/components/ui/async.boundary';

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

interface Coverage {
  channelsConnected: number;
  channelsReporting: number;
  postsSampled: number;
  timeframeDays: number;
  hasBrief: boolean;
}

const CapabilityRunner: FC<{
  capability: Capability;
  customerId: string;
  timeframeDays: number;
  onDone: () => void;
}> = ({ capability, customerId, timeframeDays, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setOutput('');
    setCoverage(null);
    try {
      const res = await (
        await fetch('/ai-orchestra/run', {
          method: 'POST',
          body: JSON.stringify({
            capabilityKey: capability.key,
            input,
            customerId: customerId || undefined,
            timeframeDays,
          }),
        })
      ).json();
      if (!res?.ok) {
        toast.show(res?.message || t('action_failed', 'Action failed'), 'warning');
        return;
      }
      setOutput(res.output || '');
      setCoverage(res.coverage || null);
      onDone();
    } finally {
      setBusy(false);
    }
  }, [input, busy, capability.key, customerId, timeframeDays, onDone, t]);

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
              {/* What the answer was based on, shown BEFORE the answer, so a
                  thin sample is visible rather than buried. */}
              {coverage && (
                <div className="text-[11px] text-textItemBlur border-s-2 border-newTableBorder ps-[8px]">
                  {t('based_on', 'Based on')}{' '}
                  {coverage.channelsReporting}/{coverage.channelsConnected}{' '}
                  {t('channels_reporting', 'channels reporting')} ·{' '}
                  {coverage.postsSampled}{' '}
                  {t('posts_sampled', 'posts')} ·{' '}
                  {t('last_n_days', 'last')} {coverage.timeframeDays}{' '}
                  {t('days', 'days')}
                  {!coverage.hasBrief &&
                    ` · ${t('no_brand_brief', 'no brand brief on file')}`}
                </div>
              )}
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
  const { data, mutate, error, isLoading } = useSWR('/ai-orchestra/admin/overview', load, {
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

  // Was `if (!data) return null` — a failed fetch rendered a permanently blank
  // page with no error and no retry, which reads as the feature being broken.
  if (isLoading || error || !data) {
    return (
      <AsyncBoundary
        isLoading={isLoading}
        error={error}
        data={data}
        onRetry={() => mutate()}
      >
        <div />
      </AsyncBoundary>
    );
  }

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

      <BrandBriefsPanel />
    </div>
  );
};

const BRIEF_FIELDS: Array<{ key: string; label: string; ph: string }> = [
  { key: 'audience', label: 'Audience', ph: 'Who this client is talking to' },
  { key: 'tone', label: 'Tone of voice', ph: 'Warm and direct; never jokey' },
  { key: 'dos', label: 'Always', ph: 'Lead with the guest experience' },
  { key: 'donts', label: 'Never', ph: 'Never discount; never use emojis' },
  { key: 'products', label: 'Products / services', ph: 'What they actually sell' },
  { key: 'notes', label: 'Notes', ph: 'Anything else worth knowing' },
];

/**
 * Optional per-client guidance. Everything here is asserted by a human, so it is
 * kept clearly separate from the observed data the skills read — and a client
 * with no brief still works, it just gets generic guidance.
 */
const BrandBriefsPanel: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  const { data, mutate } = useSWR('/ai-orchestra/admin/brand-briefs', load, {
    revalidateOnFocus: false,
  });

  const [customerId, setCustomerId] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Load the brief for whichever client is selected. `customerId === ''` is the
  // organisation-wide default, stored with a null customerId.
  const selectBrief = useCallback(
    (id: string) => {
      setCustomerId(id);
      const found = (data?.briefs || []).find(
        (b: any) => (b.customerId || '') === id
      );
      setForm(
        BRIEF_FIELDS.reduce(
          (acc, f) => ({ ...acc, [f.key]: found?.[f.key] || '' }),
          {}
        )
      );
    },
    [data]
  );

  const save = useCallback(async () => {
    setBusy(true);
    try {
      await fetch('/ai-orchestra/admin/brand-brief', {
        method: 'POST',
        body: JSON.stringify({ customerId: customerId || null, ...form }),
      });
      toast.show(t('saved', 'Saved'), 'success');
      mutate();
    } finally {
      setBusy(false);
    }
  }, [customerId, form, mutate, t]);

  return (
    <div className="glass-surface rounded-[16px] p-[16px] flex flex-col gap-[12px]">
      <div>
        <div className="text-[13px] font-[600]">
          {t('brand_briefs', 'Brand briefs')}
        </div>
        <div className="text-[11.5px] text-textItemBlur mt-[2px]">
          {t(
            'brand_briefs_help',
            'Optional. Without one, drafts still work from the account’s real data — they just keep the guidance generic instead of inventing a house style.'
          )}
        </div>
      </div>

      <select
        value={customerId}
        onChange={(e) => selectBrief(e.target.value)}
        className="bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[11px] py-[8px] text-[13px] outline-none focus:border-btnPrimary max-w-[340px]"
      >
        <option value="">
          {t('workspace_default_brief', 'Workspace default brief')}
        </option>
        {(data?.clients || []).map((c: any) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
        {BRIEF_FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-[4px]">
            <label className="text-[11px] font-[600] uppercase tracking-wider text-textItemBlur">
              {t(`brief_${f.key}`, f.label)}
            </label>
            <textarea
              rows={2}
              value={form[f.key] || ''}
              placeholder={f.ph}
              onChange={(e) =>
                setForm((s) => ({ ...s, [f.key]: e.target.value }))
              }
              className="w-full bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[11px] py-[8px] text-[13px] outline-none focus:border-btnPrimary resize-none"
            />
          </div>
        ))}
      </div>

      <Button onClick={save} loading={busy} className="self-start">
        {t('save_brief', 'Save brief')}
      </Button>
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

  const { data: clients } = useSWR<Array<{ id: string; name: string }>>(
    '/ai-orchestra/clients',
    load,
    { revalidateOnFocus: false }
  );

  // Which client and how far back a run should look at. Both are inputs to the
  // data the skills are given, so they belong beside the capabilities rather
  // than inside each one.
  const [customerId, setCustomerId] = useState('');
  const [timeframeDays, setTimeframeDays] = useState(30);

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

          <div className="glass-surface rounded-[16px] p-[14px] flex flex-wrap items-end gap-[14px]">
            <div className="flex flex-col gap-[5px] min-w-[190px] flex-1">
              <label className="text-[11px] font-[600] uppercase tracking-wider text-textItemBlur">
                {t('client', 'Client')}
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[11px] py-[8px] text-[13px] outline-none focus:border-btnPrimary"
              >
                <option value="">
                  {t('all_channels', 'All channels in this workspace')}
                </option>
                {(clients || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-[5px] min-w-[150px]">
              <label className="text-[11px] font-[600] uppercase tracking-wider text-textItemBlur">
                {t('timeframe', 'Timeframe')}
              </label>
              <select
                value={timeframeDays}
                onChange={(e) => setTimeframeDays(Number(e.target.value))}
                className="bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[11px] py-[8px] text-[13px] outline-none focus:border-btnPrimary"
              >
                {[7, 30, 90].map((d) => (
                  <option key={d} value={d}>
                    {t('last_n_days', 'last')} {d} {t('days', 'days')}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[11.5px] text-textItemBlur flex-1 min-w-[200px]">
              {t(
                'ai_context_help',
                'Drafts are written from this account’s real analytics and its own published posts over this period. Nothing outside it is used.'
              )}
            </div>
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
                  customerId={customerId}
                  timeframeDays={timeframeDays}
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
