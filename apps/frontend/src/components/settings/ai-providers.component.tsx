'use client';

import React, { FC, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';

/**
 * AI Providers — platform owner only.
 *
 * Clients never reach this screen and never learn which provider served their
 * request; they see credits. Keys are shown masked and are never returned in
 * full by the API, so this component could not display one even if it tried.
 */

interface Provider {
  key: string;
  label: string;
  note: string;
  consoleUrl: string;
  capabilities: string[];
  defaultModels: string[];
  requiresEndpoint: boolean;
  requiresOrgId: boolean;
  configured: boolean;
  enabled: boolean;
  priority: number;
  hasKey: boolean;
  maskedKey: string | null;
  endpoint: string | null;
  orgId: string | null;
  models: string[];
  health: 'unknown' | 'ok' | 'error';
  healthMessage: string | null;
  healthAt: string | null;
  rpmLimit: number | null;
  dailyTokens: number | null;
  usage: { tokens: number; requests: number; costUsd: number };
}

interface RouteRow {
  task: string;
  description: string;
  needs: string;
  provider: string | null;
  model: string | null;
  reason: string;
}

const HEALTH: Record<string, { label: string; cls: string; dot: string }> = {
  ok: { label: 'Connected', cls: 'text-[#47b985]', dot: 'bg-[#47b985]' },
  error: { label: 'Failing', cls: 'text-[#e2685f]', dot: 'bg-[#e2685f]' },
  unknown: { label: 'Untested', cls: 'text-textItemBlur', dot: 'bg-[#8b93a5]' },
};

const ProviderRow: FC<{ p: Provider; onChanged: (list: Provider[]) => void }> = ({
  p,
  onChanged,
}) => {
  const fetchApi = useFetch();
  const toast = useToaster();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState('');
  const [endpoint, setEndpoint] = useState(p.endpoint ?? '');
  const [orgId, setOrgId] = useState(p.orgId ?? '');
  const [models, setModels] = useState((p.models ?? []).join(', '));
  const [priority, setPriority] = useState(p.priority);

  const save = async (extra: Record<string, any> = {}) => {
    setBusy(true);
    try {
      const list = await (
        await fetchApi(`/ai-providers/${p.key}`, {
          method: 'PUT',
          body: JSON.stringify({
            priority,
            endpoint: endpoint || null,
            orgId: orgId || null,
            models: models
              .split(',')
              .map((m) => m.trim())
              .filter(Boolean),
            // Blank means "keep the stored key" — the API treats it that way,
            // so a save never silently wipes a working key.
            ...(key.trim() ? { apiKey: key.trim() } : {}),
            ...extra,
          }),
        })
      ).json();
      setKey('');
      onChanged(list);
      toast.show('Saved', 'success');
    } catch {
      toast.show('Could not save', 'warning');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const res = await (
        await fetchApi(`/ai-providers/${p.key}/test`, {
          method: 'POST',
          // Test the typed key before storing it, so a bad one never lands.
          body: JSON.stringify(key.trim() ? { apiKey: key.trim() } : {}),
        })
      ).json();
      toast.show(res.message, res.ok ? 'success' : 'warning');
      const list = await (await fetchApi('/ai-providers')).json();
      onChanged(list);
    } finally {
      setBusy(false);
    }
  };

  const h = HEALTH[p.health] ?? HEALTH.unknown;

  return (
    <div className="rounded-[14px] border border-customColor6 bg-customColor2 overflow-hidden">
      <div className="flex items-center gap-[12px] px-[16px] py-[13px]">
        <button
          onClick={() => save({ enabled: !p.enabled })}
          disabled={busy}
          className={clsx(
            'w-[38px] h-[21px] rounded-full transition-colors shrink-0 relative',
            p.enabled ? 'bg-[#47b985]' : 'bg-white/[0.12]'
          )}
          aria-label={p.enabled ? 'Disable' : 'Enable'}
        >
          <span
            className={clsx(
              'absolute top-[2px] w-[17px] h-[17px] rounded-full bg-white transition-all',
              p.enabled ? 'left-[19px]' : 'left-[2px]'
            )}
          />
        </button>

        <button onClick={() => setOpen((s) => !s)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-[8px]">
            <span className="text-[13.5px] font-[600]">{p.label}</span>
            <span className={clsx('flex items-center gap-[5px] text-[11px]', h.cls)}>
              <span className={clsx('w-[6px] h-[6px] rounded-full', h.dot)} />
              {h.label}
            </span>
            {p.hasKey && (
              <span className="text-[11px] font-mono text-textItemBlur">{p.maskedKey}</span>
            )}
          </div>
          <div className="text-[11.5px] text-textItemBlur mt-[3px] truncate">{p.note}</div>
        </button>

        <span className="text-[11px] text-textItemBlur shrink-0 hidden sm:block">
          Priority {p.priority}
        </span>
        <span className="text-[12px] text-textItemBlur shrink-0">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="px-[16px] pb-[16px] pt-[4px] border-t border-customColor6 flex flex-col gap-[13px]">
          <div className="flex flex-wrap gap-[5px]">
            {p.capabilities.map((c) => (
              <span
                key={c}
                className="text-[10.5px] px-[7px] py-[2px] rounded-[5px] bg-white/[0.06] border border-white/[0.08]"
              >
                {c}
              </span>
            ))}
          </div>

          <div className="grid gap-[12px] grid-cols-1 sm:grid-cols-2">
            <label className="flex flex-col gap-[5px]">
              <span className="text-[11px] uppercase tracking-[0.05em] text-textItemBlur font-[600]">
                API key {p.hasKey ? '(leave blank to keep)' : ''}
              </span>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={p.hasKey ? p.maskedKey ?? '••••' : 'Paste the key'}
                autoComplete="new-password"
                className="bg-black/20 border border-customColor6 rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-forth transition-colors font-mono"
              />
            </label>

            <label className="flex flex-col gap-[5px]">
              <span className="text-[11px] uppercase tracking-[0.05em] text-textItemBlur font-[600]">
                Endpoint {p.requiresEndpoint ? '(required)' : ''}
              </span>
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://…"
                className="bg-black/20 border border-customColor6 rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-forth transition-colors font-mono"
              />
            </label>

            {p.requiresOrgId && (
              <label className="flex flex-col gap-[5px]">
                <span className="text-[11px] uppercase tracking-[0.05em] text-textItemBlur font-[600]">
                  Organization ID
                </span>
                <input
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  placeholder="org-…"
                  className="bg-black/20 border border-customColor6 rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-forth transition-colors font-mono"
                />
              </label>
            )}

            <label className="flex flex-col gap-[5px]">
              <span className="text-[11px] uppercase tracking-[0.05em] text-textItemBlur font-[600]">
                Models (comma separated)
              </span>
              <input
                value={models}
                onChange={(e) => setModels(e.target.value)}
                placeholder={p.defaultModels.join(', ') || 'model-name'}
                className="bg-black/20 border border-customColor6 rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-forth transition-colors font-mono"
              />
            </label>

            <label className="flex flex-col gap-[5px]">
              <span className="text-[11px] uppercase tracking-[0.05em] text-textItemBlur font-[600]">
                Priority (lower runs first)
              </span>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="bg-black/20 border border-customColor6 rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-forth transition-colors"
              />
            </label>
          </div>

          {!!p.healthMessage && (
            <div
              className={clsx(
                'text-[11.5px] rounded-[9px] px-[11px] py-[8px] border leading-[1.5]',
                p.health === 'ok'
                  ? 'border-[#47b985]/30 bg-[#47b985]/[0.08] text-[#47b985]'
                  : 'border-[#e2685f]/30 bg-[#e2685f]/[0.08] text-[#e2685f]'
              )}
            >
              {p.healthMessage}
              {!!p.healthAt && (
                <span className="text-textItemBlur">
                  {' '}
                  · {dayjs(p.healthAt).format('D MMM HH:mm')}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-[9px]">
            <Button onClick={() => save()} disabled={busy}>
              {busy ? 'Working…' : 'Save'}
            </Button>
            <Button onClick={test} disabled={busy} secondary>
              Test connection
            </Button>
            {p.hasKey && (
              <button
                onClick={() => save({ clearKey: true })}
                disabled={busy}
                className="text-[12px] text-textItemBlur hover:text-[#e2685f] transition-colors"
              >
                Remove key
              </button>
            )}
            {!!p.consoleUrl && (
              <a
                href={p.consoleUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[12px] text-forth hover:underline ml-auto"
              >
                Get a key ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const AiProvidersComponent: FC = () => {
  const fetchApi = useFetch();

  const { data: providers, mutate } = useSWR<Provider[]>('/ai-providers', async (url: string) =>
    (await fetchApi(url)).json()
  );

  const { data: routing } = useSWR<RouteRow[]>('/ai-providers/routing', async (url: string) =>
    (await fetchApi(url)).json()
  );

  const active = (providers ?? []).filter((p) => p.enabled && p.hasKey).length;

  return (
    <div className="flex flex-col gap-[20px]">
      <div>
        <div className="text-[16px] font-[600]">AI Providers</div>
        <p className="text-[12.5px] text-textItemBlur mt-[4px] leading-[1.55] max-w-[620px]">
          Platform owner only. Clients never see providers or keys — they see credits. Enable the
          providers you have accounts with; the router picks one per task.
        </p>
      </div>

      {active === 0 && (
        <div className="text-[12.5px] rounded-[11px] px-[14px] py-[11px] border border-[#daa646]/35 bg-[#daa646]/10 text-[#daa646]">
          No provider is enabled with a key yet, so every AI feature is inactive. Enable one below.
        </div>
      )}

      <div className="flex flex-col gap-[9px]">
        {(providers ?? []).map((p) => (
          <ProviderRow key={p.key} p={p} onChanged={(list) => mutate(list, { revalidate: false })} />
        ))}
      </div>

      {/* The routing table is the whole reason a hidden router is acceptable:
          the owner can always see exactly which provider each task will use. */}
      <div className="flex flex-col gap-[9px]">
        <div className="text-[13.5px] font-[600]">Routing</div>
        <p className="text-[12px] text-textItemBlur">
          What each task will use right now, given what is enabled above.
        </p>
        <div className="rounded-[14px] border border-customColor6 bg-customColor2 overflow-hidden">
          {(routing ?? []).map((r) => (
            <div
              key={r.task}
              className="flex flex-wrap items-center gap-[10px] px-[15px] py-[11px] border-b border-customColor6 last:border-b-0"
            >
              <div className="flex-1 min-w-[180px]">
                <div className="text-[12.5px] font-[500] capitalize">
                  {r.task.replace(/_/g, ' ')}
                </div>
                <div className="text-[11px] text-textItemBlur mt-[2px]">{r.description}</div>
              </div>
              <div className="text-right min-w-[150px]">
                {r.provider ? (
                  <>
                    <div className="text-[12.5px] font-[600]">{r.provider}</div>
                    <div className="text-[11px] text-textItemBlur font-mono">{r.model ?? '—'}</div>
                  </>
                ) : (
                  <div className="text-[11.5px] text-[#daa646]">{r.reason}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
