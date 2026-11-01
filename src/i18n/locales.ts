export const locales = ['en', 'zh-CN', 'zh-TW', 'fr', 'de', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const languageNames: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  fr: 'Français',
  de: 'Deutsch',
  ar: 'العربية'
};

export function resolveLocale(value?: string | null): Locale {
  const code = (value ?? '').replaceAll('_', '-').toLowerCase();
  if (/^zh-(hant|tw|hk|mo)(-|$)/.test(code)) return 'zh-TW';
  if (/^zh(-|$)/.test(code)) return 'zh-CN';
  if (/^fr(-|$)/.test(code)) return 'fr';
  if (/^de(-|$)/.test(code)) return 'de';
  if (/^ar(-|$)/.test(code)) return 'ar';
  return 'en';
}
