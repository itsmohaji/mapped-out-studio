'use client';

import useCookie from 'react-use-cookie';
import {
  cookieName,
  fallbackLng,
  isRtlLanguage,
} from '@gitroom/react/translation/i18n.config';
import i18next from 'i18next';
import { FC, useEffect } from 'react';

export const ChangeDir: FC = () => {
  const currentLanguage = i18next.resolvedLanguage || fallbackLng;
  const [language] = useCookie(cookieName, currentLanguage || fallbackLng);

  useEffect(() => {
    document.documentElement.setAttribute(
      'dir',
      isRtlLanguage(language) ? 'rtl' : 'ltr'
    );
  }, [language]);

  return null;
};
