'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { orderBy } from 'lodash';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { ChartSocial } from '@gitroom/frontend/components/analytics/chart-social';
import SafeImage from '@gitroom/react/helpers/safe.image';
import {
  Aggregate,
  ChannelBlock,
  aggregateEngagement,
  aggregateFollowers,
  aggregateMetric,
  postingHeatmap,
  reportedChange,
} from '@gitroom/helpers/utils/analytics.aggregate';

// Only these platforms expose an analytics API at all.
const ANALYTICS_PLATFORMS = [
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

const DATE_OPTIONS = [7, 30, 90];

const fmt = (n: number) => new Intl.NumberFormat().format(Math.round(n));

const MetricTile: FC<{
  label: string;
  agg: Aggregate;
  change: number | null;
  color: 'blue' | 'green' | 'purple';
  t: (k: string, d: string) => string;
}> = ({ label, agg, change, color, t }) => (
  <div className="glass-surface rounded-[18px] p-[16px] flex flex-col gap-[8px] min-w-0">
    <div className="flex items-center gap-[8px]">
      <div className="text-[11px] font-[600] text-textItemBlur flex-1 truncate">
        {label}
      </div>
      {change !== null && (
        <div
          className={`text-[11px] font-[600] tabular-nums ${
            change >= 0 ? 'text-[#47b985]' : 'text-[#e2685f]'
          }`}
        >
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
        </div>
      )}
    </div>
    <div className="text-[25px] font-[600] tabular-nums leading-none">
      {agg.value === null ? '—' : fmt(agg.value)}
    </div>
    {agg.series.length > 1 && (
      <div className="h-[40px] -mx-[4px]">
        <ChartSocial data={agg.series} color={color} />
      </div>
    )}
    <div className="text-[11px] text-textItemBlur">
      {agg.value === null
        ? t('not_reported', 'Not reported by your channels')
        : `${t('across', 'Across')} ${agg.reporting}/${agg.total} ${t(
            'channels_lower',
            'channels'
          )}`}
    </div>
  </div>
);

const Heatmap: FC<{ grid: number[][]; t: (k: string, d: string) => string }> = ({
  grid,
  t,
}) => {
  const max = useMemo(
    () => Math.max(1, ...grid.flatMap((row) => row)),
    [grid]
  );
  const days = [
    t('sun', 'Sun'),
    t('mon', 'Mon'),
    t('tue', 'Tue'),
    t('wed', 'Wed'),
    t('thu', 'Thu'),
    t('fri', 'Fri'),
    t('sat', 'Sat'),
  ];
  return (
    <div className="p-[14px] overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="flex gap-[3px] ps-[34px] mb-[4px]">
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="flex-1 text-[8px] text-textItemBlur text-center tabular-nums"
            >
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {grid.map((row, d) => (
          <div key={d} className="flex gap-[3px] items-center mb-[3px]">
            <div className="w-[34px] text-[10px] text-textItemBlur shrink-0">
              {days[d]}
            </div>
            {row.map((count, h) => (
              <div
                key={h}
                title={`${days[d]} ${h}:00 — ${count}`}
                className="flex-1 aspect-square rounded-[3px] min-w-[10px]"
                style={{
                  backgroundColor: count
                    ? `rgba(107,163,218,${0.15 + (count / max) * 0.85})`
                    : 'var(--new-bgLineColor)',
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const AudiencePerformance: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const { disableXAnalytics } = useVariables();
  const [date, setDate] = useState(7);

  const load = useCallback(async (): Promise<ChannelBlock[]> => {
    const list = (
      await (await fetch('/integrations/list')).json()
    ).integrations
      .filter((f: any) => !(f.identifier === 'x' && disableXAnalytics))
      .filter((f: any) => ANALYTICS_PLATFORMS.includes(f.identifier));

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

  const { data: blocks, isLoading } = useSWR(
    `dashboard-analytics-${date}`,
    load,
    { revalidateOnFocus: false, revalidateOnReconnect: false, fallbackData: [] }
  );

  // Top posts, from whichever channels actually implement it.
  const loadTop = useCallback(async () => {
    const eligible = (blocks || []).filter((b) => !b.integration.disabled);
    const all = await Promise.all(
      eligible.map(async (b) => {
        try {
          const res = await (
            await fetch(`/analytics/${b.integration.id}/posts?date=${date}`)
          ).json();
          return (res?.posts || []).map((p: any) => ({
            ...p,
            _integration: b.integration,
          }));
        } catch {
          return [];
        }
      })
    );
    return orderBy(
      all.flat(),
      [(p: any) => p?.metrics?.reach || p?.metrics?.likes || 0],
      ['desc']
    ).slice(0, 5);
  }, [blocks, date]);

  const { data: topPosts } = useSWR(
    blocks?.length ? `dashboard-top-posts-${date}-${blocks.length}` : null,
    loadTop,
    { revalidateOnFocus: false, fallbackData: [] }
  );

  // The heatmap is our OWN publish history — real rows, not a platform guess.
  const loadPublished = useCallback(async () => {
    const res = await (
      await fetch('/posts/list?state=published&page=0&limit=100')
    ).json();
    const { expandPostsList } = await import(
      '@gitroom/helpers/utils/posts.list.minify'
    );
    return expandPostsList(res);
  }, []);
  const { data: publishedData } = useSWR('dashboard-published', loadPublished, {
    revalidateOnFocus: false,
  });

  const heat = useMemo(
    () => postingHeatmap(publishedData?.posts || []),
    [publishedData]
  );
  const totalPublished = publishedData?.posts?.length || 0;

  const reach = useMemo(() => aggregateMetric(blocks || [], 'reach'), [blocks]);
  const engagement = useMemo(() => aggregateEngagement(blocks || []), [blocks]);
  const followers = useMemo(() => aggregateFollowers(blocks || []), [blocks]);

  if (!isLoading && (blocks?.length || 0) === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center gap-[10px] flex-wrap">
        <div className="text-[13px] font-[600] flex-1">
          {t('audience_performance', 'Audience & performance')}
        </div>
        <div className="flex items-center gap-[3px] p-[3px] rounded-[10px] glass-surface">
          {DATE_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={`px-[10px] py-[5px] rounded-[8px] text-[12px] font-[600] transition-colors ${
                date === d
                  ? 'bg-forth text-white'
                  : 'text-textItemBlur hover:text-primary'
              }`}
            >
              {d}
              {t('days_short', 'd')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[12px]">
        <MetricTile
          label={t('reach', 'Reach')}
          agg={reach}
          change={reportedChange(blocks || [], 'reach')}
          color="green"
          t={t}
        />
        <MetricTile
          label={t('engagement', 'Engagement')}
          agg={engagement}
          change={null}
          color="blue"
          t={t}
        />
        <MetricTile
          label={t('followers', 'Followers')}
          agg={followers}
          change={reportedChange(blocks || [], 'followers')}
          color="purple"
          t={t}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[12px] items-start">
        <div className="glass-surface rounded-[16px] overflow-hidden">
          <div className="px-[16px] py-[12px] border-b border-newTableBorder flex items-center gap-[8px]">
            <div className="text-[13px] font-[600] flex-1">
              {t('top_performing', 'Top performing')}
            </div>
            <div className="text-[11px] text-textItemBlur">
              {t('last_n_days', 'Last')} {date}
              {t('days_short', 'd')}
            </div>
          </div>
          {!topPosts?.length ? (
            <div className="px-[16px] py-[26px] text-[12.5px] text-textItemBlur">
              {t(
                'no_top_posts',
                'No post insights yet — your channels return these once posts have data.'
              )}
            </div>
          ) : (
            <div className="divide-y divide-newTableBorder">
              {topPosts.map((p: any) => (
                <a
                  key={p.id}
                  href={p.permalink || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-[10px] px-[14px] py-[10px] hover:bg-boxHover transition-colors"
                >
                  <div className="w-[38px] h-[38px] rounded-[9px] overflow-hidden bg-newBgLineColor shrink-0">
                    {p.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] truncate">
                      {p.caption || t('no_caption', 'No caption')}
                    </div>
                    <div className="text-[11px] text-textItemBlur flex items-center gap-[6px]">
                      <SafeImage
                        src={`/icons/platforms/${p._integration?.identifier}.png`}
                        className="w-[11px] h-[11px] rounded-[3px]"
                        alt=""
                      />
                      <span className="truncate">{p._integration?.name}</span>
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="text-[13px] font-[600] tabular-nums">
                      {fmt(p?.metrics?.reach || p?.metrics?.likes || 0)}
                    </div>
                    <div className="text-[10px] text-textItemBlur">
                      {p?.metrics?.reach
                        ? t('reach', 'Reach')
                        : t('likes', 'Likes')}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="glass-surface rounded-[16px] overflow-hidden">
          <div className="px-[16px] py-[12px] border-b border-newTableBorder flex items-center gap-[8px]">
            <div className="text-[13px] font-[600] flex-1">
              {t('posting_pattern', 'Your posting pattern')}
            </div>
            <div className="text-[11px] text-textItemBlur">
              {totalPublished} {t('published_lower', 'published')}
            </div>
          </div>
          {totalPublished === 0 ? (
            <div className="px-[16px] py-[26px] text-[12.5px] text-textItemBlur">
              {t('no_published_yet', 'Nothing published yet.')}
            </div>
          ) : (
            <Heatmap grid={heat} t={t} />
          )}
        </div>
      </div>
    </div>
  );
};

export default AudiencePerformance;
