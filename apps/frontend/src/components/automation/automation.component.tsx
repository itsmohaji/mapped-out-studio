'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import { AccountsView, AutomationAccount } from './accounts.view';
import { TemplatesView, Template } from './templates.view';
import { BuilderView } from './builder.view';
import {
  EmptyState,
  Glass,
  PLATFORM_ICON,
  PageHeader,
  Skeleton,
  StatusPill,
  timeAgo,
} from './automation.ui';
import { WebhookSetup } from './webhook.setup';
import { AccountDiagnostics } from './account.diagnostics';

type View =
  | { name: 'accounts' }
  | { name: 'account'; account: AutomationAccount }
  | { name: 'templates'; account: AutomationAccount }
  | { name: 'builder'; account: AutomationAccount; workflowId: string };

interface Workflow {
  id: string;
  name: string;
  channel: string;
  trigger: string;
  status: string;
  customerId?: string | null;
  _count?: { nodes: number; conversations: number };
  updatedAt?: string;
}

/** Automations for one account: same channel, and org-wide or the same client. */
const belongsTo = (w: Workflow, a: AutomationAccount) =>
  w.channel === a.channel && (!w.customerId || w.customerId === a.customerId);

const AccountHome: FC<{
  account: AutomationAccount;
  workflows?: Workflow[];
  loading: boolean;
  onBack?: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (w: Workflow) => void;
}> = ({ account, workflows, loading, onBack, onNew, onOpen, onDelete }) => {
  const mine = (workflows ?? []).filter((w) => belongsTo(w, account));

  return (
    <div className="flex flex-col gap-[24px]">
      <PageHeader
        title={account.name}
        subtitle={
          account.username
            ? `@${account.username} · ${PLATFORM_ICON[account.channel] ?? ''} ${account.channel}`
            : account.channel
        }
        back={onBack}
        backLabel="All accounts"
        right={<Button onClick={onNew}>New automation</Button>}
      />

      <WebhookSetup />

      <AccountDiagnostics integrationId={account.integrationId} />

      {loading && (
        <div className="flex flex-col gap-[10px]">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[74px]" />
          ))}
        </div>
      )}

      {!loading && !mine.length && (
        <Glass className="p-[10px]">
          <EmptyState
            icon="⚡"
            title="No automations yet"
            body="Start from a template — comment-to-DM, lead collection, auto replies. You can change every step afterwards."
            action={<Button onClick={onNew}>Browse templates</Button>}
          />
        </Glass>
      )}

      {!!mine.length && (
        <div className="flex flex-col gap-[10px]">
          {mine.map((w) => (
            <Glass
              key={w.id}
              hoverable
              onClick={() => onOpen(w.id)}
              className="px-[18px] py-[15px] flex items-center gap-[14px]"
            >
              <div className="w-[36px] h-[36px] rounded-[11px] bg-btnPrimary/12 flex items-center justify-center text-[15px] shrink-0">
                ⚡
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-[600] truncate">{w.name}</div>
                <div className="text-[11.5px] text-textItemBlur mt-[3px]">
                  {w._count?.nodes ?? 0} steps · {w._count?.conversations ?? 0} conversations ·
                  updated {timeAgo(w.updatedAt)}
                </div>
              </div>
              <StatusPill status={w.status} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(w);
                }}
                className="text-[12px] text-textItemBlur hover:text-[#e2685f] transition-colors shrink-0 px-[6px]"
              >
                Delete
              </button>
            </Glass>
          ))}
        </div>
      )}
    </div>
  );
};

export const AutomationComponent: FC = () => {
  const fetchApi = useFetch();
  const toast = useToaster();
  const [view, setView] = useState<View | null>(null);

  const { data: accounts, isLoading: accountsLoading } = useSWR<AutomationAccount[]>(
    '/automation/accounts',
    async (url: string) => (await fetchApi(url)).json()
  );

  const {
    data: workflows,
    mutate: mutateWorkflows,
    isLoading: wfLoading,
  } = useSWR<Workflow[]>('/automation', async (url: string) => (await fetchApi(url)).json());

  const usable = useMemo(() => (accounts ?? []).filter((a) => a.automatable), [accounts]);

  const { data: templates, isLoading: tplLoading } = useSWR<Template[]>(
    view?.name === 'templates' ? `/automation/templates?channel=${view.account.channel}` : null,
    async (url: string) => (await fetchApi(url)).json()
  );

  /**
   * With exactly one usable account there is nothing to choose, so the picker
   * would be a click that teaches the user nothing. Skip straight in.
   */
  const resolved: View = useMemo(() => {
    if (view) return view;
    if (usable.length === 1) return { name: 'account', account: usable[0] };
    return { name: 'accounts' };
  }, [view, usable]);

  // Only offer "back to accounts" when there is genuinely a choice to go back to.
  const backToAccounts = usable.length > 1 ? () => setView({ name: 'accounts' }) : undefined;

  const createFromTemplate = useCallback(
    async (account: AutomationAccount, template: Template) => {
      try {
        const created = await (
          await fetchApi('/automation/from-template', {
            method: 'POST',
            body: JSON.stringify({
              templateKey: template.key,
              channel: account.channel,
              customerId: account.customerId ?? null,
            }),
          })
        ).json();
        await mutateWorkflows();
        setView({ name: 'builder', account, workflowId: created.id });
      } catch {
        toast.show('Could not create that automation', 'warning');
      }
    },
    [fetchApi, mutateWorkflows, toast]
  );

  const remove = useCallback(
    async (w: Workflow) => {
      if (!(await deleteDialog(`Delete “${w.name}”?`, 'Delete'))) return;
      await fetchApi(`/automation/${w.id}`, { method: 'DELETE' });
      toast.show('Deleted', 'success');
      mutateWorkflows();
    },
    [fetchApi, mutateWorkflows, toast]
  );

  return (
    // Full width on purpose. The module is a working surface — capping it at
    // 1500px left a wall of empty space on a desktop while the cards stayed
    // small. Padding steps up with the viewport instead.
    <div className="w-full min-w-0 px-[12px] py-[16px] sm:px-[18px] lg:px-[26px] lg:py-[24px]">
      {resolved.name === 'accounts' && (
        <AccountsView
          accounts={accounts}
          loading={accountsLoading}
          onOpen={(a) => setView({ name: 'account', account: a })}
          onNew={(a) => setView({ name: 'templates', account: a })}
        />
      )}

      {resolved.name === 'account' && (
        <AccountHome
          account={resolved.account}
          workflows={workflows}
          loading={wfLoading}
          onBack={backToAccounts}
          onNew={() => setView({ name: 'templates', account: resolved.account })}
          onOpen={(id) => setView({ name: 'builder', account: resolved.account, workflowId: id })}
          onDelete={remove}
        />
      )}

      {resolved.name === 'templates' && (
        <TemplatesView
          templates={templates}
          loading={tplLoading}
          accountName={resolved.account.name}
          onPick={(t) => createFromTemplate(resolved.account, t)}
          onBack={() => setView({ name: 'account', account: resolved.account })}
        />
      )}

      {resolved.name === 'builder' && (
        <BuilderView
          workflowId={resolved.workflowId}
          account={resolved.account}
          onBack={() => {
            mutateWorkflows();
            setView({ name: 'account', account: resolved.account });
          }}
        />
      )}
    </div>
  );
};
