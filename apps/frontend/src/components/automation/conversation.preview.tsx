'use client';

import React, { FC, useMemo } from 'react';
import { Glass } from './automation.ui';

export interface PreviewStep {
  kind: string;
  config: Record<string, any>;
}

/** Sample values so the preview reads like a real conversation, not a form. */
const SAMPLE: Record<string, string> = {
  handle: 'sarah.k',
  username: 'sarah.k',
  first_name: 'Sarah',
  comment_text: 'YES',
  message_text: 'YES',
};

function render(body: string): string {
  return (body || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => SAMPLE[k] ?? '');
}

const Bubble: FC<{ side: 'in' | 'out'; children: React.ReactNode }> = ({ side, children }) => (
  <div className={side === 'out' ? 'flex justify-end' : 'flex justify-start'}>
    <div
      className={
        side === 'out'
          ? 'max-w-[78%] px-[13px] py-[9px] rounded-[18px] rounded-br-[5px] bg-gradient-to-br from-[#8a5cf6] to-[#d5307a] text-white text-[12.5px] leading-[1.45] whitespace-pre-wrap break-words'
          : 'max-w-[78%] px-[13px] py-[9px] rounded-[18px] rounded-bl-[5px] bg-white/[0.09] text-[12.5px] leading-[1.45] whitespace-pre-wrap break-words'
      }
    >
      {children}
    </div>
  </div>
);

const Note: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex justify-center">
    <span className="text-[10.5px] text-textItemBlur bg-white/[0.04] px-[10px] py-[4px] rounded-full">
      {children}
    </span>
  </div>
);

/**
 * Live Instagram-style preview of the flow.
 *
 * Walks the steps in order and renders what the contact would actually see.
 * Steps with no visible output (tagging, notifying, creating a lead) become
 * quiet system notes rather than being hidden — someone reading the preview
 * should still be able to tell the flow is doing something at that point.
 */
export const ConversationPreview: FC<{
  steps: PreviewStep[];
  keywords: string[];
  accountName: string;
}> = ({ steps, keywords, accountName }) => {
  const bubbles = useMemo(() => {
    const out: React.ReactNode[] = [];
    let key = 0;

    out.push(
      <Note key={`k${key++}`}>
        Sarah comments “{keywords[0] || 'anything'}” on your post
      </Note>
    );

    for (const s of steps) {
      const cfg = s.config ?? {};
      switch (s.kind) {
        case 'send_dm':
        case 'send_template': {
          const body = render(cfg.message ?? cfg.text ?? '');
          out.push(
            <Bubble key={`k${key++}`} side="out">
              {body || <span className="opacity-60">Your message…</span>}
            </Bubble>
          );
          break;
        }
        case 'reply_comment':
          out.push(
            <Note key={`k${key++}`}>
              Public reply on the post: “{render(cfg.message ?? '') || '…'}”
            </Note>
          );
          break;
        case 'wait_reply':
          out.push(<Bubble key={`k${key++}`} side="in">Sounds good!</Bubble>);
          break;
        case 'collect_field':
          out.push(
            <Note key={`k${key++}`}>Saved their answer as “{cfg.field || 'field'}”</Note>
          );
          break;
        case 'wait':
          out.push(<Note key={`k${key++}`}>Waits {cfg.minutes || 0} minutes</Note>);
          break;
        case 'branch':
          out.push(<Note key={`k${key++}`}>Checks a condition and picks a path</Note>);
          break;
        case 'add_tag':
          out.push(<Note key={`k${key++}`}>Tagged {(cfg.tags ?? []).join(', ') || '—'}</Note>);
          break;
        case 'create_lead':
          out.push(<Note key={`k${key++}`}>Lead saved and sent to the CRM</Note>);
          break;
        case 'notify_team':
        case 'assign_manager':
          out.push(<Note key={`k${key++}`}>Your team is notified</Note>);
          break;
        case 'create_task':
          out.push(<Note key={`k${key++}`}>A task is created</Note>);
          break;
        case 'call_webhook':
          out.push(<Note key={`k${key++}`}>Sends the details to your system</Note>);
          break;
        default:
          break;
      }
    }

    if (steps.length === 0) {
      out.push(
        <Note key="empty">Add a step to see the conversation appear here</Note>
      );
    }

    return out;
  }, [steps, keywords]);

  return (
    <Glass className="p-[16px] sticky top-[16px]">
      <div className="text-[12.5px] font-[600] mb-[12px] flex items-center gap-[7px]">
        <span className="w-[6px] h-[6px] rounded-full bg-[#47b985] animate-pulse" />
        Live preview
      </div>

      {/* Phone frame. Fixed width so the bubbles wrap the way they really will. */}
      <div className="mx-auto w-full max-w-[300px] rounded-[26px] border border-white/[0.1] bg-black/35 overflow-hidden shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-[9px] px-[13px] py-[11px] border-b border-white/[0.07] bg-white/[0.03]">
          <div className="w-[28px] h-[28px] rounded-full bg-gradient-to-br from-[#c13584]/50 to-[#f56040]/30 flex items-center justify-center text-[12px]">
            📸
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-[600] truncate">{accountName}</div>
            <div className="text-[10px] text-textItemBlur">Instagram · Direct</div>
          </div>
        </div>

        <div className="p-[13px] flex flex-col gap-[9px] min-h-[300px] max-h-[440px] overflow-y-auto">
          {bubbles}
        </div>
      </div>

      <p className="text-[11px] text-textItemBlur mt-[12px] leading-[1.5] text-center">
        Sample names. Real conversations use the contact’s own details.
      </p>
    </Glass>
  );
};
