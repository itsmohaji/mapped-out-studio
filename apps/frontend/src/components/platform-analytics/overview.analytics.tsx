'use client';

import useSWR from 'swr';
import { useCallback, useMemo, useState } from 'react';
import { orderBy } from 'lodash';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { ChartSocial } from '@gitroom/frontend/components/analytics/chart-social';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

const allowedIntegrations = [
  'facebook',
  'instagram',
  'instagram-standalone',
  'linkedin-page',
  'tiktok',
  'youtube',
  'gmb',
  'pinterest',
  'threads',
  'x',
];

interface MetricItem {
  label: string;
  data: Array<{ total: number; date: string }>;
  average?: number;
  percentageChange?: number;
  available?: boolean;
}
interface ChannelBlock {
  integration: any;
  data: MetricItem[] | null;
}

// Same headline math as the per-channel view (render.analytics), so numbers match:
// sum the series; if it's an "average" metric, divide by count and show a percentage.
const headlineNumber = (item: MetricItem): number => {
  const sum = (item.data || []).reduce((a, c) => a + Number(c.total || 0), 0);
  return sum / (item.average ? item.data.length || 1 : 1);
};
const headline = (item: MetricItem): string => {
  const value = headlineNumber(item);
  return item.average
    ? value.toFixed(2) + '%'
    : new Intl.NumberFormat().format(Math.round(value));
};

// Current follower count = the latest point of a follower-type metric (NOT summed).
const followerCount = (data: MetricItem[] | null): number | null => {
  if (!data) return null;
  const f = data.find((m) => /follow|subscriber|fan/i.test(m.label));
  if (!f || !f.data?.length) return null;
  return Number(f.data[f.data.length - 1].total || 0);
};

const DATE_OPTIONS = [7, 30, 90];

const StatTile = ({ label, value }: { label: string; value: string }) => (
  <div className="glass-surface rounded-[16px] px-[18px] py-[16px] flex flex-col gap-[4px]">
    <div className="text-[12px] text-textItemBlur">{label}</div>
    <div className="text-[26px] font-[600] leading-tight">{value}</div>
  </div>
);

const ChannelCard = ({ block }: { block: ChannelBlock }) => {
  const t = useT();
  const { integration, data } = block;
  const metrics = (data || []).filter((m) => m.available !== false).slice(0, 3);

  return (
    <div className="glass-surface rounded-[18px] overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-[2px] hover:shadow-[0_12px_36px_-12px_rgba(107,163,218,0.35)]">
      <div className="flex items-center gap-[10px] px-[16px] pt-[14px] pb-[10px]">
        <div className="relative w-[34px] h-[34px] shrink-0">
          <ImageWithFallback
            fallbackSrc={`/icons/platforms/${integration.identifier}.png`}
            src={integration.picture}
            className="w-[34px] h-[34px] rounded-full object-cover"
            alt={integration.identifier}
            width={34}
            height={34}
          />
          <div className="absolute -bottom-[2px] -end-[2px] w-[16px] h-[16px] rounded-full bg-newBgColorInner flex items-center justify-center">
            <SafeImage
              src={`/icons/platforms/${integration.identifier}.png`}
              className="w-[12px] h-[12px]"
              alt={integration.identifier}
            />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-[600] truncate">{integration.name}</div>
          <div className="text-[11px] text-textItemBlur capitalize">
            {integration.identifier?.replace('-', ' ')}
          </div>
        </div>
      </div>

      {integration.disabled ? (
        <div className="px-[16px] py-[24px] text-[13px] text-orange-300">
          {t('reconnect_needed', 'Reconnect needed')}
        </div>
      ) : metrics.length === 0 ? (
        <div className="px-[16px] py-[24px] text-[13px] text-textItemBlur">
          {t('no_analytics_yet', 'No analytics available yet.')}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-newTableBorder">
          {metrics.map((m, i) => (
            <div
              key={`${integration.id}-${m.label}-${i}`}
              className="flex items-center justify-between gap-[10px] px-[16px] py-[10px]"
            >
              <div className="min-w-0">
                <div className="text-[12px] text-textItemBlur truncate">{m.label}</div>
                <div className="text-[18px] font-[600]">{headline(m)}</div>
              </div>
              {m.data?.length > 1 && (
                <div className="w-[110px] h-[38px] shrink-0">
                  <ChartSocial
                    data={m.data}
                    color={(['purple', 'green', 'blue'] as const)[i % 3]}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AnalyticsOverview = () => {
  const fetch = useFetch();
  const t = useT();
  const { disableXAnalytics } = useVariables();
  const [date, setDate] = useState(7);

  const load = useCallback(async (): Promise<ChannelBlock[]> => {
    const list = (await (await fetch('/integrations/list')).json()).integrations
      .filter((f: any) => !(f.identifier === 'x' && disableXAnalytics))
      .filter((f: any) => allowedIntegrations.includes(f.identifier));

    return Promise.all(
      orderBy(list, ['disabled'], ['asc']).map(async (integration: any) => {
        if (integration.disabled) return { integration, data: null };
        try {
          const res = await (
            await fetch(`/analytics/${integration.id}?date=${date}`)
          ).json();
          return { integration, data: Array.isArray(res) ? res : null };
        } catch {
          return { integration, data: null };
        }
      })
    );
  }, [date, disableXAnalytics]);

  const { data: blocks, isLoading } = useSWR(`overview-analytics-${date}`, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    fallbackData: [],
  });

  const totals = useMemo(() => {
    const channels = blocks?.length || 0;
    const active = (blocks || []).filter((b) => !b.integration.disabled).length;
    let followers = 0;
    let followerChannels = 0;
    for (const b of blocks || []) {
      const c = followerCount(b.data);
      if (c !== null) {
        followers += c;
        followerChannels += 1;
      }
    }
    return { channels, active, followers, followerChannels };
  }, [blocks]);

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex items-center justify-between gap-[12px] flex-wrap">
        <div>
          <div className="text-[20px] font-[600]">{t('overview', 'Overview')}</div>
          <div className="text-[12px] text-textItemBlur">
            {t('overview_help', 'All connected channels at a glance.')}
          </div>
        </div>
        <div className="flex items-center gap-[4px] p-[3px] rounded-[10px] glass-surface">
          {DATE_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={`px-[12px] py-[6px] rounded-[8px] text-[13px] font-[500] transition-colors ${
                date === d ? 'bg-forth text-white' : 'text-textItemBlur hover:text-primary'
              }`}
            >
              {d}
              {t('days_short', 'd')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[12px]">
        <StatTile label={t('channels_connected', 'Channels connected')} value={String(totals.channels)} />
        <StatTile label={t('active_channels', 'Active')} value={String(totals.active)} />
        <StatTile
          label={t('total_followers', 'Total followers')}
          value={
            totals.followerChannels
              ? new Intl.NumberFormat().format(totals.followers)
              : '—'
          }
        />
      </div>

      {isLoading ? (
        <LoadingComponent />
      ) : (blocks?.length || 0) === 0 ? (
        <div className="text-[14px] text-textItemBlur py-[24px]">
          {t('no_channels_connected', 'No channels connected yet.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[16px]">
          {blocks!.map((b) => (
            <ChannelCard key={b.integration.id} block={b} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AnalyticsOverview;
