'use client';

import React, { ReactNode, useCallback } from 'react';
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
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
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
import { Title } from '@gitroom/frontend/components/layout/title';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import { LanguageComponent } from '@gitroom/frontend/components/layout/language.component';
import { ChromeExtensionComponent } from '@gitroom/frontend/components/layout/chrome.extension.component';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';
import useCookie from 'react-use-cookie';
import { AccountMenu } from '@gitroom/frontend/components/new-layout/account.menu';
import { PreConditionComponent } from '@gitroom/frontend/components/layout/pre-condition.component';
import { AttachToFeedbackIcon } from '@gitroom/frontend/components/new-layout/sentry.feedback.component';
import { FirstBillingComponent } from '@gitroom/frontend/components/billing/first.billing.component';
import { TrialTracker } from '@gitroom/frontend/components/layout/gtm.component';
import { ClientPortal } from '@gitroom/frontend/components/new-layout/client.portal';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['600', '500', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();

  const { backendUrl, billingEnabled, isGeneral } = useVariables();

  // Feedback icon component attaches Sentry feedback to a top-bar icon when DSN is present
  const searchParams = useSearchParams();
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
                        'flex flex-col gap-[8px] shrink-0 transition-[width] duration-200',
                        isCollapsed ? 'w-[76px]' : 'w-[232px]'
                      )}
                    >
                      <div className="rounded-[16px] bg-[var(--glass-surface)] backdrop-blur-xl border border-[var(--glass-border)] py-[14px] px-[12px] flex items-center justify-center">
                        <Logo withText={!isCollapsed} collapsed={isCollapsed} />
                      </div>
                      <div className="rounded-[16px] bg-[var(--glass-surface)] backdrop-blur-xl border border-[var(--glass-border)] p-[8px]">
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
                      <div className="flex-1 rounded-[16px] bg-[var(--glass-surface)] backdrop-blur-xl border border-[var(--glass-border)] py-[12px] px-[10px] overflow-y-auto no-scrollbar">
                        <TopMenu group="first" collapsed={isCollapsed} />
                      </div>
                      <div className="rounded-[16px] bg-[var(--glass-surface)] backdrop-blur-xl border border-[var(--glass-border)] py-[10px] px-[10px]">
                        <TopMenu group="second" collapsed={isCollapsed} />
                      </div>
                    </div>
                    <div className="flex-1 bg-[var(--glass-surface)] backdrop-blur-xl rounded-[16px] overflow-hidden flex flex-col gap-[1px] blurMe border border-[var(--glass-border)]">
                      <div className="flex bg-[var(--glass-surface)] backdrop-blur-xl h-[74px] px-[22px] items-center border-b border-[var(--glass-border)]">
                        <div className="text-[24px] font-[600] flex flex-1">
                          <Title />
                        </div>
                        <div className="flex gap-[20px] text-textItemBlur">
                          <StreakComponent />
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <OrganizationSelector />
                          <ChromeExtensionComponent />
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <AttachToFeedbackIcon />
                          <NotificationComponent />
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <AccountMenu />
                        </div>
                      </div>
                      <div className="flex flex-1 gap-[1px]">{children}</div>
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
