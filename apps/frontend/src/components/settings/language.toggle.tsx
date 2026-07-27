'use client';

import React, { useCallback } from 'react';
import i18next from 'i18next';
import useCookie from 'react-use-cookie';
import {
  cookieName,
  fallbackLng,
  isRtlLanguage,
} from '@gitroom/react/translation/i18n.config';

// Language names are shown in their own script (standard practice), so they are not translated.
const LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
];

export const LanguageToggle = () => {
  const [lang, setLang] = useCookie(
    cookieName,
    i18next.resolvedLanguage || fallbackLng
  );
  const current = lang || fallbackLng;

  const change = useCallback(
    (code: string) => {
      if (code === current) return;
      setLang(code);
      i18next.changeLanguage(code);
      document.documentElement.setAttribute(
        'dir',
        isRtlLanguage(code) ? 'rtl' : 'ltr'
      );
    },
    [current, setLang]
  );

  return (
    <div className="flex items-center gap-[4px] p-[3px] rounded-[10px] glass-surface">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          aria-pressed={current === l.code}
          onClick={() => change(l.code)}
          className={`px-[14px] py-[6px] rounded-[8px] text-[13px] font-[500] transition-colors select-none ${
            current === l.code
              ? 'bg-forth text-white'
              : 'text-textItemBlur hover:text-primary'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageToggle;
