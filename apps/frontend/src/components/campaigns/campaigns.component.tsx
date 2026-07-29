'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';

export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  color?: string | null;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  customerId?: string | null;
  customer?: { id: string; name: string } | null;
  counts?: Record<string, number>;
}

interface CampaignPost {
  id: string;
  content: string;
  publishDate: string;
  state: string;
  group: string;
  releaseURL?: string | null;
  /** Only returned by the "assignable" list — flags a post already in another campaign. */
  campaignId?: string | null;
  integration?: {
    id: string;
    name: string;
    picture?: string | null;
    providerIdentifier: string;
  };
}

const STATUSES = ['planning', 'active', 'completed', 'archived'] as const;

const STATUS_STYLE: Record<string, string> = {
  planning: 'bg-[#8b93a5]/15 text-[#8b93a5]',
  active: 'bg-btnPrimary/15 text-btnPrimary',
  completed: 'bg-[#47b985]/15 text-[#47b985]',
  archived: 'bg-[#8b93a5]/10 text-textItemBlur',
};

const COLORS = ['#6ba3da', '#47b985', '#daa646', '#e2685f', '#8b93a5'];

const StatusPill: FC<{ status: string; t: any }> = ({ status, t }) => (
  <span
    className={clsx(
      'px-[8px] py-[3px] rounded-full text-[10.5px] font-[600] uppercase tracking-wide shrink-0',
      STATUS_STYLE[status] || STATUS_STYLE.planning
    )}
  >
    {t(`campaign_status_${status}`, status)}
  </span>
);

const total = (counts?: Record<string, number>) =>
  Object.values(counts || {}).reduce((a, c) => a + c, 0);

const CampaignForm: FC<{
  initial?: Campaign | null;
  customers: { id: string; name: string }[];
  onSaved: () => void;
  onCancel: () => void;
}> = ({ initial, customers, onSaved, onCancel }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: initial?.name || '',
    description: initial?.description || '',
    status: initial?.status || 'planning',
    goal: initial?.goal || '',
    color: initial?.color || COLORS[0],
    customerId: initial?.customerId || '',
    startDate: initial?.startDate
      ? dayjs(initial.startDate).format('YYYY-MM-DD')
      : '',
    endDate: initial?.endDate ? dayjs(initial.endDate).format('YYYY-MM-DD') : '',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useCallback(async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const body: any = {
        name: form.name.trim(),
        description: form.description || undefined,
        status: form.status,
        goal: form.goal || undefined,
        color: form.color || undefined,
        customerId: form.customerId || undefined,
        startDate: form.startDate
          ? dayjs(form.startDate).toISOString()
          : undefined,
        endDate: form.endDate ? dayjs(form.endDate).toISOString() : undefined,
      };
      const res = await fetch(
        initial ? `/campaigns/${initial.id}` : '/campaigns',
        { method: initial ? 'PUT' : 'POST', body: JSON.stringify(body) }
      );
      if (!res.ok) {
        toast.show(t('action_failed', 'Action failed'), 'warning');
        return;
      }
      toast.show(
        initial
          ? t('campaign_updated', 'Campaign updated')
          : t('campaign_created', 'Campaign created')
      );
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [form, saving, initial, onSaved, t]);

  const field =
    'w-full bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[12px] py-[9px] text-[13.5px] text-newTextColor outline-none focus:border-btnPrimary';

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-col gap-[6px]">
        <div className="text-[12px] font-[600] text-textItemBlur">
          {t('campaign_name', 'Campaign name')}
        </div>
        <input
          autoFocus
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={t('campaign_name_ph', 'Summer launch')}
          className={field}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[10px]">
        <div className="flex flex-col gap-[6px]">
          <div className="text-[12px] font-[600] text-textItemBlur">
            {t('status', 'Status')}
          </div>
          <select
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
            className={field}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`campaign_status_${s}`, s)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-[6px]">
          <div className="text-[12px] font-[600] text-textItemBlur">
            {t('client', 'Client')}
          </div>
          <select
            value={form.customerId}
            onChange={(e) => set('customerId', e.target.value)}
            className={field}
          >
            <option value="">{t('no_client', 'No client')}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[10px]">
        <div className="flex flex-col gap-[6px]">
          <div className="text-[12px] font-[600] text-textItemBlur">
            {t('start_date', 'Start date')}
          </div>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-[6px]">
          <div className="text-[12px] font-[600] text-textItemBlur">
            {t('end_date', 'End date')}
          </div>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => set('endDate', e.target.value)}
            className={field}
          />
        </div>
      </div>

      <div className="flex flex-col gap-[6px]">
        <div className="text-[12px] font-[600] text-textItemBlur">
          {t('campaign_goal', 'Goal')}
        </div>
        <input
          value={form.goal}
          onChange={(e) => set('goal', e.target.value)}
          placeholder={t('campaign_goal_ph', 'What is this campaign for?')}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-[6px]">
        <div className="text-[12px] font-[600] text-textItemBlur">
          {t('notes', 'Notes')}
        </div>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          className={`${field} resize-none`}
        />
      </div>

      <div className="flex items-center gap-[8px]">
        <div className="text-[12px] font-[600] text-textItemBlur">
          {t('colour', 'Colour')}
        </div>
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => set('color', c)}
            className={clsx(
              'w-[22px] h-[22px] rounded-full transition-all',
              form.color === c && 'ring-2 ring-offset-2 ring-offset-newBgColorInner'
            )}
            style={{ backgroundColor: c, boxShadow: form.color === c ? `0 0 0 2px ${c}` : undefined }}
          />
        ))}
      </div>

      <div className="flex items-center gap-[10px] pt-[4px]">
        <Button onClick={save} loading={saving}>
          {initial ? t('save', 'Save') : t('create_campaign', 'Create campaign')}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] text-textItemBlur hover:underline"
        >
          {t('cancel', 'Cancel')}
        </button>
      </div>
    </div>
  );
};

const CampaignDetail: FC<{
  campaign: Campaign;
  onBack: () => void;
  onChanged: () => void;
}> = ({ campaign, onBack, onChanged }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(
    async (url: string) => (await fetch(url)).json(),
    []
  );
  const { data, mutate } = useSWR<{ posts: CampaignPost[] }>(
    `/campaigns/${campaign.id}/posts`,
    load
  );
  const { data: assignable } = useSWR<{ posts: CampaignPost[] }>(
    adding
      ? `/campaigns/${campaign.id}/assignable${
          search ? `?search=${encodeURIComponent(search)}` : ''
        }`
      : null,
    load
  );

  const posts = data?.posts || [];

  const attach = useCallback(async () => {
    if (!picked.length) return;
    const res = await fetch(`/campaigns/${campaign.id}/posts`, {
      method: 'POST',
      body: JSON.stringify({ groups: picked }),
    });
    if (res.ok) {
      setPicked([]);
      setAdding(false);
      mutate();
      onChanged();
      toast.show(t('posts_added', 'Posts added to campaign'));
    } else {
      toast.show(t('action_failed', 'Action failed'), 'warning');
    }
  }, [picked, campaign.id, mutate, onChanged, t]);

  const detach = useCallback(
    async (group: string) => {
      const res = await fetch(`/campaigns/${campaign.id}/posts`, {
        method: 'DELETE',
        body: JSON.stringify({ groups: [group] }),
      });
      if (res.ok) {
        mutate();
        onChanged();
      } else {
        toast.show(t('action_failed', 'Action failed'), 'warning');
      }
    },
    [campaign.id, mutate, onChanged, t]
  );

  return (
    <div className="flex flex-col gap-[16px]">
      <button
        onClick={onBack}
        className="text-[12.5px] text-btnPrimary hover:underline self-start flex items-center gap-[5px]"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="rtl:rotate-180">
          <path d="m15 18-6-6 6-6" />
        </svg>
        {t('all_campaigns', 'All campaigns')}
      </button>

      <div className="glass-surface rounded-[16px] p-[18px] flex flex-col gap-[10px]">
        <div className="flex items-center gap-[10px] flex-wrap">
          <div
            className="w-[10px] h-[10px] rounded-full shrink-0"
            style={{ backgroundColor: campaign.color || COLORS[0] }}
          />
          <div className="text-[20px] font-[600]">{campaign.name}</div>
          <StatusPill status={campaign.status} t={t} />
        </div>
        <div className="flex items-center gap-[14px] flex-wrap text-[12.5px] text-textItemBlur">
          {campaign.customer?.name && <span>{campaign.customer.name}</span>}
          {(campaign.startDate || campaign.endDate) && (
            <span>
              {campaign.startDate
                ? dayjs(campaign.startDate).format('MMM D, YYYY')
                : '—'}{' '}
              →{' '}
              {campaign.endDate
                ? dayjs(campaign.endDate).format('MMM D, YYYY')
                : '—'}
            </span>
          )}
          <span>
            {posts.length} {t('posts_lower', 'posts')}
          </span>
        </div>
        {campaign.goal && (
          <div className="text-[13px]">
            <span className="text-textItemBlur">{t('campaign_goal', 'Goal')}: </span>
            {campaign.goal}
          </div>
        )}
        {campaign.description && (
          <div className="text-[13px] text-textItemBlur whitespace-pre-wrap">
            {campaign.description}
          </div>
        )}
      </div>

      <div className="glass-surface rounded-[16px] overflow-hidden">
        <div className="flex items-center gap-[10px] px-[16px] py-[12px] border-b border-newTableBorder">
          <div className="text-[13px] font-[600] flex-1">
            {t('campaign_posts', 'Posts in this campaign')}
          </div>
          <Button onClick={() => setAdding((a) => !a)} secondary>
            {adding ? t('cancel', 'Cancel') : t('add_posts', 'Add posts')}
          </Button>
        </div>

        {adding && (
          <div className="p-[14px] border-b border-newTableBorder flex flex-col gap-[10px] bg-newBgLineColor/40">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_posts', 'Search posts…')}
              className="w-full bg-newBgLineColor border border-newTableBorder rounded-[10px] px-[12px] py-[9px] text-[13px] outline-none focus:border-btnPrimary"
            />
            <div className="max-h-[280px] overflow-y-auto flex flex-col gap-[4px]">
              {!assignable?.posts?.length ? (
                <div className="text-[12.5px] text-textItemBlur py-[12px]">
                  {t('no_posts_to_add', 'No posts available to add.')}
                </div>
              ) : (
                assignable.posts.map((p) => {
                  const on = picked.includes(p.group);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setPicked((prev) =>
                          on
                            ? prev.filter((g) => g !== p.group)
                            : [...prev, p.group]
                        )
                      }
                      className="flex items-center gap-[10px] px-[10px] py-[8px] rounded-[10px] hover:bg-boxHover text-start"
                    >
                      <span
                        className={clsx(
                          'w-[16px] h-[16px] rounded-[5px] border-2 flex items-center justify-center shrink-0',
                          on
                            ? 'bg-btnPrimary border-btnPrimary'
                            : 'border-newTableBorder'
                        )}
                      >
                        {on && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12.5px] truncate">
                          {stripHtmlValidation('none', p.content, false, true, false) ||
                            t('no_content', 'no content')}
                        </span>
                        <span className="block text-[11px] text-textItemBlur">
                          {dayjs(p.publishDate).format('MMM D, HH:mm')} ·{' '}
                          {p.integration?.name}
                          {p.campaignId ? ` · ${t('in_another_campaign', 'in another campaign')}` : ''}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div>
              <Button onClick={attach} disabled={!picked.length}>
                {t('add_selected', 'Add selected')} ({picked.length})
              </Button>
            </div>
          </div>
        )}

        {!posts.length ? (
          <div className="px-[16px] py-[28px] text-[13px] text-textItemBlur">
            {t(
              'campaign_empty',
              'No posts yet. Add existing posts, or set this campaign on a post from the calendar.'
            )}
          </div>
        ) : (
          <div className="divide-y divide-newTableBorder">
            {posts.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-[10px] px-[14px] py-[10px] group"
              >
                <div className="relative w-[28px] h-[28px] shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.integration?.picture || '/no-picture.jpg'}
                    alt=""
                    className="w-[28px] h-[28px] rounded-[8px] object-cover"
                  />
                  <SafeImage
                    src={`/icons/platforms/${p.integration?.providerIdentifier}.png`}
                    className="w-[12px] h-[12px] rounded-[4px] absolute -bottom-[2px] -end-[2px] border border-fifth"
                    alt=""
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] truncate">
                    {stripHtmlValidation('none', p.content, false, true, false) ||
                      t('no_content', 'no content')}
                  </div>
                  <div className="text-[11px] text-textItemBlur">
                    {dayjs(p.publishDate).format('MMM D, YYYY · HH:mm')} ·{' '}
                    {p.state}
                  </div>
                </div>
                <button
                  onClick={() => detach(p.group)}
                  className="text-[11.5px] text-textItemBlur hover:text-[#e2685f] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  {t('remove', 'Remove')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const CampaignsComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Campaign | null | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  const { data: campaigns, mutate, isLoading } = useSWR<Campaign[]>(
    `/campaigns?status=${status}`,
    load
  );
  const { data: customers } = useSWR<{ id: string; name: string }[]>(
    '/integrations/customers',
    load
  );

  const open = useMemo(
    () => (campaigns || []).find((c) => c.id === openId) || null,
    [campaigns, openId]
  );

  const remove = useCallback(
    async (c: Campaign) => {
      const ok = await deleteDialog(
        t(
          'delete_campaign_confirm',
          'Delete this campaign? Its posts are kept and simply unlinked.'
        ),
        t('yes_delete', 'Yes, delete')
      );
      if (!ok) return;
      const res = await fetch(`/campaigns/${c.id}`, { method: 'DELETE' });
      if (res.ok) {
        setOpenId(null);
        mutate();
        toast.show(t('campaign_deleted', 'Campaign deleted'));
      } else {
        toast.show(t('action_failed', 'Action failed'), 'warning');
      }
    },
    [mutate, t]
  );

  if (open) {
    return (
      <div className="flex-1 flex flex-col gap-[16px] p-[20px]">
        <CampaignDetail
          campaign={open}
          onBack={() => setOpenId(null)}
          onChanged={mutate}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-[16px] p-[20px]">
      <div className="flex items-start gap-[12px] flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-[22px] font-[600]">
            {t('campaigns', 'Campaigns')}
          </h1>
          <p className="text-[13px] text-textItemBlur mt-[2px]">
            {t(
              'campaigns_sub',
              'Group posts into a campaign and track it end to end.'
            )}
          </p>
        </div>
        <Button onClick={() => setEditing(null)}>
          {t('new_campaign', 'New campaign')}
        </Button>
      </div>

      <div className="flex items-center gap-[3px] p-[3px] rounded-[10px] glass-surface w-fit flex-wrap">
        {['all', ...STATUSES].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={clsx(
              'px-[12px] py-[6px] rounded-[8px] text-[12.5px] font-[600] transition-colors capitalize',
              status === s
                ? 'bg-forth text-white'
                : 'text-textItemBlur hover:text-primary'
            )}
          >
            {s === 'all' ? t('all', 'All') : t(`campaign_status_${s}`, s)}
          </button>
        ))}
      </div>

      {editing !== undefined && (
        <div className="glass-surface rounded-[16px] p-[18px]">
          <div className="text-[15px] font-[600] mb-[14px]">
            {editing
              ? t('edit_campaign', 'Edit campaign')
              : t('new_campaign', 'New campaign')}
          </div>
          <CampaignForm
            initial={editing}
            customers={customers || []}
            onSaved={() => {
              setEditing(undefined);
              mutate();
            }}
            onCancel={() => setEditing(undefined)}
          />
        </div>
      )}

      {isLoading ? (
        <div className="py-[50px] text-center text-textItemBlur text-[13px]">
          {t('loading', 'Loading…')}
        </div>
      ) : !campaigns?.length ? (
        <div className="glass-surface rounded-[16px] px-[18px] py-[52px] text-center">
          <div className="text-[14px] font-[600]">
            {t('no_campaigns', 'No campaigns yet')}
          </div>
          <div className="text-[12.5px] text-textItemBlur mt-[5px]">
            {t(
              'no_campaigns_help',
              'Create one to group related posts, give it a window, and watch it progress.'
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[14px]">
          {campaigns.map((c) => {
            const published = c.counts?.PUBLISHED || 0;
            const all = total(c.counts);
            const pct = all ? Math.round((published / all) * 100) : 0;
            return (
              <div
                key={c.id}
                className="glass-surface rounded-[16px] p-[16px] flex flex-col gap-[10px] cursor-pointer transition-all hover:-translate-y-[2px] hover:shadow-[0_12px_36px_-12px_rgba(107,163,218,0.35)]"
                onClick={() => setOpenId(c.id)}
              >
                <div className="flex items-center gap-[8px]">
                  <div
                    className="w-[10px] h-[10px] rounded-full shrink-0"
                    style={{ backgroundColor: c.color || COLORS[0] }}
                  />
                  <div className="text-[14.5px] font-[600] flex-1 truncate">
                    {c.name}
                  </div>
                  <StatusPill status={c.status} t={t} />
                </div>

                {c.customer?.name && (
                  <div className="text-[11.5px] text-textItemBlur truncate">
                    {c.customer.name}
                  </div>
                )}

                <div className="text-[11.5px] text-textItemBlur">
                  {c.startDate
                    ? dayjs(c.startDate).format('MMM D')
                    : t('no_start', 'No start')}
                  {' → '}
                  {c.endDate
                    ? dayjs(c.endDate).format('MMM D, YYYY')
                    : t('open_ended', 'open')}
                </div>

                <div className="flex flex-col gap-[5px]">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-textItemBlur">
                      {published}/{all} {t('published_lower', 'published')}
                    </span>
                    <span className="tabular-nums text-textItemBlur">{pct}%</span>
                  </div>
                  <div className="h-[5px] rounded-full bg-newBgLineColor overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: c.color || COLORS[0],
                      }}
                    />
                  </div>
                </div>

                <div
                  className="flex items-center gap-[12px] pt-[2px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setEditing(c)}
                    className="text-[11.5px] text-btnPrimary hover:underline"
                  >
                    {t('edit', 'Edit')}
                  </button>
                  <button
                    onClick={() => remove(c)}
                    className="text-[11.5px] text-textItemBlur hover:text-[#e2685f]"
                  >
                    {t('delete', 'Delete')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CampaignsComponent;
