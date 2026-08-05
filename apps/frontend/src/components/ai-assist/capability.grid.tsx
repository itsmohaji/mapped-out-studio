'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  CAPABILITIES,
  CapabilitySpec,
  RenderedSection,
} from '@gitroom/helpers/utils/ai.capabilities';
import { asArray } from '@gitroom/helpers/utils/as.array';
import { AiAnswer } from '@gitroom/frontend/components/ai-assist/answer';
import { AsyncBoundary } from '@gitroom/frontend/components/ui/async.boundary';

/**
 * The AI Assistant, as a marketing copilot rather than a developer console.
 *
 * Every card is drawn from the shared capability registry, so the icon, the
 * blurb and the button verb live next to the brief the model is given and the
 * shape of the answer it must return. Adding a capability is one registry entry
 * — there is no second list here to keep in step.
 *
 * Running one takes over the view instead of expanding a card in place: an
 * answer deserves the full width, and a grid that reflows under you while you
 * are reading is the thing that made the old page feel like tooling.
 */

interface ServerCapability {
  key: string;
  name: string;
  kind: string;
  available: boolean;
  unavailableMessage?: string;
}

interface Coverage {
  channelsConnected: number;
  channelsReporting: number;
  postsSampled: number;
  timeframeDays: number;
  hasBrief: boolean;
}

const Card: FC<{
  spec: CapabilitySpec;
  available: boolean;
  reason?: string;
  onOpen: () => void;
}> = ({ spec, available, reason, onOpen }) => (
  <button
    type="button"
    disabled={!available}
    onClick={onOpen}
    className={clsx(
      'group glass-surface rounded-[18px] p-[18px] text-start flex flex-col gap-[10px]',
      'transition-all duration-200',
      available
        ? 'hover:-translate-y-[2px] hover:brightness-[1.06] active:translate-y-0 cursor-pointer'
        : 'opacity-55 cursor-default'
    )}
  >
    <div className="flex items-start gap-[11px]">
      <div className="w-[38px] h-[38px] rounded-[12px] bg-[var(--glass-2)] flex items-center justify-center text-[19px] shrink-0">
        {spec.icon}
      </div>
      <div className="flex-1 min-w-0 pt-[2px]">
        <div className="text-[14px] font-[600] leading-tight">{spec.name}</div>
      </div>
    </div>

    <div className="text-[12.5px] leading-[1.55] text-textItemBlur flex-1">
      {available ? spec.blurb : reason || spec.blurb}
    </div>

    <div
      className={clsx(
        'text-[12px] font-[600] flex items-center gap-[5px] mt-[2px]',
        available ? 'text-btnPrimary' : 'text-textItemBlur'
      )}
    >
      {available ? spec.action : 'Coming soon'}
      {available && (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-200 group-hover:translate-x-[3px] rtl:rotate-180"
        >
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      )}
    </div>
  </button>
);

const Runner: FC<{
  spec: CapabilitySpec;
  customerId: string;
  timeframeDays: number;
  onBack: () => void;
  onDone: () => void;
}> = ({ spec, customerId, timeframeDays, onBack, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sections, setSections] = useState<RenderedSection[] | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setSections(null);
    try {
      const res = await (
        await fetch('/ai-orchestra/run', {
          method: 'POST',
          body: JSON.stringify({
            capabilityKey: spec.key,
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
      // Sections are parsed server-side. `output` is the raw draft and is the
      // fallback for an older API that predates the contract.
      const parsed = asArray<RenderedSection>(res.sections);
      setSections(
        parsed.length
          ? parsed
          : [{ key: 'answer', title: spec.name, kind: 'summary', text: res.output || '' }]
      );
      setCoverage(res.coverage || null);
      onDone();
    } finally {
      setBusy(false);
    }
  }, [busy, input, spec.key, spec.name, customerId, timeframeDays, onDone, t]);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center gap-[11px]">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('back', 'Back')}
          className="w-[34px] h-[34px] rounded-[11px] glass-surface flex items-center justify-center text-textItemBlur hover:text-textItemFocused transition-colors shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="rtl:rotate-180">
            <path d="M19 12H6M11 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="w-[34px] h-[34px] rounded-[11px] bg-[var(--glass-2)] flex items-center justify-center text-[17px] shrink-0">
          {spec.icon}
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-[600] leading-tight">{spec.name}</div>
          <div className="text-[11.5px] text-textItemBlur truncate">{spec.blurb}</div>
        </div>
      </div>

      <div className="glass-surface rounded-[16px] p-[14px] flex flex-col gap-[10px]">
        <textarea
          autoFocus
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter runs. Plain Enter must stay a newline — this is a
            // brief, not a chat message.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              run();
            }
          }}
          placeholder={spec.inputHint}
          className="w-full bg-newBgLineColor border border-newTableBorder rounded-[12px] px-[12px] py-[10px] text-[13px] leading-[1.55] outline-none focus:border-btnPrimary resize-none transition-colors"
        />
        <div className="flex items-center gap-[10px]">
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="h-[36px] px-[16px] rounded-[12px] bg-btnPrimary text-white text-[12.5px] font-[600] disabled:opacity-45 hover:brightness-110 transition"
          >
            {busy ? t('working', 'Working…') : spec.action}
          </button>
          <span className="text-[11px] text-textItemBlur">
            {t('ai_draft_note', 'Produces a draft for you to review. Nothing is scheduled or published.')}
          </span>
        </div>
      </div>

      {busy && (
        <div className="glass-surface rounded-[16px] p-[18px] flex flex-col gap-[10px]">
          {/* Skeleton rather than a spinner: it sets the expectation that prose
              is coming, and stops the panel height jumping when it arrives. */}
          {[92, 78, 85, 60].map((w, i) => (
            <div
              key={i}
              className="h-[11px] rounded-full bg-[var(--glass-2)] animate-pulse"
              style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
      )}

      {!busy && sections && (
        <div className="glass-surface rounded-[16px] p-[18px] flex flex-col gap-[16px]">
          <AiAnswer sections={sections} />
          {coverage && (
            // What the answer rested on, stated before it is trusted. A draft
            // from two of five reporting channels is not the whole account.
            <div className="text-[11px] text-textItemBlur border-t border-[var(--gline)] pt-[11px]">
              {t('based_on', 'Based on')} {coverage.channelsReporting}/
              {coverage.channelsConnected} {t('channels_reporting', 'channels reporting')} ·{' '}
              {coverage.postsSampled} {t('posts', 'posts')} · {coverage.timeframeDays}{' '}
              {t('days', 'days')}
              {coverage.hasBrief ? ` · ${t('brand_brief_on_file', 'brand brief on file')}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const CapabilityGrid: FC<{
  customerId: string;
  timeframeDays: number;
}> = ({ customerId, timeframeDays }) => {
  const t = useT();
  const fetch = useFetch();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  const { data, error, isLoading, mutate } = useSWR<{
    capabilities: ServerCapability[];
  }>('/ai-orchestra/capabilities', load, { revalidateOnFocus: false });

  // The registry decides the order and the presentation; the server decides
  // what this workspace may actually run. A capability the server does not
  // know about is not shown at all.
  const cards = useMemo(() => {
    const byKey = new Map(
      asArray<ServerCapability>(data?.capabilities).map((c) => [c.key, c])
    );
    return CAPABILITIES.filter((spec) => byKey.has(spec.key)).map((spec) => ({
      spec,
      server: byKey.get(spec.key)!,
    }));
  }, [data?.capabilities]);

  const open = cards.find((c) => c.spec.key === openKey);

  if (open) {
    return (
      <Runner
        spec={open.spec}
        customerId={customerId}
        timeframeDays={timeframeDays}
        onBack={() => setOpenKey(null)}
        onDone={mutate}
      />
    );
  }

  return (
    <AsyncBoundary
      isLoading={isLoading}
      error={error}
      data={data}
      onRetry={() => mutate()}
    >
      {!cards.length ? (
        <div className="glass-surface rounded-[18px] px-[18px] py-[46px] text-center">
          <div className="text-[14px] font-[600]">
            {t('no_capabilities', 'No capabilities yet')}
          </div>
          <div className="text-[12.5px] text-textItemBlur mt-[5px]">
            {t('no_capabilities_help', 'An administrator enables these once they are ready.')}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[13px]">
          {cards.map(({ spec, server }) => (
            <Card
              key={spec.key}
              spec={spec}
              available={server.available}
              reason={server.unavailableMessage}
              onOpen={() => setOpenKey(spec.key)}
            />
          ))}
        </div>
      )}
    </AsyncBoundary>
  );
};
