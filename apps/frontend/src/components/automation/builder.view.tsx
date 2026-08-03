'use client';

import React, { FC, useCallback, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import {
  Block,
  collapseNodes,
  expandBlocks,
} from '@gitroom/nestjs-libraries/automation/automation.blockgraph';
import { BlockKind } from '@gitroom/nestjs-libraries/automation/automation.blocks';
import { Glass, PageHeader, StatusPill } from './automation.ui';
import { KeywordBuilder, KeywordConfig, fromCondition, toCondition } from './keyword.builder';
import { PostPicker } from './post.picker';
import { ConversationPreview } from './conversation.preview';
import { BlockCanvas } from './block.canvas';
import { BlockInspector } from './block.inspector';
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

const StatTile: FC<{ label: string; value: string | number; accent?: string }> = ({
  label,
  value,
  accent,
}) => (
  <div className="px-[14px] py-[12px]">
    <div
      className="text-[18px] font-[600] leading-none tabular-nums"
      style={accent ? { color: accent } : undefined}
    >
      {value}
    </div>
    <div className="text-[10.5px] text-textItemBlur mt-[5px] leading-tight">{label}</div>
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
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(true);
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

  // An EDITOR must never have the document swapped under the user. SWR
  // revalidates on focus by default, which on an iPad means every app switch
  // refetched the workflow and re-seeded the canvas — silently discarding any
  // block added since the last save. Reloads happen explicitly, via mutate().
  const { data, mutate } = useSWR(
    `/automation/${workflowId}`,
    async (url: string) => (await fetchApi(url)).json(),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    }
  );

  // True from the first local edit until a save completes. While it is set, a
  // server payload is NEVER allowed to overwrite the canvas.
  const dirty = useRef(false);
  const markDirty = useCallback(() => {
    dirty.current = true;
  }, []);

  const { data: stats } = useSWR(
    `/automation/stats?workflow=${workflowId}`,
    async (url: string) => (await fetchApi(url)).json()
  );

  // Seed once the saved workflow arrives. Nodes collapse back into cards; a
  // workflow saved before blocks existed still reopens as editable steps.
  const seedKey = `${data?.id}:${data?.nodes?.length ?? 0}:${data?.updatedAt ?? ''}`;
  // `!dirty.current` is the load-bearing part. Re-seeding on any change of
  // updatedAt is what made edits vanish: a save bumps updatedAt, and so does
  // any other refetch, so an in-flight response could land on top of work the
  // user had not saved yet.
  if (data?.id && seedKey !== seeded && !dirty.current) {
    setSeeded(seedKey);
    setBlocks(
      collapseNodes(
        (data.nodes ?? []).map((n: any) => ({
          id: n.id,
          parentId: n.parentId,
          branchKey: n.branchKey,
          kind: n.kind,
          config: parse(n.config, {}),
          position: n.position,
        }))
      )
    );
    setKeywords(fromCondition(parse(data.conditions, [])));
    const bound = (data.bindings ?? [])
      .map((b: any) => b.externalPostId || b.postId)
      .filter(Boolean);
    setPostIds(bound);
    setScope(bound.length ? 'specific' : 'all');
  }

  const selected = useMemo(
    () => blocks.find((b) => b.id === selectedId) ?? null,
    [blocks, selectedId]
  );

  const addBlock = (kind: BlockKind, atIndex: number) => {
    markDirty();
    const block: Block = { id: uid(), kind, config: {} };
    setBlocks((all) => [...all.slice(0, atIndex), block, ...all.slice(atIndex)]);
    setSelectedId(block.id);
    setTriggerOpen(false);
  };

  const move = (i: number, dir: -1 | 1) => {
    markDirty();
    return setBlocks((all) => {
      const next = [...all];
      const j = i + dir;
      if (j < 0 || j >= next.length) return all;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      // Blocks become engine nodes here. Ids are derived from the block, so a
      // running conversation's cursor survives an edit.
      const nodes = expandBlocks(blocks);

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
        body: JSON.stringify({ externalPostIds: scope === 'specific' ? postIds : [] }),
      });

      const check = await (await fetchApi(`/automation/${workflowId}/validate`)).json();
      setIssues(check ?? []);
      // Cleared only after the writes succeeded. On failure it stays set, so a
      // refetch cannot overwrite work that is not on the server yet.
      dirty.current = false;
      await mutate();
      toast.show('Saved', 'success');
    } catch {
      toast.show('Could not save', 'warning');
    } finally {
      setSaving(false);
    }
  }, [blocks, keywords, scope, postIds, workflowId, fetchApi, mutate, toast]);

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

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  const triggerLabel = keywords.values.length
    ? `Someone comments “${keywords.values.join('” or “')}”`
    : 'Someone comments anything';

  // The preview speaks engine kinds, so feed it the expanded graph — one source
  // of truth, and the phone shows exactly what will be sent.
  const previewSteps = useMemo(
    () => expandBlocks(blocks).map((n) => ({ kind: n.kind, config: n.config })),
    [blocks]
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        title={data?.name ?? 'Automation'}
        subtitle={`${account.name}${account.username ? ` · @${account.username}` : ''}`}
        back={onBack}
        backLabel="Automations"
        right={
          <div className="flex items-center gap-[9px]">
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
        <div className="flex flex-col gap-[7px]">
          {[...errors, ...warnings].map((i, n) => (
            <div
              key={n}
              className={clsx(
                'text-[12.5px] rounded-[11px] px-[14px] py-[10px] border leading-[1.5]',
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

      {/* Canvas · inspector · phone. Stacks below xl, where three columns stop
          fitting and the preview would be squeezed into uselessness. */}
      <div className="grid gap-[16px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)_minmax(280px,320px)] items-start">
        <Glass className="p-[16px]">
          <BlockCanvas
            blocks={blocks}
            selectedId={selectedId}
            triggerLabel={triggerLabel}
            triggerSelected={triggerOpen}
            onSelect={(id) => {
              setSelectedId(id);
              setTriggerOpen(false);
            }}
            onSelectTrigger={() => {
              setTriggerOpen(true);
              setSelectedId(null);
            }}
            onAdd={addBlock}
            onRemove={(id) => {
              markDirty();
              setBlocks((all) => all.filter((b) => b.id !== id));
              if (selectedId === id) setSelectedId(null);
            }}
            onMove={move}
          />
        </Glass>

        <Glass className="overflow-hidden xl:sticky xl:top-[16px]">
          {triggerOpen ? (
            <div className="flex flex-col">
              <div className="p-[16px] pb-0">
                <div className="text-[13.5px] font-[600]">Trigger</div>
                <div className="text-[11px] text-textItemBlur mt-[2px]">
                  What starts this automation.
                </div>
              </div>
              <div className="p-[16px] flex flex-col gap-[14px]">
                <PostPicker
                  scope={scope}
                  selectedPostIds={postIds}
                  integrationId={account.integrationId}
                  onScope={(next) => {
                    markDirty();
                    setScope(next);
                  }}
                  onToggle={(id) => {
                    markDirty();
                    setPostIds((ids) =>
                      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
                    );
                  }}
                />
                <KeywordBuilder
                  value={keywords}
                  onChange={(next) => {
                    markDirty();
                    setKeywords(next);
                  }}
                />
              </div>
            </div>
          ) : (
            <BlockInspector
              block={selected}
              onChange={(config) => {
                markDirty();
                setBlocks((all) =>
                  all.map((b) => (b.id === selectedId ? { ...b, config } : b))
                );
              }}
            />
          )}
        </Glass>

        <div className="flex flex-col gap-[14px] xl:sticky xl:top-[16px]">
          <ConversationPreview
            steps={previewSteps}
            keywords={keywords.values}
            accountName={account.name}
          />

          <Glass className="grid grid-cols-3 divide-x divide-white/[0.06] overflow-hidden">
            <StatTile label="Triggered" value={stats?.triggered ?? 0} />
            <StatTile label="Replied" value={stats?.replied ?? 0} accent="#47b985" />
            <StatTile label="Leads" value={stats?.leads ?? 0} accent="#47b985" />
          </Glass>
        </div>
      </div>
    </div>
  );
};
