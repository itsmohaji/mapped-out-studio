'use client';

import React from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ApprovedAppsComponent } from '@gitroom/frontend/components/approved-apps/approved-apps.component';

// Roadmap connectors for the future SaaS — placement only. These are clearly
// labelled "coming soon" and are intentionally NOT wired to anything yet (they
// need their own OAuth apps + a dedicated workstream). No fake functionality.
const UPCOMING = [
  { key: 'google', label: 'Google', note: 'Sign in with Google' },
  { key: 'apple', label: 'Apple', note: 'Sign in with Apple' },
  { key: 'crm', label: 'CRM', note: 'HubSpot, Salesforce & more' },
];

const IntegrationsComponent = () => {
  const t = useT();
  return (
    <div className="flex flex-col gap-[20px]">
      <div>
        <div className="text-[18px] font-[600]">
          {t('integrations', 'Integrations')}
        </div>
        <div className="text-[12px] text-textItemBlur mt-[3px]">
          {t(
            'integrations_help',
            'Connect external apps and services to your workspace.'
          )}
        </div>
      </div>

      {/* Real, functional: connected OAuth apps */}
      <ApprovedAppsComponent />

      {/* Roadmap: future SaaS connectors */}
      <div className="flex flex-col gap-[10px]">
        <div className="text-[14px] font-[600] text-textItemBlur">
          {t('coming_soon', 'Coming soon')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px]">
          {UPCOMING.map((c) => (
            <div
              key={c.key}
              className="glass-surface rounded-[12px] p-[16px] flex flex-col gap-[8px] opacity-70"
            >
              <div className="flex items-center justify-between gap-[8px]">
                <div className="text-[14px] font-[600]">{c.label}</div>
                <span className="text-[10px] uppercase tracking-wide px-[8px] py-[3px] rounded-full border border-newTableBorder text-forth">
                  {t('soon', 'Soon')}
                </span>
              </div>
              <div className="text-[12px] text-textItemBlur">{c.note}</div>
              <button
                type="button"
                disabled
                className="mt-[4px] h-[34px] rounded-[8px] glass-surface text-[12px] font-[600] text-textItemBlur cursor-not-allowed"
              >
                {t('connect', 'Connect')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default IntegrationsComponent;
