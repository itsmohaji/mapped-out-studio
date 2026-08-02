'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';

/**
 * Automation module — workflow list and step builder.
 *
 * The graph is stored as nodes + edges even though this edits it as a vertical
 * list, so a drag canvas can render the same rows later without a migration.
 */

interface Capability {
  channel: string;
  label: string;
  automatable: boolean;
  unavailableReason?: string;
  triggers: string[];
  actions: string[];
  messagingScopes: string[];
}

interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  channel: string;
  trigger: string;
  status: string;
  customerId?: string | null;
  customer?: { id: string; name: string } | null;
  conditions?: string;
  _count?: { nodes: number; conversations: number };
}

interface StepDraft {
  id?: string;
  key: string;
  kind: string;
  config: Record<string, any>;
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-[#8b93a5]/15 text-[#8b93a5]',
  active: 'bg-[#47b985]/15 text-[#47b985]',
  paused: 'bg-[#daa646]/15 text-[#daa646]',
};

/** Labels and the one-line explanation of what each step actually does. */
const STEP_META: Record<string, { label: string; hint: string }> = {
  send_dm: {
    label: 'Send a direct message',
    hint: 'The first message after a comment goes out as a private reply.',
  },
  reply_comment: { label: 'Reply to the comment', hint: 'Posts a public reply on the thread.' },
  wait_reply: {
    label: 'Wait for their reply',
    hint: 'Pauses here until they answer. Nothing further sends until they do.',
  },
  collect_field: { label: 'Collect an answer', hint: 'Saves their next message into a field.' },
  branch: { label: 'Branch on a condition', hint: 'Splits the flow into a match / no-match path.' },
  add_tag: { label: 'Add a tag', hint: 'Tags the contact for later filtering.' },
  create_lead: { label: 'Create a lead', hint: 'Saves the contact and pushes a deal to DBU CRM.' },
  notify_team: { label: 'Notify the team', hint: 'Sends an in-app notification.' },
  assign_manager: { label: 'Assign an account manager', hint: 'Notifies the assigned manager.' },
  call_webhook: { label: 'Call a webhook', hint: 'POSTs the collected fields to a URL.' },
  create_task: { label: 'Create a task', hint: 'Not enabled yet — this step is skipped.' },
};

const TRIGGER_LABEL: Record<string, string> = {
  comment: 'New comment',
  direct_message: 'New direct message',
  story_mention: 'Story mention',
  keyword: 'Keyword anywhere',
  form_submission: 'Form submission',
  webhook: 'Webhook',
  manual: 'Manual',
};

const uid = () => Math.random().toString(36).slice(2, 10);

const Pill: FC<{ status: string }> = ({ status }) => (
  <span
    className={clsx(
      'px-[8px] py-[3px] rounded-full text-[10.5px] font-[600] uppercase tracking-wide shrink-0',
      STATUS_STYLE[status] || STATUS_STYLE.draft
    )}
  >
    {status}
  </span>
);

// --------------------------------------------------------------------- builder

const StepRow: FC<{
  step: StepDraft;
  onChange: (s: StepDraft) => void;
  onRemove: () => void;
  disabled?: boolean;
}> = ({ step, onChange, onRemove, disabled }) => {
  const meta = STEP_META[step.kind] ?? { label: step.kind, hint: '' };
  const set = (patch: Record<string, any>) =>
    onChange({ ...step, config: { ...step.config, ...patch } });

  return (
    <div className="border border-customColor6 rounded-[8px] p-[14px] bg-customColor2">
      <div className="flex items-center gap-[10px]">
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-[600]">{meta.label}</div>
          {!!meta.hint && (
            <div className="text-[12px] text-textItemBlur mt-[2px]">{meta.hint}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="text-[12px] text-textItemBlur hover:text-red-400 shrink-0"
        >
          Remove
        </button>
      </div>

      {(step.kind === 'send_dm' || step.kind === 'reply_comment') && (
        <textarea
          value={step.config.message ?? ''}
          onChange={(e) => set({ message: e.target.value })}
          placeholder="Hi {{handle}} — thanks for commenting! What's your email?"
          rows={3}
          className="mt-[10px] w-full bg-customColor2 border border-customColor6 rounded-[6px] p-[10px] text-[13px]"
        />
      )}

      {step.kind === 'collect_field' && (
        <input
          value={step.config.field ?? ''}
          onChange={(e) => set({ field: e.target.value })}
          placeholder="Field name, e.g. email"
          className="mt-[10px] w-full bg-customColor2 border border-customColor6 rounded-[6px] p-[10px] text-[13px]"
        />
      )}

      {step.kind === 'wait_reply' && (
        <label className="mt-[10px] flex items-center gap-[8px] text-[13px]">
          Give up after
          <input
            type="number"
            min={1}
            value={step.config.timeoutDays ?? 7}
            onChange={(e) => set({ timeoutDays: Number(e.target.value) })}
            className="w-[70px] bg-customColor2 border border-customColor6 rounded-[6px] p-[6px] text-[13px]"
          />
          days
        </label>
      )}

      {step.kind === 'add_tag' && (
        <input
          value={(step.config.tags ?? []).join(', ')}
          onChange={(e) =>
            set({ tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
          }
          placeholder="Tags, comma separated"
          className="mt-[10px] w-full bg-customColor2 border border-customColor6 rounded-[6px] p-[10px] text-[13px]"
        />
      )}

      {step.kind === 'call_webhook' && (
        <input
          value={step.config.url ?? ''}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="https://example.com/hook"
          className="mt-[10px] w-full bg-customColor2 border border-customColor6 rounded-[6px] p-[10px] text-[13px]"
        />
      )}
    </div>
  );
};

const Builder: FC<{ workflow: Workflow; capability?: Capability; onClose: () => void }> = ({
  workflow,
  capability,
  onClose,
}) => {
  const fetchApi = useFetch();
  const toast = useToaster();
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [issues, setIssues] = useState<{ level: string; message: string }[]>([]);

  const { data, mutate } = useSWR(`/automation/${workflow.id}`, async (url: string) =>
    (await fetchApi(url)).json()
  );

  // Seed the editor once the saved graph arrives.
  const loadedKey = data?.id + ':' + (data?.nodes?.length ?? 0);
  const [seeded, setSeeded] = useState('');
  if (data && loadedKey !== seeded) {
    setSeeded(loadedKey);
    setSteps(
      (data.nodes ?? []).map((n: any) => ({
        id: n.id,
        key: n.id,
        kind: n.kind,
        config: (() => {
          try {
            return JSON.parse(n.config || '{}');
          } catch {
            return {};
          }
        })(),
      }))
    );
    try {
      const conds = JSON.parse(data.conditions || '[]');
      const kw = conds.find((c: any) => c.kind === 'keyword');
      setKeyword((kw?.values ?? []).join(', '));
    } catch {
      /* a malformed condition blob must not blank the builder */
    }
  }

  const addStep = (kind: string) =>
    setSteps((s) => [...s, { key: uid(), kind, config: {} }]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      // A linear list is a graph where each node's parent is the one above it.
      const nodes = steps.map((s, i) => ({
        ...(s.id ? { id: s.id } : {}),
        parentId: i === 0 ? null : steps[i - 1].id ?? steps[i - 1].key,
        branchKey: null,
        kind: s.kind,
        config: s.config,
        position: i,
      }));

      // Ids must be stable so a running conversation's cursor survives an edit.
      const withIds = nodes.map((n, i) => ({ ...n, id: steps[i].id ?? steps[i].key }));
      const relinked = withIds.map((n, i) => ({
        ...n,
        parentId: i === 0 ? null : withIds[i - 1].id,
      }));

      const values = keyword
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      await fetchApi(`/automation/${workflow.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          conditions: values.length ? [{ kind: 'keyword', match: 'equals', values }] : [],
        }),
      });

      await fetchApi(`/automation/${workflow.id}/graph`, {
        method: 'PUT',
        body: JSON.stringify({ nodes: relinked }),
      });

      const check = await (await fetchApi(`/automation/${workflow.id}/validate`)).json();
      setIssues(check ?? []);
      await mutate();
      toast.show('Automation saved', 'success');
    } catch {
      toast.show('Could not save the automation', 'warning');
    } finally {
      setSaving(false);
    }
  }, [steps, keyword, workflow.id, fetchApi, mutate, toast]);

  const activate = useCallback(async () => {
    const next = workflow.status === 'active' ? 'paused' : 'active';
    const res = await (
      await fetchApi(`/automation/${workflow.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: next }),
      })
    ).json();

    if (res?.ok === false) {
      setIssues(res.issues ?? []);
      toast.show('Fix the errors below before turning this on', 'warning');
      return;
    }
    toast.show(next === 'active' ? 'Automation is live' : 'Automation paused', 'success');
    onClose();
  }, [workflow, fetchApi, toast, onClose]);

  const available = capability?.actions ?? [];

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center gap-[10px]">
        <button onClick={onClose} className="text-[13px] text-textItemBlur hover:text-textColor">
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[18px] font-[600] truncate">{workflow.name}</div>
          <div className="text-[12px] text-textItemBlur">
            {capability?.label ?? workflow.channel} · {TRIGGER_LABEL[workflow.trigger] ?? workflow.trigger}
            {workflow.customer ? ` · ${workflow.customer.name}` : ' · All clients'}
          </div>
        </div>
        <Pill status={workflow.status} />
      </div>

      {!!issues.length && (
        <div className="flex flex-col gap-[6px]">
          {issues.map((i, n) => (
            <div
              key={n}
              className={clsx(
                'text-[12.5px] rounded-[6px] px-[12px] py-[9px] border',
                i.level === 'error'
                  ? 'border-red-500/40 bg-red-500/10 text-red-300'
                  : 'border-[#daa646]/40 bg-[#daa646]/10 text-[#daa646]'
              )}
            >
              {i.message}
            </div>
          ))}
        </div>
      )}

      <div className="border border-customColor6 rounded-[8px] p-[14px] bg-customColor2">
        <div className="text-[14px] font-[600]">When someone comments</div>
        <div className="text-[12px] text-textItemBlur mt-[2px]">
          Leave blank to run on every comment. Matching ignores case, punctuation and emoji, and
          only matches whole words — “YES” will not fire on “yesterday”.
        </div>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="YES"
          className="mt-[10px] w-full bg-customColor2 border border-customColor6 rounded-[6px] p-[10px] text-[13px]"
        />
      </div>

      <div className="flex flex-col gap-[10px]">
        {steps.map((s, i) => (
          <StepRow
            key={s.key}
            step={s}
            disabled={saving}
            onChange={(next) => setSteps((all) => all.map((x, n) => (n === i ? next : x)))}
            onRemove={() => setSteps((all) => all.filter((_, n) => n !== i))}
          />
        ))}
        {!steps.length && (
          <div className="text-[13px] text-textItemBlur border border-dashed border-customColor6 rounded-[8px] p-[20px] text-center">
            No steps yet. Add “Send a direct message” to start the conversation.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-[8px]">
        {available.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => addStep(kind)}
            className="text-[12px] px-[10px] py-[6px] rounded-[6px] border border-customColor6 hover:border-btnPrimary"
          >
            + {STEP_META[kind]?.label ?? kind}
          </button>
        ))}
      </div>

      <div className="flex gap-[10px]">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button onClick={activate} secondary={workflow.status === 'active'}>
          {workflow.status === 'active' ? 'Pause' : 'Turn on'}
        </Button>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ list view

export const AutomationComponent: FC = () => {
  const fetchApi = useFetch();
  const toast = useToaster();
  const t = useT();
  const [open, setOpen] = useState<Workflow | null>(null);
  const [customer, setCustomer] = useState('all');

  const { data: capabilities } = useSWR<Capability[]>('/automation/capabilities', async (url: string) =>
    (await fetchApi(url)).json()
  );

  const { data: customers } = useSWR<{ id: string; name: string }[]>(
    '/integrations/customers',
    async (url: string) => (await fetchApi(url)).json()
  );

  const { data: workflows, mutate } = useSWR<Workflow[]>(
    `/automation?customer=${customer}`,
    async (url: string) => (await fetchApi(url)).json()
  );

  const capsByChannel = useMemo(
    () => Object.fromEntries((capabilities ?? []).map((c) => [c.channel, c])),
    [capabilities]
  );

  const create = useCallback(async () => {
    const res = await (
      await fetchApi('/automation', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Comment to DM',
          channel: 'instagram',
          trigger: 'comment',
          customerId: customer === 'all' ? null : customer,
        }),
      })
    ).json();
    await mutate();
    setOpen(res);
  }, [fetchApi, mutate, customer]);

  const remove = useCallback(
    async (w: Workflow) => {
      if (!(await deleteDialog(`Delete “${w.name}”?`, 'Delete'))) return;
      await fetchApi(`/automation/${w.id}`, { method: 'DELETE' });
      toast.show('Automation deleted', 'success');
      mutate();
    },
    [fetchApi, mutate, toast]
  );

  if (open) {
    return (
      <div className="flex flex-col gap-[16px] p-[20px]">
        <Builder
          workflow={workflows?.find((w) => w.id === open.id) ?? open}
          capability={capsByChannel[open.channel]}
          onClose={() => {
            setOpen(null);
            mutate();
          }}
        />
      </div>
    );
  }

  const unavailable = (capabilities ?? []).filter((c) => !c.automatable);

  return (
    <div className="flex flex-col gap-[16px] p-[20px]">
      <div className="flex flex-wrap items-center gap-[10px]">
        <div className="flex-1 min-w-0">
          <div className="text-[20px] font-[600]">{t('automation', 'Automation')}</div>
          <div className="text-[12.5px] text-textItemBlur">
            Rules that reply, collect and route on their own. No AI required.
          </div>
        </div>
        <select
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          className="bg-customColor2 border border-customColor6 rounded-[6px] p-[8px] text-[13px]"
        >
          <option value="all">All clients</option>
          <option value="none">Organisation-wide</option>
          {(customers ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button onClick={create}>New automation</Button>
      </div>

      <div className="flex flex-col gap-[10px]">
        {(workflows ?? []).map((w) => (
          <div
            key={w.id}
            className="border border-customColor6 rounded-[8px] p-[14px] bg-customColor2 flex items-center gap-[12px]"
          >
            <button
              onClick={() => setOpen(w)}
              className="flex-1 min-w-0 text-left"
            >
              <div className="text-[14.5px] font-[600] truncate">{w.name}</div>
              <div className="text-[12px] text-textItemBlur mt-[2px]">
                {capsByChannel[w.channel]?.label ?? w.channel} ·{' '}
                {TRIGGER_LABEL[w.trigger] ?? w.trigger} ·{' '}
                {w._count?.nodes ?? 0} steps · {w._count?.conversations ?? 0} conversations
                {w.customer ? ` · ${w.customer.name}` : ''}
              </div>
            </button>
            <Pill status={w.status} />
            <button
              onClick={() => remove(w)}
              className="text-[12px] text-textItemBlur hover:text-red-400 shrink-0"
            >
              Delete
            </button>
          </div>
        ))}

        {!workflows?.length && (
          <div className="text-[13px] text-textItemBlur border border-dashed border-customColor6 rounded-[8px] p-[24px] text-center">
            No automations yet. Create one to reply to comments and open DMs automatically.
          </div>
        )}
      </div>

      {!!unavailable.length && (
        <div className="border border-customColor6 rounded-[8px] p-[14px] bg-customColor2">
          <div className="text-[13px] font-[600]">Channels that cannot be automated</div>
          <div className="text-[12px] text-textItemBlur mt-[2px]">
            Not a limitation of Mapped Out — these platforms do not expose the APIs.
          </div>
          <div className="flex flex-col gap-[8px] mt-[10px]">
            {unavailable.map((c) => (
              <div key={c.channel} className="text-[12px]">
                <span className="font-[600]">{c.label}</span>
                <span className="text-textItemBlur"> — {c.unavailableReason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
