'use client';

import { useCallback, useEffect } from 'react';
import useCookie from 'react-use-cookie';
import EventEmitter from 'events';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const modeEmitter = new EventEmitter();

// User-facing preference. The RESOLVED effective mode ('dark' | 'light') is what
// every other consumer reads (the `mode` cookie + modeEmitter), so 'system' never
// leaks to them — we resolve it here and keep the old contract intact.
export type ThemePreference = 'light' | 'dark' | 'system';
type EffectiveMode = 'light' | 'dark';

const PREFERENCES: ThemePreference[] = ['light', 'dark', 'system'];

const isBrowser = () => typeof window !== 'undefined';

const systemPrefersDark = (): boolean =>
  isBrowser() &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const resolveEffective = (pref: ThemePreference): EffectiveMode =>
  pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref;

const normalizePref = (value?: string): ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system' ? value : 'dark';

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22" fill="none">
    <path
      d="M10.75 1V3M10.75 19V21M2.75 11H0.75M5.06412 5.31412L3.6499 3.8999M16.4359 5.31412L17.8501 3.8999M5.06412 16.69L3.6499 18.1042M16.4359 16.69L17.8501 18.1042M20.75 11H18.75M15.75 11C15.75 13.7614 13.5114 16 10.75 16C7.98858 16 5.75 13.7614 5.75 11C5.75 8.23858 7.98858 6 10.75 6C13.5114 6 15.75 8.23858 15.75 11Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path
      d="M21.625 12.9011C20.2967 15.231 17.7898 16.8019 14.916 16.8019C10.6539 16.8019 7.19884 13.3468 7.19884 9.08473C7.19884 6.21071 8.76993 3.70363 11.1001 2.37549C6.20501 2.83962 2.37561 6.96182 2.37561 11.9784C2.37561 17.306 6.69447 21.6248 12.0221 21.6248C17.0384 21.6248 21.1605 17.7959 21.625 12.9011Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SystemIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 5H20C20.5523 5 21 5.44772 21 6V15C21 15.5523 20.5523 16 20 16H4C3.44772 16 3 15.5523 3 15V6C3 5.44772 3.44772 5 4 5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8.5 20H15.5M12 16V20"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const iconFor = (pref: ThemePreference) =>
  pref === 'light' ? <SunIcon /> : pref === 'dark' ? <MoonIcon /> : <SystemIcon />;

const ModeComponent = ({
  variant = 'toggle',
}: {
  variant?: 'toggle' | 'segmented';
}) => {
  const t = useT();
  const [rawPreference, setPreference] = useCookie('theme_pref', 'dark');
  const [, setResolvedMode] = useCookie('mode', 'dark');

  const preference = normalizePref(rawPreference);

  // One-time migration: existing users only have the legacy `mode` cookie (their last
  // resolved light/dark choice). If no `theme_pref` yet, seed it from `mode` so we never
  // flip a light-mode user to dark on upgrade.
  useEffect(() => {
    if (!isBrowser()) return;
    const hasPref = document.cookie
      .split('; ')
      .some((c) => c.startsWith('theme_pref='));
    if (hasPref) return;
    const legacy = document.cookie
      .split('; ')
      .find((c) => c.startsWith('mode='))
      ?.split('=')[1];
    if (legacy === 'light' || legacy === 'dark') {
      setPreference(legacy);
    }
  }, [setPreference]);

  const apply = useCallback(
    (effective: EffectiveMode) => {
      if (!isBrowser()) return;
      document.body.classList.remove('dark', 'light');
      document.body.classList.add(effective);
      try {
        localStorage.setItem('mode', effective);
      } catch {}
      setResolvedMode(effective);
      modeEmitter.emit('mode', effective);
    },
    [setResolvedMode]
  );

  // Apply on mount + whenever the preference changes; when 'system', react to OS changes live.
  useEffect(() => {
    apply(resolveEffective(preference));
    if (preference !== 'system' || !isBrowser() || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply(resolveEffective('system'));
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [preference, apply]);

  const label = useCallback(
    (pref: ThemePreference) =>
      pref === 'light'
        ? t('theme_light', 'Light')
        : pref === 'dark'
        ? t('theme_dark', 'Dark')
        : t('theme_system', 'System'),
    [t]
  );

  const cycle = useCallback(() => {
    const next =
      PREFERENCES[(PREFERENCES.indexOf(preference) + 1) % PREFERENCES.length];
    setPreference(next);
  }, [preference, setPreference]);

  if (variant === 'segmented') {
    return (
      <div className="flex items-center gap-[4px] p-[3px] rounded-[10px] glass-surface">
        {PREFERENCES.map((pref) => (
          <button
            key={pref}
            type="button"
            aria-pressed={preference === pref}
            onClick={() => setPreference(pref)}
            className={`flex items-center gap-[6px] px-[12px] py-[6px] rounded-[8px] text-[13px] font-[500] transition-colors select-none ${
              preference === pref
                ? 'bg-forth text-white'
                : 'text-textItemBlur hover:text-primary'
            }`}
          >
            <span className="w-[16px] h-[16px] flex items-center justify-center">
              {iconFor(pref)}
            </span>
            {label(pref)}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      onClick={cycle}
      title={label(preference)}
      role="button"
      aria-label={label(preference)}
      className="select-none cursor-pointer"
    >
      {iconFor(preference)}
    </div>
  );
};

export default ModeComponent;
