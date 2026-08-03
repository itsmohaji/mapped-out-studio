'use client';

import React, { useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AiProvidersComponent } from '@gitroom/frontend/components/settings/ai-providers.component';
import { PublicComponent } from '@gitroom/frontend/components/public-api/public.component';

// One clean "API & Keys" section holding AI Providers and the public API /
// developer settings, split into sub-tabs.
//
// showAiKeys must be the PLATFORM owner flag (user.isSuperAdmin), not org
// admin: the backend gates every /ai-providers route on isSuperAdmin, so
// showing this to an agency admin would render a tab that only returns 403s.
const ApiAndKeysComponent = ({
  showAiKeys,
  showApi,
}: {
  showAiKeys: boolean;
  showApi: boolean;
}) => {
  const t = useT();
  const [sub, setSub] = useState<'ai_keys' | 'api'>(
    showAiKeys ? 'ai_keys' : 'api'
  );
  const both = showAiKeys && showApi;

  const subTab = (key: 'ai_keys' | 'api', label: string) => (
    <button
      type="button"
      onClick={() => setSub(key)}
      className={`px-[14px] py-[7px] rounded-[8px] text-[13px] font-[600] transition-colors ${
        sub === key ? 'bg-forth text-white' : 'text-textItemBlur hover:text-primary'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-[16px]">
      {both && (
        <div className="flex items-center gap-[4px] p-[3px] rounded-[10px] glass-surface w-fit">
          {subTab('ai_keys', t('ai_providers', 'AI Providers'))}
          {subTab('api', t('developers', 'API & Developers'))}
        </div>
      )}
      {showAiKeys && (sub === 'ai_keys' || !showApi) && <AiProvidersComponent />}
      {showApi && (sub === 'api' || !showAiKeys) && <PublicComponent />}
    </div>
  );
};

export default ApiAndKeysComponent;
