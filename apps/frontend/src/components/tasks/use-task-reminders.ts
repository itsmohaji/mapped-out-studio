'use client';

import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useTasksApi, TaskRow } from '@gitroom/frontend/components/tasks/task.api';

const SEEN_KEY = 'mo_task_reminders_seen_v1';
const POLL_MS = 60_000;

const readSeen = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
  } catch {
    return {};
  }
};
const writeSeen = (value: Record<string, number>) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — notifications still fire this session */
  }
};

// The moment a task should surface to the user: explicit reminder time, else its due time.
const dueMoment = (task: TaskRow): number | null => {
  const iso = task.remindAt || task.dueAt;
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
};

/**
 * Watches the org's open tasks and notifies when a reminder/due time arrives.
 * Fires an in-app toast plus (when permitted) a native browser notification.
 * Each task notifies once — remembered in localStorage so a reload is quiet.
 */
export const useTaskReminders = () => {
  const api = useTasksApi();
  const toast = useToaster();
  const askedRef = useRef(false);

  const { data: tasks } = useSWR<TaskRow[]>('/tasks/reminders', () => api.list(), {
    refreshInterval: POLL_MS,
    revalidateOnFocus: true,
  });

  // Ask for notification permission once, lazily (never on first paint).
  useEffect(() => {
    if (askedRef.current) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!(tasks || []).some((task) => dueMoment(task) !== null)) return;
    askedRef.current = true;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [tasks]);

  useEffect(() => {
    if (!tasks?.length) return;
    const now = Date.now();
    const seen = readSeen();
    let changed = false;

    for (const task of tasks) {
      if (task.status === 'done') continue;
      const moment = dueMoment(task);
      if (moment === null || moment > now) continue;
      // Don't shout about things that came due long before this session.
      if (now - moment > 24 * 60 * 60 * 1000) continue;
      if (seen[task.id] === moment) continue;

      seen[task.id] = moment;
      changed = true;

      toast.show(task.title, 'success');
      try {
        if (
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          // eslint-disable-next-line no-new
          new Notification(
            task.type === 'reminder' ? 'Reminder' : 'Task due',
            { body: task.title, tag: `task-${task.id}` }
          );
        }
      } catch {
        /* notification blocked — the toast already surfaced it */
      }
    }

    if (changed) writeSeen(seen);
  }, [tasks, toast]);
};
