'use client';

import React, { ReactNode, useCallback } from 'react';
import { mutate } from 'swr';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useTaskReminders } from '@gitroom/frontend/components/tasks/use-task-reminders';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { Plus_Jakarta_Sans } from 'next/font/google';
const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR, { mutate as globalMutate } from 'swr';
import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { ShowMediaBoxModal } from '@gitroom/frontend/components/media/media.component';
import { ShowLinkedinCompany } from '@gitroom/frontend/components/launches/helpers/linkedin.component';
import { MediaSettingsLayout } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { ShowPostSelector } from '@gitroom/frontend/components/post-url-selector/post.url.selector';
import { NewSubscription } from '@gitroom/frontend/components/layout/new.subscription';
import { Support } from '@gitroom/frontend/components/layout/support';
import { ContinueProvider } from '@gitroom/frontend/components/layout/continue.provider';
import { ContextWrapper } from '@gitroom/frontend/components/layout/user.context';
import { CopilotKit } from '@copilotkit/react-core';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Impersonate } from '@gitroom/frontend/components/layout/impersonate';
import { AnnouncementBanner } from '@gitroom/frontend/components/layout/announcement.banner';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { TaskForm } from '@gitroom/frontend/components/tasks/task-form';
import { LanguageComponent } from '@gitroom/frontend/components/layout/language.component';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import useCookie from 'react-use-cookie';
import { AccountMenu } from '@gitroom/frontend/components/new-layout/account.menu';
import { PreConditionComponent } from '@gitroom/frontend/components/layout/pre-condition.component';
import { FirstBillingComponent } from '@gitroom/frontend/components/billing/first.billing.component';
import { TrialTracker } from '@gitroom/frontend/components/layout/gtm.component';
import { ClientPortal } from '@gitroom/frontend/components/new-layout/client.portal';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['600', '500', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const t = useT();
  const fetch = useFetch();
  const modals = useModals();
  // App-wide watcher: notifies when a task/reminder time arrives.
  useTaskReminders();

  const { backendUrl, billingEnabled, isGeneral } = useVariables();

  // Feedback icon component attaches Sentry feedback to a top-bar icon when DSN is present
  const searchParams = useSearchParams();
  const router = useRouter();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: user, mutate } = useSWR('/user/self', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });

  // After creating from the top bar, refresh every task view (page, badge,
  // dashboard card, reminder watcher) and take the user to the board so the
  // new item is actually visible — otherwise the button feels like a no-op.
  const afterTaskSaved = useCallback(() => {
    // Global mutate — the key-filter form. The `mutate` bound to '/user/self'
    // would have treated this function as that key's data updater instead.
    globalMutate(
      (key: any) => typeof key === 'string' && key.startsWith('/tasks')
    );
    router.push('/tasks');
  }, [router]);

  const openAddTask = useCallback(() => {
    modals.openModal({
      title: t('add_task', 'Add Task'),
      withCloseButton: true,
      classNames: { modal: 'bg-newBgColorInner text-newTextColor' },
      children: <TaskForm onSaved={afterTaskSaved} />,
    });
  }, [modals, t, afterTaskSaved]);

  const openSetReminder = useCallback(() => {
    modals.openModal({
      title: t('set_reminder', 'Set Reminder'),
      withCloseButton: true,
      classNames: { modal: 'bg-newBgColorInner text-newTextColor' },
      children: <TaskForm compact onSaved={afterTaskSaved} />,
    });
  }, [modals, t, afterTaskSaved]);

  const [collapsed, setCollapsed] = useCookie('navCollapsed', '0');
  const isCollapsed = collapsed === '1';

  if (!user) return null;

  // Clients get the dedicated Client Portal (review/approve/comment), scoped to
  // their assigned channels — never the manager UI. (Backend also locks them down.)
  if (user.role === 'CLIENT' && !user.admin) {
    return (
      <ContextWrapper user={user}>
        <MantineWrapper>
          <Toaster />
          <ClientPortal />
        </MantineWrapper>
      </ContextWrapper>
    );
  }

  return (
    <ContextWrapper user={user}>
      <CopilotKit
        credentials="include"
        runtimeUrl={backendUrl + '/copilot/chat'}
        showDevConsole={false}
      >
        <MantineWrapper>
          <ToolTip />
          <Toaster />
          <TrialTracker />
          <CheckPayment check={searchParams.get('check') || ''} mutate={mutate}>
            <ShowMediaBoxModal />
            <ShowLinkedinCompany />
            <MediaSettingsLayout />
            <ShowPostSelector />
            <PreConditionComponent />
            <NewSubscription />
            <ContinueProvider />
            <div
              className={clsx(
                'flex flex-col min-h-screen min-w-screen text-newTextColor p-[12px]',
                jakartaSans.className
              )}
            >
              <div>{user?.admin ? <Impersonate /> : <div />}</div>
              {user.tier === 'FREE' && isGeneral && billingEnabled ? (
                <FirstBillingComponent />
              ) : (
                <>
                  <AnnouncementBanner />
                  <div className="flex-1 flex gap-[8px]">
                    <Support />
                    <div
                      id="left-menu"
                      className={clsx(
                        'flex flex-col gap-[6px] shrink-0 transition-[width] duration-200',
                        isCollapsed ? 'w-[50px]' : 'w-[220px]'
                      )}
                    >
                      <div className="flex items-center justify-center h-[46px] px-[6px]">
                        <Logo withText={!isCollapsed} collapsed={isCollapsed} />
                      </div>
                      <div className="rounded-[14px] glass-surface p-[5px]">
                        <button
                          type="button"
                          onClick={() => setCollapsed(isCollapsed ? '0' : '1')}
                          title="Toggle menu"
                          className="w-full h-[40px] rounded-[10px] flex items-center justify-center text-textItemBlur hover:text-textItemFocused hover:bg-[var(--glass-hover)] transition-colors"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M3 6h18M3 12h18M3 18h18" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex-1 rounded-[18px] glass-surface py-[6px] px-[4px] overflow-y-auto no-scrollbar">
                        <TopMenu group="first" collapsed={isCollapsed} />
                      </div>
                      <div className="rounded-[14px] glass-surface p-[5px]">
                        <TopMenu group="second" collapsed={isCollapsed} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-[8px] blurMe">
                      <div className="flex h-[60px] items-center gap-[12px] shrink-0 px-[2px]">
                        {/* Search — approved-artifact command bar (left) */}
                        <button
                          type="button"
                          onClick={() => router.push('/launches')}
                          className="flex items-center gap-[9px] flex-1 max-w-[420px] h-[42px] px-[15px] rounded-[13px] glass-surface text-textItemBlur hover:text-textItemFocused transition-colors"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m21 21-4-4" strokeLinecap="round" />
                          </svg>
                          <span className="text-[12.5px]">{t('search_anything', 'Search anything…')}</span>
                          <kbd className="ms-auto text-[10px] px-[6px] py-[2px] rounded-[5px] bg-[var(--glass-2)] border border-[var(--gline)]">
                            ⌘K
                          </kbd>
                        </button>

                        <div className="flex-1" />

                        {/* Actions + account (right) */}
                        <div className="flex items-center gap-[9px] text-textItemBlur">
                          <button
                            type="button"
                            onClick={openSetReminder}
                            className="hidden xl:inline-flex items-center gap-[7px] h-[40px] px-[14px] rounded-[13px] glass-surface text-[12px] font-[600] text-textItemBlur hover:text-textItemFocused transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <circle cx="12" cy="12" r="9" />
                              <path d="M12 8v4l3 2" strokeLinecap="round" />
                            </svg>
                            {t('set_reminder', 'Set Reminder')}
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push('/launches')}
                            className="inline-flex items-center gap-[7px] h-[40px] px-[14px] rounded-[13px] bg-btnPrimary text-white text-[12px] font-[600] hover:brightness-110 transition"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <rect x="3" y="4" width="18" height="17" rx="2" />
                              <path d="M3 9h18M8 2v4M16 2v4" />
                            </svg>
                            {t('schedule_post', 'Schedule Post')}
                          </button>
                          <button
                            type="button"
                            onClick={openAddTask}
                            className="hidden md:inline-flex items-center gap-[7px] h-[40px] px-[14px] rounded-[13px] glass-surface text-[12px] font-[600] text-textItemBlur hover:text-textItemFocused transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                              <circle cx="12" cy="12" r="9" />
                              <path d="M12 8v8M8 12h8" strokeLinecap="round" />
                            </svg>
                            {t('add_task', 'Add Task')}
                          </button>
                          <ModeComponent />
                          <OrganizationSelector />
                          <NotificationComponent />
                          <AccountMenu />
                        </div>
                      </div>
                      {/* Real gap between panels. It was gap-[1px], which read
                          as a hairline seam between two square-cornered blocks
                          instead of separate rounded cards. */}
                      <div className="flex flex-1 gap-[14px] min-h-0">{children}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CheckPayment>
        </MantineWrapper>
      </CopilotKit>
    </ContextWrapper>
  );
};
