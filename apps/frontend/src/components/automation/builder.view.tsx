'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { Glass, PageHeader, StatusPill } from './automation.ui';
import { KeywordBuilder, KeywordConfig, fromCondition, toCondition } from './keyword.builder';
import { PostPicker } from './post.picker';
import { ConversationPreview } from './conversation.preview';
import { STEP_META, StepCard, StepDraft } from './step.card';
import { AutomationAccount } from './accounts.view';

const uid = () => Math.random().toString(36).slice(2, 10);

const parse = (v: any, fallback: any) => {
  try {
    const p = typeof v === 'string' ? JSON.parse(v) : v;
    return p ?? fallback;
  } catch {
    return fallback;
  }
};

const PALETTE_ORDER = ['Message', 'Flow', 'Contact', 'Team', 'Advanced'];

const StatTile: FC<{ label: string; value: string | number; accent?: string }> = ({
  label,
  value,
  accent,
}) => (
  <div className="px-[16px] py-[14px]">
    <div
      className="text-[20px] font-[600] leading-none tabular-nums"
      style={accent ? { color: accent } : undefined}
    >
      {value}
    </div>
    <div className="text-[11px] text-textItemBlur mt-[6px] leading-tight">{label}</div>
  </div>
);

export const BuilderView: FC<{
  workflowId: string;
  account: AutomationAccount;
  onBack: () => void;
}> = ({ workflowId, account, onBack }) => {
  const fetchApi = useFetch();
  const toast = useToaster();

  const [saving, setSaving] = useState(false);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [keywords, setKeywords] = useState<KeywordConfig>({
    values: [],
    match: 'equals',
    ignoreCase: true,
    ignoreEmoji: true,
    ignoreSpaces: true,
  });
  const [scope, setScope] = useState<'all' | 'specific'>('all');
  const [postIds, setPostIds] = useState<string[]>([]);
  const [issues, setIssues] = useState<{ level: string; message: string }[]>([]);
  const [seeded, setSeeded] = useState('');
  const [showPalette, setShowPalette] = useState(false);

  const { data, mutate } = useSWR(`/automation/${workflowId}`, async (url: string) =>
    (await fetchApi(url)).json()
  );

  const { data: stats } = useSWR(
    `/automation/stats?workflow=${workflowId}`,
    async (url: string) => (await fetchApi(url)).json()
  );

  // Seed local editor state once the saved workflow arrives. Keyed on node
  // count + id so a save that changes the graph re-seeds, but typing does not.
  const seedKey = `${data?.id}:${data?.nodes?.length ?? 0}:${data?.updatedAt ?? ''}`;
  if (data?.id && seedKey !== seeded) {
    setSeeded(seedKey);
    setSteps(
      (data.nodes ?? []).map((n: any) => ({
        id: n.id,
        key: n.id,
        kind: n.kind,
        config: parse(n.config, {}),
      }))
    );
    setKeywords(fromCondition(parse(data.conditions, [])));
    const bound = (data.bindings ?? [])
      .map((b: any) => b.externalPostId || b.postId)
      .filter(Boolean);
    setPostIds(bound);
    setScope(bound.length ? 'specific' : 'all');
  }

  const messageIndexOf = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    steps.forEach((s) => {
      if (s.kind === 'send_dm' || s.kind === 'reply_comment') map.set(s.key, ++n);
    });
    return map;
  }, [steps]);

  const addStep = (kind: string) => {
    setSteps((s) => [...s, { key: uid(), kind, config: {} }]);
    setShowPalette(false);
  };

  const move = (i: number, dir: -1 | 1) =>
    setSteps((all) => {
      const next = [...all];
      const j = i + dir;
      if (j < 0 || j >= next.length) return all;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = useCallback(async () => {
    setSaving(true);
    try {
      // Ids must be stable across a save: a running conversation's cursor
      // points at a node id, and regenerating them would strand it mid-flow.
      const withIds = steps.map((s) => ({ ...s, id: s.id ?? s.key }));
      const nodes = withIds.map((s, i) => ({
        id: s.id,
        parentId: i === 0 ? null : withIds[i - 1].id,
        branchKey: null,
        kind: s.kind,
        config: s.config,
        position: i,
      }));

      await fetchApi(`/automation/${workflowId}`, {
        method: 'PUT',
        body: JSON.stringify({ conditions: toCondition(keywords) }),
      });
      await fetchApi(`/automation/${workflowId}/graph`, {
        method: 'PUT',
        body: JSON.stringify({ nodes }),
      });
      await fetchApi(`/automation/${workflowId}/bindings`, {
        method: 'PUT',
        body: JSON.stringify({
          externalPostIds: scope === 'specific' ? postIds : [],
        }),
      });

      const check = await (await fetchApi(`/automation/${workflowId}/validate`)).json();
      setIssues(check ?? []);
      await mutate();
      toast.show('Saved', 'success');
    } catch {
      toast.show('Could not save', 'warning');
    } finally {
      setSaving(false);
    }
  }, [steps, keywords, scope, postIds, workflowId, fetchApi, mutate, toast]);

  const toggleLive = useCallback(async () => {
    const next = data?.status === 'active' ? 'paused' : 'active';
    await save();
    const res = await (
      await fetchApi(`/automation/${workflowId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: next }),
      })
    ).json();

    if (res?.ok === false) {
      setIssues(res.issues ?? []);
      toast.show('Fix the errors before turning this on', 'warning');
      return;
    }
    await mutate();
    toast.show(next === 'active' ? 'Automation is live' : 'Automation paused', 'success');
  }, [data?.status, workflowId, fetchApi, mutate, toast, save]);

  const grouped = useMemo(() => {
    const out: Record<string, string[]> = {};
    Object.entries(STEP_META).forEach(([kind, meta]) => {
      (out[meta.group] ||= []).push(kind);
    });
    return out;
  }, []);

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  return (
    <div className="flex flex-col gap-[24px]">
      <PageHeader
        title={data?.name ?? 'Automation'}
        subtitle={`${account.name}${account.username ? ` · @${account.username}` : ''}`}
        back={onBack}
        backLabel="Automations"
        right={
          <div className="flex items-center gap-[10px]">
            <StatusPill status={data?.status ?? 'draft'} />
            <Button onClick={save} disabled={saving} secondary>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button onClick={toggleLive}>
              {data?.status === 'active' ? 'Pause' : 'Turn on'}
            </Button>
          </div>
        }
      />

      {(!!errors.length || !!warnings.length) && (
        <div className="flex flex-col gap-[8px]">
          {[...errors, ...warnings].map((i, n) => (
            <div
              key={n}
              className={clsx(
                'text-[12.5px] rounded-[11px] px-[14px] py-[11px] border leading-[1.5]',
                i.level === 'error'
                  ? 'border-[#e2685f]/35 bg-[#e2685f]/10 text-[#e2685f]'
                  : 'border-[#daa646]/35 bg-[#daa646]/10 text-[#daa646]'
              )}
            >
              {i.message}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-[16px] lg:gap-[20px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] items-start">
        <div className="flex flex-col gap-[16px] min-w-0">
          <PostPicker
            scope={scope}
            selectedPostIds={postIds}
            integrationId={account.integrationId}
            onScope={setScope}
            onToggle={(id) =>
              setPostIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]))
            }
          />

          <KeywordBuilder value={keywords} onChange={setKeywords} />

          <div className="flex flex-col">
            <div className="text-[13px] font-[600] mb-[12px] flex items-center gap-[8px]">
              <span className="w-[22px] h-[22px] rounded-[7px] bg-btnPrimary/15 flex items-center justify-center text-[11px]">
                ⚡
              </span>
              Then do this
            </div>

            {steps.map((s, i) => (
              <StepCard
                key={s.key}
                step={s}
                index={i}
                messageIndex={messageIndexOf.get(s.key) ?? 0}
                isLast={i === steps.length - 1}
                onChange={(next) => setSteps((all) => all.map((x, n) => (n === i ? next : x)))}
                onRemove={() => setSteps((all) => all.filter((_, n) => n !== i))}
                onMove={(dir) => move(i, dir)}
              />
            ))}

            {!steps.length && (
              <Glass className="p-[26px] text-center">
                <div className="text-[22px] mb-[8px] opacity-70">✨</div>
                <div className="text-[13.5px] font-[600]">No steps yet</div>
                <p className="text-[12px] text-textItemBlur mt-[5px]">
                  Start with a message — that is what most automations do first.
                </p>
              </Glass>
            )}

            <div className="relative mt-[14px]">
              <button
                type="button"
                onClick={() => setShowPalette((s) => !s)}
                className={clsx(
                  'w-full py-[13px] rounded-[13px] border border-dashed text-[13px] font-[500] transition-all duration-150',
                  showPalette
                    ? 'border-btnPrimary/50 text-btnPrimary bg-btnPrimary/[0.06]'
                    : 'border-white/[0.14] text-textItemBlur hover:border-btnPrimary/40 hover:text-btnPrimary'
                )}
              >
                + Add a step
              </button>

              {showPalette && (
                <Glass className="mt-[10px] p-[16px] flex flex-col gap-[15px]">
                  {PALETTE_ORDER.filter((g) => grouped[g]?.length).map((group) => (
                    <div key={group}>
                      <div className="text-[10.5px] uppercase tracking-[0.06em] text-textItemBlur font-[600] mb-[8px]">
                        {group}
                      </div>
                      <div className="grid gap-[7px] grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,152px),1fr))]">
                        {grouped[group].map((kind) => {
                          const m = STEP_META[kind];
                          return (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => addStep(kind)}
                              className="flex items-center gap-[9px] text-left px-[11px] py-[9px] rounded-[10px] border border-white/[0.07] hover:border-white/[0.2] hover:bg-white/[0.04] transition-all duration-150"
                            >
                              <span
                                className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center text-[13px] shrink-0"
                                style={{ background: `${m.accent}20` }}
                              >
                                {m.icon}
                              </span>
                              <span className="text-[12px] font-[500] leading-tight">{m.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </Glass>
              )}
            </div>
          </div>

          <Glass className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-white/[0.06] overflow-hidden">
            <StatTile label="Triggered" value={stats?.triggered ?? 0} />
            <StatTile label="Conversations" value={stats?.conversations ?? 0} />
            <StatTile label="Replied" value={stats?.replied ?? 0} accent="#47b985" />
            <StatTile label="Leads" value={stats?.leads ?? 0} accent="#47b985" />
            <StatTile label="Reply rate" value={`${stats?.replyRate ?? 0}%`} />
            <StatTile label="Completion" value={`${stats?.completionRate ?? 0}%`} />
          </Glass>
        </div>

        <div className="min-w-0">
          <ConversationPreview
            steps={steps.map((s) => ({ kind: s.kind, config: s.config }))}
            keywords={keywords.values}
            accountName={account.name}
          />
        </div>
      </div>
    </div>
  );
};
