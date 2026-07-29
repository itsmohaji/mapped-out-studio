'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { orderBy } from 'lodash';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { ChartSocial } from '@gitroom/frontend/components/analytics/chart-social';
import { expandPostsList } from '@gitroom/helpers/utils/posts.list.minify';
import { bestSlots, confidence } from '@gitroom/helpers/utils/best.times';
import {
  Aggregate,
  ChannelBlock,
  MetricItem,
  aggregateEngagement,
  aggregateFollowers,
  aggregateMetric,
  formatHeadline,
  postingHeatmap,
  reportedChange,
} from '@gitroom/helpers/utils/analytics.aggregate';

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

const DAY_NAMES = (t: any) => [
  t('sunday', 'Sunday'),
  t('monday', 'Monday'),
  t('tuesday', 'Tuesday'),
  t('wednesday', 'Wednesday'),
  t('thursday', 'Thursday'),
  t('friday', 'Friday'),
  t('saturday', 'Saturday'),
];

const Panel: FC<{
  title: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, sub, action, children }) => (
  <div className="glass-surface rounded-[16px] overflow-hidden flex flex-col">
    <div className="flex items-center gap-[10px] px-[16px] py-[12px] border-b border-newTableBorder">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-[600]">{title}</div>
        {sub && <div className="text-[11px] text-textItemBlur">{sub}</div>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

const Kpi: FC<{
  label: string;
  agg: Aggregate;
  change: number | null;
  color: 'blue' | 'green' | 'purple';
  t: any;
}> = ({ label, agg, change, color, t }) => (
  <div className="glass-surface rounded-[16px] p-[16px] flex flex-col gap-[8px] min-w-0">
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
    <div className="text-[24px] font-[600] tabular-nums leading-none">
      {agg.value === null ? '—' : fmt(agg.value)}
    </div>
    {agg.series.length > 1 && (
      <div className="h-[38px] -mx-[4px]">
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

const Heatmap: FC<{ grid: number[][]; t: any }> = ({ grid, t }) => {
  const max = useMemo(() => Math.max(1, ...grid.flatMap((r) => r)), [grid]);
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
      <div className="min-w-[560px]">
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
                className="flex-1 aspect-square rounded-[3px] min-w-[11px]"
                style={{
                  backgroundColor: count
                    ? `rgba(107,163,218,${0.15 + (count / max) * 0.85})`
                    : 'var(--new-bgLineColor)',
                }}
              />
            ))}
          </div>
        ))}
        <div className="flex items-center gap-[8px] mt-[10px] text-[10px] text-textItemBlur">
          <span>{t('less', 'Less')}</span>
          {[0.15, 0.4, 0.65, 0.9].map((o) => (
            <span
              key={o}
              className="w-[11px] h-[11px] rounded-[3px]"
              style={{ backgroundColor: `rgba(107,163,218,${o})` }}
            />
          ))}
          <span>{t('more', 'More')}</span>
        </div>
      </div>
    </div>
  );
};

export const ReportsComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const { disableXAnalytics } = useVariables();
  const [date, setDate] = useState(30);

  const load = useCallback(async (): Promise<ChannelBlock[]> => {
    const list = (await (await fetch('/integrations/list')).json()).integrations
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

  const { data: blocks, isLoading } = useSWR(`reports-${date}`, load, {
    revalidateOnFocus: false,
    fallbackData: [],
  });

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
    ).slice(0, 10);
  }, [blocks, date]);

  const { data: topPosts } = useSWR(
    blocks?.length ? `reports-top-${date}-${blocks.length}` : null,
    loadTop,
    { revalidateOnFocus: false, fallbackData: [] }
  );

  const loadPublished = useCallback(async () => {
    const res = await (
      await fetch('/posts/list?state=published&page=0&limit=100')
    ).json();
    return expandPostsList(res);
  }, []);
  const { data: publishedData } = useSWR('reports-published', loadPublished, {
    revalidateOnFocus: false,
  });

  const published = publishedData?.posts || [];
  const heat = useMemo(() => postingHeatmap(published), [published]);

  // Best times come from the SAME per-post insights as the top-performing list,
  // so a recommendation is always traceable to posts you can actually see.
  const best = useMemo(() => bestSlots(topPosts || []), [topPosts]);
  const conf = useMemo(() => confidence(topPosts || []), [topPosts]);

  const reach = useMemo(() => aggregateMetric(blocks || [], 'reach'), [blocks]);
  const engagement = useMemo(() => aggregateEngagement(blocks || []), [blocks]);
  const followers = useMemo(() => aggregateFollowers(blocks || []), [blocks]);

  // Per-channel rows: whatever metrics that platform actually returned.
  const rows = useMemo(
    () =>
      (blocks || []).map((b) => ({
        integration: b.integration,
        metrics: (b.data || []).filter((m) => m.available !== false),
      })),
    [blocks]
  );

  const exportCsv = useCallback(() => {
    const lines = [['Channel', 'Platform', 'Metric', 'Value'].join(',')];
    for (const r of rows) {
      if (!r.metrics.length) {
        lines.push(
          [r.integration.name, r.integration.identifier, 'no data', ''].join(',')
        );
        continue;
      }
      for (const m of r.metrics as MetricItem[]) {
        lines.push(
          [
            `"${(r.integration.name || '').replace(/"/g, '""')}"`,
            r.integration.identifier,
            `"${(m.label || '').replace(/"/g, '""')}"`,
            formatHeadline(m).replace(/,/g, ''),
          ].join(',')
        );
      }
    }
    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapped-out-report-${dayjs().format('YYYY-MM-DD')}-${date}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.show(t('report_exported', 'Report exported'));
  }, [rows, date, t]);

  return (
    <div className="flex-1 flex flex-col gap-[16px] p-[20px]">
      <div className="flex items-start gap-[12px] flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-[22px] font-[600]">{t('reports', 'Reports')}</h1>
          <p className="text-[13px] text-textItemBlur mt-[2px]">
            {t(
              'reports_sub',
              'Everything your channels reported, in one place. Nothing here is estimated.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-[3px] p-[3px] rounded-[10px] glass-surface">
          {DATE_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={`px-[12px] py-[6px] rounded-[8px] text-[12.5px] font-[600] transition-colors ${
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
        <Button onClick={exportCsv} secondary>
          {t('export_csv', 'Export CSV')}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[12px]">
        <Kpi
          label={t('reach', 'Reach')}
          agg={reach}
          change={reportedChange(blocks || [], 'reach')}
          color="green"
          t={t}
        />
        <Kpi
          label={t('engagement', 'Engagement')}
          agg={engagement}
          change={null}
          color="blue"
          t={t}
        />
        <Kpi
          label={t('followers', 'Followers')}
          agg={followers}
          change={reportedChange(blocks || [], 'followers')}
          color="purple"
          t={t}
        />
      </div>

      <Panel
        title={t('by_channel', 'By channel')}
        sub={t(
          'by_channel_sub',
          'Each platform reports different metrics — only what it returned is shown.'
        )}
      >
        {isLoading ? (
          <div className="px-[16px] py-[26px] text-[13px] text-textItemBlur">
            {t('loading', 'Loading…')}
          </div>
        ) : !rows.length ? (
          <div className="px-[16px] py-[26px] text-[13px] text-textItemBlur">
            {t(
              'no_analytics_channels',
              'No connected channel exposes an analytics API yet.'
            )}
          </div>
        ) : (
          <div className="divide-y divide-newTableBorder">
            {rows.map((r) => (
              <div
                key={r.integration.id}
                className="px-[16px] py-[12px] flex items-start gap-[12px] flex-wrap"
              >
                <div className="flex items-center gap-[9px] min-w-[180px]">
                  <SafeImage
                    src={`/icons/platforms/${r.integration.identifier}.png`}
                    className="w-[16px] h-[16px] rounded-[5px]"
                    alt=""
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-[600] truncate">
                      {r.integration.name}
                    </div>
                    <div className="text-[11px] text-textItemBlur capitalize">
                      {r.integration.identifier?.replace(/-/g, ' ')}
                    </div>
                  </div>
                </div>
                {r.integration.disabled ? (
                  <div className="text-[12.5px] text-[#daa646] flex-1">
                    {t('reconnect_needed', 'Reconnect needed')}
                  </div>
                ) : !r.metrics.length ? (
                  <div className="text-[12.5px] text-textItemBlur flex-1">
                    {t('no_analytics_yet', 'No analytics available yet.')}
                  </div>
                ) : (
                  <div className="flex-1 flex gap-[18px] flex-wrap">
                    {(r.metrics as MetricItem[]).map((m, i) => (
                      <div key={`${r.integration.id}-${m.label}-${i}`}>
                        <div className="text-[11px] text-textItemBlur">
                          {m.label}
                        </div>
                        <div className="text-[15px] font-[600] tabular-nums">
                          {formatHeadline(m)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[16px] items-start">
        <Panel
          title={t('top_performing', 'Top performing')}
          sub={`${t('last_n_days', 'Last')} ${date}${t('days_short', 'd')}`}
        >
          {!topPosts?.length ? (
            <div className="px-[16px] py-[26px] text-[12.5px] text-textItemBlur">
              {t(
                'no_top_posts',
                'No post insights yet — your channels return these once posts have data.'
              )}
            </div>
          ) : (
            <div className="divide-y divide-newTableBorder">
              {topPosts.map((p: any, i: number) => (
                <a
                  key={p.id}
                  href={p.permalink || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-[10px] px-[14px] py-[10px] hover:bg-boxHover transition-colors"
                >
                  <div className="w-[18px] text-[11px] text-textItemBlur tabular-nums shrink-0">
                    {i + 1}
                  </div>
                  <div className="w-[40px] h-[40px] rounded-[9px] overflow-hidden bg-newBgLineColor shrink-0">
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
                    <div className="text-[11px] text-textItemBlur truncate">
                      {p._integration?.name}
                      {p.timestamp
                        ? ` · ${dayjs(p.timestamp).format('MMM D')}`
                        : ''}
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="text-[13px] font-[600] tabular-nums">
                      {fmt(p?.metrics?.reach || p?.metrics?.likes || 0)}
                    </div>
                    <div className="text-[10px] text-textItemBlur">
                      {p?.metrics?.reach ? t('reach', 'Reach') : t('likes', 'Likes')}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={t('best_times', 'Best times to post')}
          sub={t('best_times_sub', 'From your own posts, not a generic table')}
        >
          {!best.length ? (
            <div className="px-[16px] py-[26px] text-[12.5px] text-textItemBlur">
              {conf.scored === 0
                ? t(
                    'best_times_none',
                    'Not enough data yet. This appears once your channels report engagement on published posts.'
                  )
                : `${t(
                    'best_times_thin',
                    'Not enough posts in any single time slot yet — measured'
                  )} ${conf.scored} ${t('posts_lower', 'posts')}.`}
            </div>
          ) : (
            <div className="divide-y divide-newTableBorder">
              {best.map((s) => (
                <div
                  key={`${s.day}-${s.hour}`}
                  className="px-[16px] py-[10px] flex items-center gap-[10px]"
                >
                  <div className="text-[13px] font-[600] flex-1">
                    {DAY_NAMES(t)[s.day]}{' '}
                    {String(s.hour).padStart(2, '0')}:00
                  </div>
                  <div className="text-end">
                    <div className="text-[13px] font-[600] tabular-nums">
                      {fmt(s.averageScore)}
                    </div>
                    <div className="text-[10px] text-textItemBlur">
                      {t('avg_from', 'avg from')} {s.samples}{' '}
                      {t('posts_lower', 'posts')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={t('posting_pattern', 'Your posting pattern')}
          sub={`${published.length} ${t('published_lower', 'published')}`}
        >
          {!published.length ? (
            <div className="px-[16px] py-[26px] text-[12.5px] text-textItemBlur">
              {t('no_published_yet', 'Nothing published yet.')}
            </div>
          ) : (
            <Heatmap grid={heat} t={t} />
          )}
        </Panel>
      </div>
    </div>
  );
};

export default ReportsComponent;
