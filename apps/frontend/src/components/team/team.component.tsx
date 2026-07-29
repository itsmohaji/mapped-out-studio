'use client';

import React, { FC, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { capitalize } from 'lodash';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import { productRoleLabel } from '@gitroom/nestjs-libraries/security/roles';
import {
  AddMember,
  EditAssignments,
} from '@gitroom/frontend/components/settings/teams.component';
import { TaskRow } from '@gitroom/frontend/components/tasks/task.api';

type Role = 'SUPERADMIN' | 'ADMIN' | 'USER' | 'CLIENT';

interface Member {
  id: string;
  role: Role;
  user: { id: string; email: string; name?: string | null };
}

const ROLE_STYLE: Record<Role, string> = {
  SUPERADMIN: 'bg-btnPrimary/15 text-btnPrimary',
  ADMIN: 'bg-[#47b985]/15 text-[#47b985]',
  USER: 'bg-[#8b93a5]/15 text-[#8b93a5]',
  CLIENT: 'bg-[#daa646]/15 text-[#daa646]',
};

const level = (role: Role) =>
  role === 'SUPERADMIN' ? 2 : role === 'ADMIN' ? 1 : 0;

const displayName = (m: Member) =>
  m.user.name ||
  capitalize((m.user.email || '?').split('@')[0]).split('.')[0] ||
  m.user.email;

export const TeamComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const user = useUser();
  const modals = useModals();

  const myLevel = level((user?.role as Role) || 'USER');

  const loadTeam = useCallback(
    async () => (await (await fetch('/settings/team')).json()).users as Member[],
    []
  );
  const { data: members, mutate } = useSWR('team-page', loadTeam, {
    revalidateOnFocus: false,
  });

  // Open workload per member, from the same /tasks the Tasks board uses.
  const loadTasks = useCallback(
    async () => (await (await fetch('/tasks')).json()) as TaskRow[],
    []
  );
  const { data: tasks } = useSWR('team-tasks', loadTasks, {
    revalidateOnFocus: false,
  });

  const openTasksBy = useMemo(() => {
    const out: Record<string, number> = {};
    for (const task of tasks || []) {
      if (!task.assigneeId || task.status === 'done') continue;
      out[task.assigneeId] = (out[task.assigneeId] || 0) + 1;
    }
    return out;
  }, [tasks]);

  const addMember = useCallback(() => {
    modals.openModal({
      classNames: { modal: 'bg-transparent text-textColor' },
      title: t('top_title_add_member', 'Add Member'),
      withCloseButton: true,
      children: <AddMember />,
    });
  }, [modals, t]);

  const editAccess = useCallback(
    (userId: string) => () => {
      modals.openModal({
        classNames: { modal: 'bg-transparent text-textColor' },
        title: t('edit_access', 'Edit access'),
        withCloseButton: true,
        children: <EditAssignments userId={userId} />,
      });
    },
    [modals, t]
  );

  const remove = useCallback(
    (m: Member) => async () => {
      const ok = await deleteDialog(
        t(
          'are_you_sure_remove_team_member',
          'Are you sure you want to remove this team member?'
        )
      );
      if (!ok) return;
      await fetch(`/settings/team/${m.user.id}`, { method: 'DELETE' });
      await mutate();
    },
    [mutate, t]
  );

  const counts = useMemo(() => {
    const all = members || [];
    return {
      total: all.length,
      admins: all.filter((m) => m.role === 'ADMIN' || m.role === 'SUPERADMIN')
        .length,
      clients: all.filter((m) => m.role === 'CLIENT').length,
    };
  }, [members]);

  return (
    <div className="flex-1 flex flex-col gap-[16px] p-[20px]">
      <div className="flex items-start gap-[12px] flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-[22px] font-[600]">{t('team', 'Team')}</h1>
          <p className="text-[13px] text-textItemBlur mt-[2px]">
            {t(
              'team_sub',
              'Who can get into this workspace, what they can reach, and what is on their plate.'
            )}
          </p>
        </div>
        {myLevel > 0 && (
          <Button onClick={addMember}>
            {t('add_another_member', 'Add another member')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-[12px]">
        <div className="glass-surface rounded-[16px] px-[16px] py-[14px]">
          <div className="text-[11px] font-[600] text-textItemBlur">
            {t('members', 'Members')}
          </div>
          <div className="text-[24px] font-[600] tabular-nums leading-none mt-[8px]">
            {counts.total}
          </div>
        </div>
        <div className="glass-surface rounded-[16px] px-[16px] py-[14px]">
          <div className="text-[11px] font-[600] text-textItemBlur">
            {t('admins', 'Admins')}
          </div>
          <div className="text-[24px] font-[600] tabular-nums leading-none mt-[8px]">
            {counts.admins}
          </div>
        </div>
        <div className="glass-surface rounded-[16px] px-[16px] py-[14px]">
          <div className="text-[11px] font-[600] text-textItemBlur">
            {t('client_accounts', 'Client accounts')}
          </div>
          <div className="text-[24px] font-[600] tabular-nums leading-none mt-[8px]">
            {counts.clients}
          </div>
        </div>
      </div>

      {!members?.length ? (
        <div className="glass-surface rounded-[16px] px-[18px] py-[46px] text-center">
          <div className="text-[14px] font-[600]">
            {t('no_team_members', 'No team members yet')}
          </div>
          <div className="text-[12.5px] text-textItemBlur mt-[5px]">
            {t(
              'no_team_members_help',
              'Invite someone to help manage the workspace.'
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[14px]">
          {members.map((m) => {
            const canManage = myLevel > level(m.role);
            const open = openTasksBy[m.user.id] || 0;
            return (
              <div
                key={m.user.id}
                className="glass-surface rounded-[16px] p-[16px] flex flex-col gap-[12px]"
              >
                <div className="flex items-center gap-[11px]">
                  <div className="w-[38px] h-[38px] rounded-[12px] bg-[linear-gradient(140deg,#8fbbe4,var(--new-btn-primary))] flex items-center justify-center text-[14px] font-[700] text-white shrink-0">
                    {displayName(m).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-[600] truncate">
                      {displayName(m)}
                    </div>
                    <div className="text-[11.5px] text-textItemBlur truncate">
                      {m.user.email}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      'px-[8px] py-[3px] rounded-full text-[10.5px] font-[600] uppercase tracking-wide shrink-0',
                      ROLE_STYLE[m.role] || ROLE_STYLE.USER
                    )}
                  >
                    {productRoleLabel(m.role)}
                  </span>
                </div>

                <div className="text-[11.5px] text-textItemBlur">
                  {open
                    ? `${open} ${t('open_tasks', 'open tasks')}`
                    : t('no_open_tasks', 'No open tasks')}
                </div>

                {canManage ? (
                  <div className="flex items-center gap-[12px]">
                    {(m.role === 'USER' || m.role === 'CLIENT') && (
                      <button
                        onClick={editAccess(m.user.id)}
                        className="text-[11.5px] text-btnPrimary hover:underline"
                      >
                        {t('edit_access', 'Edit access')}
                      </button>
                    )}
                    <button
                      onClick={remove(m)}
                      className="text-[11.5px] text-textItemBlur hover:text-[#e2685f]"
                    >
                      {t('remove', 'Remove')}
                    </button>
                  </div>
                ) : (
                  <div className="text-[11.5px] text-textItemBlur">
                    {m.user.id === user?.id
                      ? t('this_is_you', 'This is you')
                      : t(
                          'cannot_manage_member',
                          'You cannot manage this member'
                        )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeamComponent;
