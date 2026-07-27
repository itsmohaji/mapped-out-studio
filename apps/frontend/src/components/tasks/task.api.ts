import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';

export interface TaskRow {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  status: string;
  priority?: string | null;
  dueAt?: string | null;
  remindAt?: string | null;
  assigneeId?: string | null;
  customerId?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface TaskSummary {
  open: number;
  overdue: number;
}

export const useTasksApi = () => {
  const fetch = useFetch();
  const list = useCallback(
    async (qs = ''): Promise<TaskRow[]> => (await fetch(`/tasks${qs}`)).json(),
    []
  );
  const summary = useCallback(
    async (): Promise<TaskSummary> => (await fetch('/tasks/summary')).json(),
    []
  );
  const create = useCallback(
    async (body: any): Promise<TaskRow> =>
      (await fetch('/tasks', { method: 'POST', body: JSON.stringify(body) })).json(),
    []
  );
  const update = useCallback(
    async (id: string, body: any): Promise<TaskRow> =>
      (
        await fetch(`/tasks/${id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
      ).json(),
    []
  );
  const remove = useCallback(
    async (id: string) => await fetch(`/tasks/${id}`, { method: 'DELETE' }),
    []
  );
  return { list, summary, create, update, remove };
};
