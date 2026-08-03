'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { Glass, PageHeader, EmptyState, Skeleton } from '../automation/automation.ui';
import { Lead, LeadProfile, STAGES } from './lead.profile';

/**
 * Leads — the lightweight CRM behind the automation engine.
 *
 * Pipeline is the default view because a lead's stage is the thing people
 * actually change; the list exists for when you need to search rather than
 * triage.
 */

const parse = (v: any, f: any) => {
  try {
    return (typeof v === 'string' ? JSON.parse(v) : v) ?? f;
  } catch {
    return f;
  }
};

const LeadCard: FC<{
  lead: Lead;
  onOpen: () => void;
  onDragStart: () => void;
}> = ({ lead, onOpen, onDragStart }) => (
  <div
    draggable
    onDragStart={onDragStart}
    onClick={onOpen}
    className="rounded-[11px] border border-white/[0.07] bg-white/[0.03] p-[11px] cursor-pointer hover:border-white/[0.18] hover:bg-white/[0.055] transition-all duration-150 active:cursor-grabbing"
  >
    <div className="flex items-start gap-[9px]">
      {lead.sourcePostThumbnail ? (
        <div className="w-[32px] h-[32px] rounded-[8px] overflow-hidden shrink-0">
          <SafeImage
            src={lead.sourcePostThumbnail}
            alt=""
            width={32}
            height={32}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-[32px] h-[32px] rounded-[8px] bg-white/[0.06] flex items-center justify-center text-[13px] shrink-0">
          👤
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-[600] truncate">
          {lead.fullName || lead.handle || 'Unnamed'}
        </div>
        <div className="text-[11px] text-textItemBlur truncate mt-[1px]">
          {lead.email || (lead.handle ? `@${lead.handle}` : '—')}
        </div>
      </div>
    </div>

    {/* Attribution is the reason this module exists — surface it on the card,
        not three clicks deep. */}
    {!!lead.sourceKeyword && (
      <div className="mt-[8px] flex flex-wrap gap-[4px]">
        <span className="text-[10px] font-[600] px-[6px] py-[2px] rounded-[5px] bg-btnPrimary/12 text-btnPrimary">
          {lead.sourceKeyword}
        </span>
        {!!lead.sourceWorkflowName && (
          <span className="text-[10px] px-[6px] py-[2px] rounded-[5px] bg-white/[0.06] text-textItemBlur truncate max-w-[130px]">
            {lead.sourceWorkflowName}
          </span>
        )}
      </div>
    )}

    <div className="text-[10.5px] text-textItemBlur mt-[8px]">
      {dayjs(lead.createdAt).format('D MMM')}
    </div>
  </div>
);

export const LeadsComponent: FC = () => {
  const fetchApi = useFetch();
  const toast = useToaster();

  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    customer: 'all',
    platform: '',
    workflow: '',
    post: '',
    assignee: '',
    search: '',
  });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v !== 'all') p.set(k, v);
    });
    return p.toString();
  }, [filters]);

  /**
   * Leads arrive from OUTSIDE the browser: an Instagram comment fires a webhook,
   * the automation engine runs server-side and writes the lead. An open Leads
   * page has no way to hear about that, so with SWR's defaults it sat stale
   * until the user reloaded.
   *
   * Polling rather than a push channel is a deliberate trade. A real SSE
   * endpoint is the better architecture and is the follow-up, but it needs
   * per-tab connection handling and adds a persistent connection per open tab
   * to a VPS that is already the documented bottleneck. A 15s poll on one
   * screen delivers the actual requirement — a lead shows up on its own,
   * within seconds — at a fraction of the risk.
   */
  const { data: leads, isLoading, mutate } = useSWR<Lead[]>(
    `/automation/leads${query ? `?${query}` : ''}`,
    async (url: string) => (await fetchApi(url)).json(),
    {
      refreshInterval: 15000,
      // Coming back to the tab should never show a stale board.
      revalidateOnFocus: true,
      // Nothing is gained by polling a screen nobody is looking at, and on an
      // iPad a background timer is battery the user notices.
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      keepPreviousData: true,
    }
  );

  const { data: customers } = useSWR<{ id: string; name: string }[]>(
    '/integrations/customers',
    async (url: string) => (await fetchApi(url)).json()
  );

  const { data: workflows } = useSWR<{ id: string; name: string }[]>(
    '/automation',
    async (url: string) => (await fetchApi(url)).json()
  );

  const byStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    STAGES.forEach((s) => (map[s.key] = []));
    (leads ?? []).forEach((l) => {
      (map[l.status] ||= []).push(l);
    });
    return map;
  }, [leads]);

  const moveTo = useCallback(
    async (leadId: string, status: string) => {
      // Optimistic: dragging a card that snaps back for a second feels broken
      // even when the write succeeds.
      await mutate(
        (cur) => (cur ?? []).map((l) => (l.id === leadId ? { ...l, status } : l)),
        { revalidate: false }
      );
      try {
        await fetchApi(`/automation/leads/${leadId}`, {
          method: 'PUT',
          body: JSON.stringify({ status }),
        });
      } catch {
        toast.show('Could not move that lead', 'warning');
      } finally {
        mutate();
      }
    },
    [fetchApi, mutate, toast]
  );

  const platforms = useMemo(
    () => Array.from(new Set((leads ?? []).map((l) => l.sourcePlatform).filter(Boolean))),
    [leads]
  );

  return (
    <div className="w-full min-w-0 px-[12px] py-[16px] sm:px-[18px] lg:px-[26px] lg:py-[24px]">
      <div className="flex flex-col gap-[20px]">
        <PageHeader
          title="Leads"
          subtitle="Everyone your automations captured, and exactly which post produced them."
          right={
            <div className="flex items-center gap-[7px]">
              {(['pipeline', 'list'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={clsx(
                    'text-[12.5px] px-[13px] py-[7px] rounded-[9px] border transition-all duration-150 capitalize',
                    view === v
                      ? 'bg-btnPrimary/15 border-btnPrimary/40 text-btnPrimary'
                      : 'border-white/[0.09] text-textItemBlur hover:border-white/25'
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          }
        />

        <Glass className="p-[14px] flex flex-wrap gap-[9px] items-center">
          <input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search name, handle or email…"
            className="flex-1 basis-[220px] min-w-0 bg-black/20 border border-white/[0.09] rounded-[9px] px-[11px] py-[8px] text-[12.5px] outline-none focus:border-btnPrimary/50 transition-colors"
          />

          <select
            value={filters.customer}
            onChange={(e) => setFilters((f) => ({ ...f, customer: e.target.value }))}
            className="bg-black/20 border border-white/[0.09] rounded-[9px] px-[10px] py-[8px] text-[12.5px]"
          >
            <option value="all">All clients</option>
            {(customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={filters.workflow}
            onChange={(e) => setFilters((f) => ({ ...f, workflow: e.target.value }))}
            className="bg-black/20 border border-white/[0.09] rounded-[9px] px-[10px] py-[8px] text-[12.5px]"
          >
            <option value="">All automations</option>
            {(workflows ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <select
            value={filters.platform}
            onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value }))}
            className="bg-black/20 border border-white/[0.09] rounded-[9px] px-[10px] py-[8px] text-[12.5px]"
          >
            <option value="">All platforms</option>
            {platforms.map((p) => (
              <option key={p as string} value={p as string}>
                {p}
              </option>
            ))}
          </select>

          {(filters.search || filters.platform || filters.workflow || filters.customer !== 'all') && (
            <button
              onClick={() =>
                setFilters({
                  customer: 'all',
                  platform: '',
                  workflow: '',
                  post: '',
                  assignee: '',
                  search: '',
                })
              }
              className="text-[12px] text-textItemBlur hover:text-textColor px-[8px]"
            >
              Clear
            </button>
          )}
        </Glass>

        {isLoading && (
          <div className="grid gap-[12px] grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[220px]" />
            ))}
          </div>
        )}

        {!isLoading && !leads?.length && (
          <Glass className="p-[10px]">
            <EmptyState
              icon="🎯"
              title="No leads yet"
              body="When an automation runs a Create Lead step, the person lands here with the post, keyword and automation that produced them."
            />
          </Glass>
        )}

        {!isLoading && !!leads?.length && view === 'pipeline' && (
          <div className="flex gap-[12px] overflow-x-auto pb-[8px]">
            {STAGES.map((stage) => (
              <div
                key={stage.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHoverStage(stage.key);
                }}
                onDragLeave={() => setHoverStage((s) => (s === stage.key ? null : s))}
                onDrop={() => {
                  if (dragging) moveTo(dragging, stage.key);
                  setDragging(null);
                  setHoverStage(null);
                }}
                className={clsx(
                  'w-[240px] shrink-0 rounded-[14px] border p-[11px] flex flex-col gap-[9px] transition-colors',
                  hoverStage === stage.key
                    ? 'border-btnPrimary/50 bg-btnPrimary/[0.06]'
                    : 'border-white/[0.06] bg-white/[0.02]'
                )}
              >
                <div className="flex items-center gap-[7px] px-[3px]">
                  <span
                    className="w-[7px] h-[7px] rounded-full"
                    style={{ background: stage.accent }}
                  />
                  <span className="text-[12.5px] font-[600] flex-1">{stage.label}</span>
                  <span className="text-[11px] text-textItemBlur tabular-nums">
                    {byStage[stage.key]?.length ?? 0}
                  </span>
                </div>

                <div className="flex flex-col gap-[8px] min-h-[60px]">
                  {(byStage[stage.key] ?? []).map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onOpen={() => setOpenId(lead.id)}
                      onDragStart={() => setDragging(lead.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !!leads?.length && view === 'list' && (
          <div className="flex flex-col gap-[8px]">
            {leads.map((lead) => {
              const stage = STAGES.find((s) => s.key === lead.status);
              return (
                <Glass
                  key={lead.id}
                  hoverable
                  onClick={() => setOpenId(lead.id)}
                  className="px-[15px] py-[12px] flex items-center gap-[12px]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-[600] truncate">
                      {lead.fullName || lead.handle || 'Unnamed'}
                    </div>
                    <div className="text-[11.5px] text-textItemBlur truncate mt-[2px]">
                      {[
                        lead.email,
                        lead.sourceWorkflowName,
                        lead.sourceKeyword ? `“${lead.sourceKeyword}”` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <span
                    className="text-[10.5px] font-[600] px-[9px] py-[3px] rounded-full shrink-0"
                    style={{
                      background: `${stage?.accent ?? '#8b93a5'}22`,
                      color: stage?.accent ?? '#8b93a5',
                    }}
                  >
                    {stage?.label ?? lead.status}
                  </span>
                  <span className="text-[11px] text-textItemBlur shrink-0 hidden sm:block">
                    {dayjs(lead.createdAt).format('D MMM')}
                  </span>
                </Glass>
              );
            })}
          </div>
        )}
      </div>

      {!!openId && (
        <LeadProfile leadId={openId} onClose={() => setOpenId(null)} onSaved={() => mutate()} />
      )}
    </div>
  );
};
