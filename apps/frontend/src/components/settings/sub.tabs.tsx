'use client';

import React, { FC, ReactNode, useState } from 'react';

export interface SubTab {
  key: string;
  label: string;
  render: () => ReactNode;
}

// Shared pill sub-tab strip for a settings section (matches API & Keys).
export const SubTabs: FC<{ tabs: SubTab[] }> = ({ tabs }) => {
  const [active, setActive] = useState(tabs[0]?.key);
  if (!tabs.length) return null;
  const current = tabs.find((x) => x.key === active) || tabs[0];

  return (
    <div className="flex flex-col gap-[16px]">
      {tabs.length > 1 && (
        <div className="flex items-center gap-[4px] p-[3px] rounded-[10px] glass-surface w-fit flex-wrap">
          {tabs.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setActive(x.key)}
              className={`px-[14px] py-[7px] rounded-[8px] text-[13px] font-[600] transition-colors ${
                current.key === x.key
                  ? 'bg-forth text-white'
                  : 'text-textItemBlur hover:text-primary'
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
      {current.render()}
    </div>
  );
};
