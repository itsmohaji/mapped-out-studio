'use client';

import React, { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useTasksApi, TaskRow } from '@gitroom/frontend/components/tasks/task.api';

interface Customer {
  id: string;
  name: string;
}
interface TeamMember {
  id: string;
  role: string;
  user: { id: string; email: string };
}

const toLocalInputValue = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

export const TaskForm = ({
  compact,
  task,
  onSaved,
}: {
  compact?: boolean;
  task?: TaskRow;
  onSaved: () => void;
}) => {
  const fetch = useFetch();
  const modals = useModals();
  const toast = useToaster();
  const t = useT();
  const user = useUser();
  const api = useTasksApi();

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState(task?.priority || '');
  const [dueAt, setDueAt] = useState(toLocalInputValue(task?.dueAt));
  const [remindAt, setRemindAt] = useState(toLocalInputValue(task?.remindAt));
  const [assigneeId, setAssigneeId] = useState(
    task?.assigneeId || (compact ? (user?.id as string) || '' : '')
  );
  const [customerId, setCustomerId] = useState(task?.customerId || '');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  const { data: customers } = useSWR<Customer[]>(
    !compact ? '/integrations/customers' : null,
    load
  );
  const { data: teamData } = useSWR<{ users: TeamMember[] }>(
    !compact ? '/settings/team' : null,
    load
  );
  const teamMembers = teamData?.users || [];

  const save = useCallback(async () => {
    const clean = title.trim();
    if (!clean || saving) return;
    setSaving(true);
    try {
      const body: any = compact
        ? {
            title: clean,
            type: 'reminder',
            remindAt: remindAt ? new Date(remindAt).toISOString() : undefined,
            assigneeId: assigneeId || (user?.id as string) || undefined,
          }
        : {
            title: clean,
            description: description.trim() || undefined,
            type: 'task',
            priority: priority || undefined,
            dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
            remindAt: remindAt ? new Date(remindAt).toISOString() : undefined,
            assigneeId: assigneeId || undefined,
            customerId: customerId || undefined,
          };

      if (task?.id) {
        await api.update(task.id, body);
        toast.show(t('task_updated', 'Task updated'));
      } else {
        await api.create(body);
        toast.show(
          compact
            ? t('reminder_created', 'Reminder set')
            : t('task_created', 'Task created')
        );
      }
      onSaved();
      modals.closeAll();
    } catch {
      toast.show(t('task_save_failed', 'Could not save'), 'warning');
    } finally {
      setSaving(false);
    }
  }, [
    title,
    description,
    priority,
    dueAt,
    remindAt,
    assigneeId,
    customerId,
    saving,
    task,
    compact,
    user,
  ]);

  return (
    <div className="p-[16px] flex flex-col gap-[14px] min-w-[340px] max-w-[420px]">
      <div className="flex flex-col gap-[6px]">
        <label className="text-[12px] text-textItemBlur">
          {compact ? t('reminder_title', 'Reminder') : t('task_title', 'Title')}
        </label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && compact) save();
          }}
          placeholder={
            compact
              ? t('reminder_title_ph', 'e.g. Follow up with the client')
              : t('task_title_ph', 'e.g. Draft next content calendar')
          }
          className="w-full bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[14px] py-[11px] text-newTextColor outline-none focus:border-btnPrimary"
        />
      </div>

      {compact ? (
        <div className="flex flex-col gap-[6px]">
          <label className="text-[12px] text-textItemBlur">
            {t('remind_me_at', 'Remind me at')}
          </label>
          <input
            type="datetime-local"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
            className="w-full bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[14px] py-[11px] text-newTextColor outline-none focus:border-btnPrimary"
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-[6px]">
            <label className="text-[12px] text-textItemBlur">
              {t('description', 'Description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t('optional', 'Optional')}
              className="w-full bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[14px] py-[11px] text-newTextColor outline-none focus:border-btnPrimary resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-[10px]">
            <div className="flex flex-col gap-[6px]">
              <label className="text-[12px] text-textItemBlur">
                {t('assignee', 'Assignee')}
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[10px] py-[11px] text-newTextColor outline-none focus:border-btnPrimary"
              >
                <option value="">{t('unassigned', 'Unassigned')}</option>
                {teamMembers.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.id === user?.id ? t('me', 'Me') : m.user.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-[12px] text-textItemBlur">
                {t('client', 'Client')}
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[10px] py-[11px] text-newTextColor outline-none focus:border-btnPrimary"
              >
                <option value="">{t('none', 'None')}</option>
                {(customers || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-[10px]">
            <div className="flex flex-col gap-[6px]">
              <label className="text-[12px] text-textItemBlur">
                {t('due_date', 'Due date')}
              </label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[10px] py-[11px] text-newTextColor outline-none focus:border-btnPrimary"
              />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-[12px] text-textItemBlur">
                {t('priority', 'Priority')}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[10px] py-[11px] text-newTextColor outline-none focus:border-btnPrimary"
              >
                <option value="">{t('none', 'None')}</option>
                <option value="low">{t('priority_low', 'Low')}</option>
                <option value="medium">{t('priority_medium', 'Medium')}</option>
                <option value="high">{t('priority_high', 'High')}</option>
              </select>
            </div>
          </div>
        </>
      )}

      <div className="flex gap-[10px]">
        <Button onClick={save} loading={saving} disabled={saving || !title.trim()}>
          {task?.id
            ? t('save_changes', 'Save changes')
            : compact
            ? t('set_reminder', 'Set Reminder')
            : t('create_task', 'Create task')}
        </Button>
      </div>
    </div>
  );
};
