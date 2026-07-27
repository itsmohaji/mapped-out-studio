'use client';

import React, { useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import AiKeysComponent from '@gitroom/frontend/components/settings/ai-keys.component';
import { PublicComponent } from '@gitroom/frontend/components/public-api/public.component';

// One clean "API & Keys" section that holds both the AI provider keys and the
// public API / developer settings, split into sub-tabs.
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
          {subTab('ai_keys', t('ai_keys', 'AI Keys'))}
          {subTab('api', t('developers', 'API & Developers'))}
        </div>
      )}
      {showAiKeys && (sub === 'ai_keys' || !showApi) && <AiKeysComponent />}
      {showApi && (sub === 'api' || !showAiKeys) && <PublicComponent />}
    </div>
  );
};

export default ApiAndKeysComponent;
