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
import { StarterCards } from '@gitroom/frontend/components/ai-assist/starter.cards';
import { ThreadView } from '@gitroom/frontend/components/ai-assist/thread.view';
import { FolderSidebar } from '@gitroom/frontend/components/ai-assist/folder.sidebar';
import { useLibrary } from '@gitroom/frontend/components/ai-assist/threads.api';
import { STARTER_CARDS } from '@gitroom/helpers/utils/ai.threads';
import { assistantCapabilities } from '@gitroom/helpers/utils/ai.capabilities';

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

interface Coverage {
  channelsConnected: number;
  channelsReporting: number;
  postsSampled: number;
  timeframeDays: number;
  hasBrief: boolean;
}

const AdminConsole: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const load = useCallback(
    async (url: string) => (await fetch(url)).json(),
    []
  );
  const { data, mutate, error, isLoading } = useSWR(
    '/ai-orchestra/admin/overview',
    load,
    {
      revalidateOnFocus: false,
    }
  );

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
                {c.enabled
                  ? t('enabled', 'Enabled')
                  : t('disabled', 'Disabled')}
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
              <div
                key={s.key}
                className="px-[16px] py-[10px] flex items-center gap-[10px]"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate">{s.name}</div>
                  <div className="text-[11px] text-textItemBlur truncate">
                    {s.provider} · {s.model} · v
                    {s.versions?.[0]?.version ?? '—'}
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
              <div
                key={r.id}
                className="px-[16px] py-[9px] flex items-center gap-[10px]"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] truncate">
                    {r.capabilityKey}
                  </div>
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
  {
    key: 'products',
    label: 'Products / services',
    ph: 'What they actually sell',
  },
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
  const load = useCallback(
    async (url: string) => (await fetch(url)).json(),
    []
  );
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

/**
 * An automatic card carries no prefill — it is meant to open the finding
 * directly. Phase A has no proactive finding yet, so it asks the capability's
 * own question instead of asserting one.
 */
const defaultAsk = (card: { capabilityKey: string }) =>
  card.capabilityKey === 'performance_recos'
    ? 'What did our recent posts do, and what should we change?'
    : '';

// StarterCards only surfaces three capabilities; everything else still needs a
// trigger somewhere, hence the "More capabilities" row below it. Filtered
// against the starter cards' own capabilityKey rather than a hardcoded list,
// so a future starter card automatically removes its capability from here.
const STARTER_CAPABILITY_KEYS = new Set(
  STARTER_CARDS.map((card) => card.capabilityKey)
);

export const AiOrchestraComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const user = useUser();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
  const [tab, setTab] = useState<'use' | 'admin'>('use');

  const load = useCallback(
    async (url: string) => (await fetch(url)).json(),
    []
  );
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

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState('');
  // Which capability the next send should run, if it came from a starter card.
  // Cleared when an existing thread is opened, so continuing a conversation is
  // free-text rather than silently re-running a capability.
  const [capabilityKey, setCapabilityKey] = useState<string | null>(null);
  const { data: library, mutate: libraryMutate } = useLibrary();

  const [showMoreCapabilities, setShowMoreCapabilities] = useState(false);
  const moreCapabilities = assistantCapabilities().filter(
    (spec) => !STARTER_CAPABILITY_KEYS.has(spec.key)
  );

  const openThread = useCallback((id: string) => {
    setActiveThreadId(id);
    setCapabilityKey(null);
    setPrefill('');
  }, []);

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
        <div className="flex-1 min-h-0 flex gap-[16px]">
          <div className="flex-1 min-w-0 flex flex-col gap-[14px]">
            {!activeThreadId && (
              <>
                <StarterCards
                  onAssisted={(card) => {
                    setPrefill(card.prefill);
                    setCapabilityKey(card.capabilityKey);
                  }}
                  onAutomatic={(card) => {
                    setPrefill(card.prefill || defaultAsk(card));
                    setCapabilityKey(card.capabilityKey);
                  }}
                />
                <div className="flex flex-col gap-[10px]">
                  <button
                    type="button"
                    onClick={() => setShowMoreCapabilities((s) => !s)}
                    className="self-start text-[11.5px] rounded-[999px] px-[11px] py-[6px] glass-surface hover:brightness-110 transition-all"
                  >
                    {showMoreCapabilities
                      ? t('fewer_capabilities', 'Fewer capabilities')
                      : t('more_capabilities', 'More capabilities')}
                  </button>
                  {showMoreCapabilities && (
                    <div className="flex flex-wrap gap-[8px]">
                      {moreCapabilities.map((spec) => (
                        <button
                          key={spec.key}
                          type="button"
                          onClick={() => {
                            setPrefill(spec.inputHint);
                            setCapabilityKey(spec.key);
                          }}
                          className="text-[11.5px] rounded-[999px] px-[11px] py-[6px] glass-surface hover:brightness-110 transition-all flex items-center gap-[6px]"
                        >
                          <span>{spec.icon}</span>
                          <span>{t(`capability_${spec.key}`, spec.name)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="flex items-center gap-[10px]">
              {(clients || []).length > 0 && (
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  aria-label={t('client', 'Client')}
                  className="bg-transparent text-[11.5px] text-textItemBlur outline-none cursor-pointer hover:text-textItemFocused transition-colors"
                >
                  <option value="">{t('all_clients', 'All clients')}</option>
                  {(clients || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={timeframeDays}
                onChange={(e) => setTimeframeDays(Number(e.target.value))}
                aria-label={t('timeframe', 'Timeframe')}
                className="bg-transparent text-[11.5px] text-textItemBlur outline-none cursor-pointer hover:text-textItemFocused transition-colors"
              >
                {[7, 30, 90].map((days) => (
                  <option key={days} value={days}>
                    {t('last_n_days', 'last')} {days} {t('days', 'days')}
                  </option>
                ))}
              </select>
            </div>
            <ThreadView
              threadId={activeThreadId}
              prefill={prefill}
              customerId={customerId}
              capabilityKey={capabilityKey}
              timeframeDays={timeframeDays}
              onStarted={setActiveThreadId}
              onChanged={() => libraryMutate()}
            />
          </div>
          <FolderSidebar
            folders={library?.folders || []}
            threads={library?.threads || []}
            activeThreadId={activeThreadId}
            onSelect={openThread}
            onChanged={() => libraryMutate()}
          />
        </div>
      )}
    </div>
  );
};

export default AiOrchestraComponent;
