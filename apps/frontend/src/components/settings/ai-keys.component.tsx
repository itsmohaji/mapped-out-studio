'use client';

import React, { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';

type Provider = 'openai' | 'nano_banana';
interface ProviderStatus {
  configured: boolean;
  last4?: string;
}
type StatusResponse = Record<Provider, ProviderStatus>;

const useAiKeys = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/settings/ai-keys')).json();
  }, []);
  return useSWR<StatusResponse>('ai-keys', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
};

const ProviderCard = ({
  provider,
  title,
  help,
  placeholder,
  status,
  onChanged,
}: {
  provider: Provider;
  title: string;
  help: string;
  placeholder: string;
  status?: ProviderStatus;
  onChanged: () => void;
}) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const save = useCallback(
    async (apiKey: string) => {
      setSaving(true);
      try {
        const res = await fetch('/settings/ai-keys', {
          method: 'POST',
          body: JSON.stringify({ provider, apiKey }),
        });
        if (!res.ok) {
          toaster.show(t('save_failed', 'Could not save'), 'warning');
          return;
        }
        setValue('');
        onChanged();
        toaster.show(
          apiKey
            ? t('ai_key_saved', 'API key saved')
            : t('ai_key_cleared', 'API key removed'),
          'success'
        );
      } finally {
        setSaving(false);
      }
    },
    [fetch, provider, onChanged, toaster, t]
  );

  const test = useCallback(async () => {
    setTesting(true);
    try {
      const res = await fetch('/settings/ai-keys/test', {
        method: 'POST',
        body: JSON.stringify({ provider, apiKey: value || undefined }),
      });
      const data = await res.json().catch(() => ({} as any));
      toaster.show(
        data?.message || (data?.ok ? 'OK' : t('test_failed', 'Test failed')),
        data?.ok ? 'success' : 'warning'
      );
    } finally {
      setTesting(false);
    }
  }, [fetch, provider, value, toaster, t]);

  return (
    <div className="glass-surface rounded-[12px] p-[20px] flex flex-col gap-[14px]">
      <div className="flex items-center justify-between gap-[12px]">
        <div>
          <div className="text-[15px] font-[600]">{title}</div>
          <div className="text-[12px] text-textItemBlur mt-[2px]">{help}</div>
        </div>
        <div className="text-[12px] shrink-0">
          {status?.configured ? (
            <span className="text-green-400">
              {t('ai_key_set', 'Configured')} ••••{status.last4}
            </span>
          ) : (
            <span className="text-textItemBlur">{t('ai_key_not_set', 'Not set')}</span>
          )}
        </div>
      </div>

      <input
        type="password"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] text-textColor px-[16px] text-[14px] outline-none"
      />

      <div className="flex items-center gap-[10px] flex-wrap">
        <Button
          type="button"
          loading={saving}
          disabled={!value}
          onClick={() => save(value)}
        >
          {t('save', 'Save')}
        </Button>
        <Button type="button" secondary loading={testing} onClick={test}>
          {t('test_connection', 'Test')}
        </Button>
        {status?.configured && (
          <button
            type="button"
            onClick={() => save('')}
            className="text-[13px] text-red-400 hover:underline"
          >
            {t('remove', 'Remove')}
          </button>
        )}
      </div>
    </div>
  );
};

const AiKeysComponent = () => {
  const t = useT();
  const { data, mutate } = useAiKeys();

  return (
    <div className="flex flex-col gap-[16px]">
      <div>
        <div className="text-[18px] font-[600]">{t('ai_keys', 'AI Keys')}</div>
        <div className="text-[12px] text-textItemBlur mt-[3px]">
          {t(
            'ai_keys_help',
            'Keys are stored encrypted and used by the AI features across your workspace.'
          )}
        </div>
      </div>

      <ProviderCard
        provider="openai"
        title={t('openai_chatgpt', 'ChatGPT (OpenAI)')}
        help={t('openai_help', 'Powers content generation, the AI copilot and image generation.')}
        placeholder="sk-..."
        status={data?.openai}
        onChanged={mutate}
      />

      <ProviderCard
        provider="nano_banana"
        title={t('nano_banana', 'Nano Banana')}
        help={t('nano_banana_help', 'Saved securely now; live image integration is coming soon.')}
        placeholder={t('api_key', 'API key')}
        status={data?.nano_banana}
        onChanged={mutate}
      />
    </div>
  );
};

export default AiKeysComponent;
