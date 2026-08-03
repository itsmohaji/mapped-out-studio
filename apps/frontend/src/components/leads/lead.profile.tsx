'use client';

import React, { FC, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import SafeImage from '@gitroom/react/helpers/safe.image';

export const STAGES = [
  { key: 'new', label: 'New', accent: '#6ba3da' },
  { key: 'contacted', label: 'Contacted', accent: '#8b93a5' },
  { key: 'qualified', label: 'Qualified', accent: '#b57edc' },
  { key: 'proposal_sent', label: 'Proposal Sent', accent: '#daa646' },
  { key: 'won', label: 'Won', accent: '#47b985' },
  { key: 'lost', label: 'Lost', accent: '#e2685f' },
  { key: 'archived', label: 'Archived', accent: '#5c6270' },
];

export interface Lead {
  id: string;
  fullName?: string | null;
  handle?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  tags?: string;
  notes?: string | null;
  assignedUserId?: string | null;
  fields?: string;
  createdAt: string;
  customer?: { id: string; name: string } | null;

  sourcePlatform?: string | null;
  sourceAccountName?: string | null;
  sourceWorkflowName?: string | null;
  sourceKeyword?: string | null;
  sourceComment?: string | null;
  sourceScope?: string | null;
  sourcePostId?: string | null;
  sourcePostThumbnail?: string | null;
  sourcePostCaption?: string | null;
  sourcePostUrl?: string | null;
  sourcePostDate?: string | null;

  activities?: {
    id: string;
    kind: string;
    summary: string;
    detail?: string | null;
    createdAt: string;
  }[];
}

const parse = (v: any, f: any) => {
  try {
    return (typeof v === 'string' ? JSON.parse(v) : v) ?? f;
  } catch {
    return f;
  }
};

const Field: FC<{ label: string; value?: string | null; mono?: boolean }> = ({
  label,
  value,
  mono,
}) =>
  value ? (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.05em] text-textItemBlur font-[600]">
        {label}
      </div>
      <div className={clsx('text-[12.5px] mt-[3px] break-words', mono && 'font-mono')}>{value}</div>
    </div>
  ) : null;

/**
 * Lead profile.
 *
 * The attribution block is the point of this screen. It is rendered from the
 * snapshot stored on the lead, never re-derived — the post may since have been
 * deleted or edited, and the answer to "which post produced this lead" must not
 * change because of that.
 */
export const LeadProfile: FC<{ leadId: string; onClose: () => void; onSaved: () => void }> = ({
  leadId,
  onClose,
  onSaved,
}) => {
  const fetchApi = useFetch();
  const toast = useToaster();
  const [saving, setSaving] = useState(false);

  const { data: lead, mutate } = useSWR<Lead>(`/automation/leads/${leadId}`, async (url: string) =>
    (await fetchApi(url)).json()
  );

  const [notes, setNotes] = useState<string | null>(null);

  const patch = async (body: Record<string, any>) => {
    setSaving(true);
    try {
      await fetchApi(`/automation/leads/${leadId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      await mutate();
      onSaved();
      toast.show('Saved', 'success');
    } catch {
      toast.show('Could not save', 'warning');
    } finally {
      setSaving(false);
    }
  };

  const fields: Record<string, string> = parse(lead?.fields, {});
  const tags: string[] = parse(lead?.tags, []);
  const hasSource = !!(lead?.sourceWorkflowName || lead?.sourcePostId || lead?.sourcePlatform);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-[520px] h-full overflow-y-auto bg-newBgColorInner border-l border-white/[0.08] p-[22px] flex flex-col gap-[20px]">
        <div className="flex items-start gap-[12px]">
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-[600] truncate">
              {lead?.fullName || lead?.handle || 'Lead'}
            </div>
            <div className="text-[12px] text-textItemBlur mt-[3px]">
              {lead?.handle ? `@${lead.handle}` : ''}
              {lead?.customer ? ` · ${lead.customer.name}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-[30px] h-[30px] rounded-[9px] border border-white/[0.1] hover:border-white/25 transition-colors shrink-0"
          >
            ×
          </button>
        </div>

        <div className="flex flex-wrap gap-[6px]">
          {STAGES.map((s) => (
            <button
              key={s.key}
              onClick={() => patch({ status: s.key })}
              disabled={saving}
              className={clsx(
                'text-[11.5px] px-[10px] py-[5px] rounded-[8px] border transition-all duration-150',
                lead?.status === s.key
                  ? 'text-white'
                  : 'border-white/[0.09] text-textItemBlur hover:border-white/25'
              )}
              style={
                lead?.status === s.key
                  ? { background: `${s.accent}30`, borderColor: `${s.accent}80`, color: s.accent }
                  : undefined
              }
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-[14px]">
          <Field label="Email" value={lead?.email} />
          <Field label="Phone" value={lead?.phone} />
          <Field
            label="Captured"
            value={lead ? dayjs(lead.createdAt).format('D MMM YYYY, HH:mm') : null}
          />
          <Field label="Instagram" value={lead?.handle ? `@${lead.handle}` : null} />
        </div>

        {!!Object.keys(fields).length && (
          <div className="flex flex-col gap-[9px]">
            <div className="text-[12.5px] font-[600]">Collected answers</div>
            <div className="grid grid-cols-2 gap-[12px] p-[13px] rounded-[12px] bg-white/[0.03] border border-white/[0.06]">
              {Object.entries(fields)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <Field key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
                ))}
            </div>
          </div>
        )}

        {/* Attribution — a permanent snapshot, deliberately not a live join. */}
        <div className="flex flex-col gap-[9px]">
          <div className="text-[12.5px] font-[600]">Where this lead came from</div>

          {!hasSource ? (
            <div className="text-[12px] text-textItemBlur p-[13px] rounded-[12px] border border-dashed border-white/[0.1]">
              This lead was captured before attribution tracking existed, so its source is unknown.
            </div>
          ) : (
            <div className="rounded-[12px] bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              {!!lead?.sourcePostId && (
                <div className="flex gap-[12px] p-[13px] border-b border-white/[0.06]">
                  <div className="w-[62px] h-[62px] rounded-[10px] overflow-hidden bg-white/[0.05] shrink-0 flex items-center justify-center">
                    {lead.sourcePostThumbnail ? (
                      <SafeImage
                        src={lead.sourcePostThumbnail}
                        alt=""
                        width={62}
                        height={62}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[18px] opacity-40">🖼️</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] line-clamp-2 leading-[1.45]">
                      {lead.sourcePostCaption || (
                        <span className="text-textItemBlur">No caption</span>
                      )}
                    </div>
                    <div className="text-[11px] text-textItemBlur mt-[4px]">
                      {lead.sourcePostDate
                        ? dayjs(lead.sourcePostDate).format('D MMM YYYY')
                        : '—'}
                      {lead.sourcePostUrl && (
                        <>
                          {' · '}
                          <a
                            href={lead.sourcePostUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-btnPrimary hover:underline"
                          >
                            View post
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-[13px] p-[13px]">
                <Field label="Platform" value={lead?.sourcePlatform} />
                <Field label="Account" value={lead?.sourceAccountName} />
                <Field label="Automation" value={lead?.sourceWorkflowName} />
                <Field label="Keyword" value={lead?.sourceKeyword} mono />
                <Field
                  label="Targeting"
                  value={
                    lead?.sourceScope === 'specific_post'
                      ? 'Specific post'
                      : lead?.sourceScope === 'all_posts'
                      ? 'All posts'
                      : null
                  }
                />
                <Field label="Post ID" value={lead?.sourcePostId} mono />
              </div>

              {!!lead?.sourceComment && (
                <div className="px-[13px] pb-[13px]">
                  <div className="text-[10.5px] uppercase tracking-[0.05em] text-textItemBlur font-[600]">
                    Their comment
                  </div>
                  <div className="text-[12.5px] mt-[4px] italic">“{lead.sourceComment}”</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-[8px]">
          <div className="text-[12.5px] font-[600]">Notes</div>
          <textarea
            value={notes ?? lead?.notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== null && notes !== lead?.notes && patch({ notes })}
            rows={3}
            placeholder="Anything worth remembering…"
            className="w-full bg-black/20 border border-white/[0.09] rounded-[10px] p-[11px] text-[12.5px] outline-none focus:border-btnPrimary/50 transition-colors resize-y"
          />
        </div>

        {!!tags.length && (
          <div className="flex flex-wrap gap-[5px]">
            {tags.map((t) => (
              <span
                key={t}
                className="text-[11px] px-[8px] py-[3px] rounded-[6px] bg-white/[0.06] border border-white/[0.08]"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-[9px]">
          <div className="text-[12.5px] font-[600]">Activity</div>
          <div className="flex flex-col gap-[10px]">
            {(lead?.activities ?? []).map((a) => (
              <div key={a.id} className="flex gap-[10px]">
                <span className="w-[6px] h-[6px] rounded-full bg-btnPrimary/60 mt-[6px] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12px]">{a.summary}</div>
                  {!!a.detail && (
                    <div className="text-[11px] text-textItemBlur mt-[2px] break-words">
                      {a.detail}
                    </div>
                  )}
                  <div className="text-[10.5px] text-textItemBlur/70 mt-[2px]">
                    {dayjs(a.createdAt).format('D MMM YYYY, HH:mm')}
                  </div>
                </div>
              </div>
            ))}
            {!lead?.activities?.length && (
              <div className="text-[12px] text-textItemBlur">No activity yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
