'use client';

import React, { FC, ReactNode, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useTasksApi, TaskRow } from '@gitroom/frontend/components/tasks/task.api';
import { TaskForm } from '@gitroom/frontend/components/tasks/task-form';

interface Customer {
  id: string;
  name: string;
}
interface TeamMember {
  id: string;
  role: string;
  user: { id: string; email: string };
}

type StatusKey = 'todo' | 'doing' | 'done';
const STATUS_ORDER: StatusKey[] = ['todo', 'doing', 'done'];
const STATUS_META: Record<StatusKey, { label: string }> = {
  todo: { label: 'To-do' },
  doing: { label: 'Doing' },
  done: { label: 'Done' },
};

const fmtDue = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
const isOverdue = (task: TaskRow) =>
  task.status !== 'done' && !!task.dueAt && new Date(task.dueAt).getTime() < Date.now();

const Card: FC<{ title: string; count: number; action?: ReactNode; children: ReactNode }> = ({
  title,
  count,
  action,
  children,
}) => (
  <div className="glass-surface rounded-[16px] overflow-hidden flex flex-col">
    <div className="flex items-center gap-[10px] px-[16px] py-[13px] border-b border-newTableBorder">
      <div className="text-[13px] font-[600] flex-1">
        {title}{' '}
        <span className="text-textItemBlur font-[500]">({count})</span>
      </div>
      {action}
    </div>
    <div className="flex-1">{children}</div>
  </div>
);

export const TasksComponent = () => {
  const fetch = useFetch();
  const t = useT();
  const modals = useModals();
  const toast = useToaster();
  const user = useUser();
  const api = useTasksApi();

  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  const {
    data: tasks,
    mutate: mutateTasks,
  } = useSWR<TaskRow[]>('/tasks', () => api.list());
  const { data: customers } = useSWR<Customer[]>('/integrations/customers', load);
  const { data: teamData } = useSWR<{ users: TeamMember[] }>('/settings/team', load);

  const customerName = useMemo(() => {
    const map: Record<string, string> = {};
    (customers || []).forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [customers]);

  const assigneeName = useMemo(() => {
    const map: Record<string, string> = {};
    (teamData?.users || []).forEach((m) => {
      map[m.user.id] = m.user.email;
    });
    if (user?.id) {
      map[user.id] = t('me', 'Me');
    }
    return map;
  }, [teamData, user, t]);

  const grouped = useMemo(() => {
    const g: Record<StatusKey, TaskRow[]> = { todo: [], doing: [], done: [] };
    (tasks || []).forEach((task) => {
      const key: StatusKey =
        task.status === 'doing' || task.status === 'done' ? task.status : 'todo';
      g[key].push(task);
    });
    return g;
  }, [tasks]);

  const addTask = useCallback(() => {
    modals.openModal({
      title: t('add_task', 'Add Task'),
      withCloseButton: true,
      classNames: { modal: 'bg-newBgColorInner text-newTextColor' },
      children: <TaskForm onSaved={() => mutateTasks()} />,
    });
  }, [t, mutateTasks]);

  const editTask = useCallback(
    (task: TaskRow) => {
      modals.openModal({
        title:
          task.type === 'reminder'
            ? t('edit_reminder', 'Edit Reminder')
            : t('edit_task', 'Edit Task'),
        withCloseButton: true,
        classNames: { modal: 'bg-newBgColorInner text-newTextColor' },
        children: (
          <TaskForm
            compact={task.type === 'reminder'}
            task={task}
            onSaved={() => mutateTasks()}
          />
        ),
      });
    },
    [t, mutateTasks]
  );

  const toggleComplete = useCallback(
    async (task: TaskRow) => {
      const nextStatus = task.status === 'done' ? 'todo' : 'done';
      await api.update(task.id, { status: nextStatus });
      mutateTasks();
    },
    [mutateTasks]
  );

  const removeTask = useCallback(
    async (task: TaskRow) => {
      if (
        !(await deleteDialog(
          t(
            'are_you_sure_remove_task',
            'Are you sure you want to delete this?'
          )
        ))
      ) {
        return;
      }
      await api.remove(task.id);
      toast.show(t('task_deleted', 'Deleted'));
      mutateTasks();
    },
    [t, mutateTasks]
  );

  const loading = !tasks;
  const totalCount = (tasks || []).length;

  return (
    <div className="flex-1 flex flex-col gap-[16px] p-[20px]">
      {/* Header */}
      <div className="flex items-center gap-[16px]">
        <div className="flex-1">
          <h1 className="text-[22px] font-[600]">{t('tasks', 'Tasks')}</h1>
          <p className="text-[13px] text-textItemBlur mt-[2px]">
            {t(
              'tasks_sub',
              'Track work and reminders across your team and clients'
            )}
          </p>
        </div>
        <Button onClick={addTask}>+ {t('add_task', 'Add Task')}</Button>
      </div>

      {loading && (
        <div className="glass-surface rounded-[16px] px-[18px] py-[40px] text-center text-textItemBlur text-[13px]">
          {t('loading', 'Loading…')}
        </div>
      )}

      {!loading && totalCount === 0 && (
        <div className="glass-surface rounded-[16px] px-[18px] py-[44px] text-center">
          <div className="text-[14px] font-[600]">
            {t('no_tasks_yet', 'No tasks yet')}
          </div>
          <div className="text-[12.5px] text-textItemBlur mt-[4px] mb-[16px]">
            {t(
              'no_tasks_help',
              'Create a task or set a reminder to keep track of what needs to happen next.'
            )}
          </div>
          <Button onClick={addTask}>+ {t('add_task', 'Add Task')}</Button>
        </div>
      )}

      {!loading && totalCount > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-[16px] items-start">
          {STATUS_ORDER.map((status) => {
            const rows = grouped[status];
            const meta = STATUS_META[status];
            return (
              <Card key={status} title={meta.label} count={rows.length}>
                {rows.length === 0 ? (
                  <div className="px-[16px] py-[24px] text-center text-textItemBlur text-[12.5px]">
                    {t('nothing_here', 'Nothing here.')}
                  </div>
                ) : (
                  rows.map((task) => {
                    const overdue = isOverdue(task);
                    const due = fmtDue(task.dueAt || task.remindAt);
                    return (
                      <div
                        key={task.id}
                        className="flex items-start gap-[10px] px-[16px] py-[12px] border-b border-newTableBorder last:border-b-0"
                      >
                        <button
                          type="button"
                          onClick={() => toggleComplete(task)}
                          title={
                            task.status === 'done'
                              ? t('mark_incomplete', 'Mark as not done')
                              : t('mark_complete', 'Mark as done')
                          }
                          className={`mt-[2px] w-[18px] h-[18px] rounded-[6px] border shrink-0 flex items-center justify-center transition-colors ${
                            task.status === 'done'
                              ? 'bg-btnPrimary border-btnPrimary'
                              : 'border-newTableBorder hover:border-btnPrimary'
                          }`}
                        >
                          {task.status === 'done' && (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                              <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-[12.5px] font-[600] truncate ${
                              task.status === 'done' ? 'line-through text-textItemBlur' : ''
                            }`}
                          >
                            {task.title}
                          </div>
                          <div className="text-[11px] text-textItemBlur mt-[2px] flex flex-wrap items-center gap-x-[8px] gap-y-[2px]">
                            {task.type === 'reminder' && (
                              <span className="text-btnPrimary">
                                {t('reminder', 'Reminder')}
                              </span>
                            )}
                            {task.customerId && customerName[task.customerId] && (
                              <span>{customerName[task.customerId]}</span>
                            )}
                            {task.assigneeId && assigneeName[task.assigneeId] && (
                              <span>{assigneeName[task.assigneeId]}</span>
                            )}
                            {due && (
                              <span className={overdue ? 'text-[#e2685f] font-[600]' : ''}>
                                {overdue ? t('overdue', 'Overdue') + ' · ' : ''}
                                {due}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-[4px] shrink-0">
                          <button
                            type="button"
                            onClick={() => editTask(task)}
                            title={t('edit', 'Edit')}
                            className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-newTextColor hover:bg-newBgLineColor/60 transition-colors"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M12 20h9" strokeLinecap="round" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTask(task)}
                            title={t('delete', 'Delete')}
                            className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-[#e2685f] hover:bg-newBgLineColor/60 transition-colors"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M3 6h18" strokeLinecap="round" />
                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
