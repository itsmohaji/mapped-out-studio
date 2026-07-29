'use client';

import React, { FC, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface CampaignOption {
  id: string;
  name: string;
  status: string;
  color?: string | null;
}

/**
 * Attach the post to a campaign AT CREATION TIME. Without this the only way to
 * put a post in a campaign was to create it first and go attach it from the
 * campaigns page — backwards for anyone actually planning a campaign.
 *
 * Deliberately independent of the DBU association: a post can belong to a
 * campaign with or without a DBU client.
 */
export const CampaignSelect: FC<{
  value?: string;
  onChange: (id: string) => void;
}> = ({ value, onChange }) => {
  const t = useT();
  const fetch = useFetch();

  const load = useCallback(async () => {
    // Archived campaigns are history — never offer them for new content.
    const all: CampaignOption[] = await (await fetch('/campaigns')).json();
    return (all || []).filter((c) => c.status !== 'archived');
  }, []);

  const { data: campaigns } = useSWR<CampaignOption[]>(
    'composer-campaigns',
    load,
    { revalidateOnFocus: false, fallbackData: [] }
  );

  // Nothing to pick yet — don't show an empty control.
  if (!campaigns?.length) return null;

  const active = campaigns.find((c) => c.id === value);

  return (
    <div className="flex items-center gap-[10px] flex-wrap">
      <div className="text-[11px] font-[600] uppercase tracking-wider text-textItemBlur">
        {t('campaign', 'Campaign')}
      </div>
      {active?.color && (
        <div
          className="w-[9px] h-[9px] rounded-full shrink-0"
          style={{ backgroundColor: active.color }}
        />
      )}
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-[180px] bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[12px] py-[8px] text-[13px] text-newTextColor outline-none focus:border-btnPrimary"
      >
        <option value="">{t('no_campaign', 'No campaign')}</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default CampaignSelect;
