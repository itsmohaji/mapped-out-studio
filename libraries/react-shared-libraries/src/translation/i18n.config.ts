export const fallbackLng = 'en';
// Mapped Out ships only English + Arabic (Arabic drives full RTL). Any stale cookie
// for a removed language falls back to `fallbackLng` via i18next `supportedLngs`.
export const languages = [fallbackLng, 'ar'];

// Languages that render right-to-left. Single source of truth for SSR + client dir.
export const rtlLanguages = ['ar', 'he'];
export const isRtlLanguage = (language?: string) =>
  !!language && rtlLanguages.includes(language);

export const defaultNS = 'translation';
export const cookieName = 'i18next';
export const headerName = 'x-i18next-current-language';
