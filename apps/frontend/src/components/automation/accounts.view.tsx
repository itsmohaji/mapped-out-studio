'use client';

import React, { FC } from 'react';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';
import {
  Glass,
  HealthDot,
  PLATFORM_ICON,
  PLATFORM_TINT,
  PageHeader,
  EmptyState,
  Skeleton,
  timeAgo,
} from './automation.ui';

export interface AutomationAccount {
  integrationId: string;
  name: string;
  picture?: string | null;
  username?: string | null;
  provider: string;
  channel: string;
  customerId?: string | null;
  customerName?: string | null;
  automations: number;
  activeAutomations: number;
  lastRunAt?: string | null;
  automatable: boolean;
  unavailableReason?: string | null;
  health: string;
}

const AccountCard: FC<{
  account: AutomationAccount;
  onOpen: () => void;
  onNew: () => void;
}> = ({ account, onOpen, onNew }) => {
  const icon = PLATFORM_ICON[account.channel] ?? '🔗';
  const tint = PLATFORM_TINT[account.channel] ?? 'from-white/10 to-white/[0.02]';

  return (
    <Glass
      hoverable={account.automatable}
      onClick={account.automatable ? onOpen : undefined}
      className={clsx('p-[20px] flex flex-col gap-[16px]', !account.automatable && 'opacity-55')}
    >
      <div className="flex items-start gap-[13px]">
        <div className="relative shrink-0">
          <div
            className={clsx(
              'w-[46px] h-[46px] rounded-[13px] overflow-hidden bg-gradient-to-br',
              tint,
              'flex items-center justify-center'
            )}
          >
            {account.picture ? (
              <SafeImage
                src={account.picture}
                alt={account.name}
                width={46}
                height={46}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[19px]">{icon}</span>
            )}
          </div>
          <span className="absolute -bottom-[3px] -right-[3px] w-[19px] h-[19px] rounded-full bg-customColor2 border border-white/10 flex items-center justify-center text-[10px]">
            {icon}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] font-[600] truncate leading-tight">{account.name}</div>
          {!!account.username && (
            <div className="text-[12px] text-textItemBlur truncate mt-[2px]">
              @{account.username}
            </div>
          )}
          {!!account.customerName && (
            <div className="text-[11px] text-textItemBlur/70 truncate mt-[3px]">
              {account.customerName}
            </div>
          )}
        </div>
      </div>

      {account.automatable ? (
        <>
          <div className="flex items-center gap-[18px]">
            <div>
              <div className="text-[19px] font-[600] leading-none tabular-nums">
                {account.automations}
              </div>
              <div className="text-[11px] text-textItemBlur mt-[4px]">
                {account.automations === 1 ? 'Automation' : 'Automations'}
                {account.activeAutomations > 0 && (
                  <span className="text-[#47b985]"> · {account.activeAutomations} live</span>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-[500] truncate">{timeAgo(account.lastRunAt)}</div>
              <div className="text-[11px] text-textItemBlur mt-[4px]">Last run</div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-[14px] border-t border-white/[0.06]">
            <HealthDot health={account.health} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNew();
              }}
              className="text-[12px] font-[500] px-[12px] py-[6px] rounded-[8px] border border-white/[0.1] hover:border-btnPrimary hover:text-btnPrimary transition-colors"
            >
              + New
            </button>
          </div>
        </>
      ) : (
        <div className="pt-[12px] border-t border-white/[0.06]">
          <HealthDot health="unsupported" />
          <p className="text-[11.5px] text-textItemBlur mt-[8px] leading-[1.5]">
            {account.unavailableReason}
          </p>
        </div>
      )}
    </Glass>
  );
};

export const AccountsView: FC<{
  accounts?: AutomationAccount[];
  loading: boolean;
  onOpen: (a: AutomationAccount) => void;
  onNew: (a: AutomationAccount) => void;
}> = ({ accounts, loading, onOpen, onNew }) => {
  const supported = (accounts ?? []).filter((a) => a.automatable);
  const rest = (accounts ?? []).filter((a) => !a.automatable);

  return (
    <div className="flex flex-col gap-[26px]">
      <PageHeader
        title="Automation"
        subtitle="Pick an account to set up replies, collect leads and route conversations — automatically."
      />

      {loading && (
        <div className="grid gap-[16px] grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[190px]" />
          ))}
        </div>
      )}

      {!loading && !accounts?.length && (
        <Glass className="p-[10px]">
          <EmptyState
            icon="🔗"
            title="No accounts connected yet"
            body="Connect a social account first — Automation works on top of the channels you have already added."
          />
        </Glass>
      )}

      {!!supported.length && (
        <div className="grid gap-[16px] grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {supported.map((a) => (
            <AccountCard
              key={a.integrationId}
              account={a}
              onOpen={() => onOpen(a)}
              onNew={() => onNew(a)}
            />
          ))}
        </div>
      )}

      {!!rest.length && (
        <div className="flex flex-col gap-[12px]">
          <div className="text-[12.5px] text-textItemBlur">
            These platforms do not offer the APIs automation needs. Not a Mapped Out limitation.
          </div>
          <div className="grid gap-[16px] grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {rest.map((a) => (
              <AccountCard
                key={a.integrationId}
                account={a}
                onOpen={() => undefined}
                onNew={() => undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
