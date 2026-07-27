'use client';

import { useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AnalyticsOverview } from '@gitroom/frontend/components/platform-analytics/overview.analytics';
import { PlatformAnalytics } from '@gitroom/frontend/components/platform-analytics/platform.analytics';

export const AnalyticsTabs = () => {
  const t = useT();
  const [view, setView] = useState<'overview' | 'channel'>('overview');

  const tab = (key: 'overview' | 'channel', label: string) => (
    <button
      type="button"
      onClick={() => setView(key)}
      className={`px-[14px] py-[7px] rounded-[8px] text-[13px] font-[600] transition-colors ${
        view === key ? 'bg-forth text-white' : 'text-textItemBlur hover:text-primary'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-[20px] flex-1">
      <div className="flex items-center gap-[4px] p-[3px] rounded-[10px] glass-surface w-fit">
        {tab('overview', t('overview', 'Overview'))}
        {tab('channel', t('by_channel', 'By channel'))}
      </div>
      {view === 'overview' ? <AnalyticsOverview /> : <PlatformAnalytics />}
    </div>
  );
};

export default AnalyticsTabs;
