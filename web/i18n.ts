import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './messages/de';
import en from './messages/en';
import fr from './messages/fr';
import zhCN from './messages/zh-CN';
import zhTW from './messages/zh-TW';
import ar from './messages/ar';

export const locales = ['en', 'ar', 'zh-CN', 'zh-TW', 'fr', 'de'] as const;
export type Locale = (typeof locales)[number];

export const languageNames: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  fr: 'Français',
  de: 'Deutsch',
  ar: 'العربية'
};

const STORAGE_KEY = 'dubai.locale';
const COOKIE_KEY = 'dubai_locale';

export function resolveLocale(value?: string | null): Locale {
  const normalized = value?.trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) return 'en';

  const exact = locales.find(locale => locale.toLowerCase() === normalized);
  if (exact) return exact;
  if (normalized === 'zh' || normalized === 'zh-hans' || normalized === 'zh-sg') return 'zh-CN';
  if (normalized === 'zh-hant' || normalized === 'zh-hk' || normalized === 'zh-mo') return 'zh-TW';

  const language = normalized.split('-')[0];
  return locales.find(locale => locale.toLowerCase() === language) ?? 'en';
}

function readCookie(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const value = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_KEY}=([^;]+)`))?.[1];
    return value ? decodeURIComponent(value) : null;
  } catch {
    return null;
  }
}

function readSavedLocale(): Locale {
  let saved: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Continue with the cookie or English default when storage is unavailable.
    }
  }
  if (!saved) saved = readCookie();
  return resolveLocale(saved);
}

function syncDocument(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

export const i18n = i18next.createInstance();
const initialLocale = readSavedLocale();

void i18n.use(initReactI18next).init({
  lng: initialLocale,
  fallbackLng: 'en',
  supportedLngs: [...locales],
  load: 'currentOnly',
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    fr: { translation: fr },
    de: { translation: de },
    ar: { translation: ar }
  },
  defaultNS: 'translation',
  initAsync: false,
  interpolation: {
    escapeValue: false,
    prefix: '{',
    suffix: '}'
  },
  returnNull: false,
  returnEmptyString: false
});

syncDocument(initialLocale);

export function t(key: string, values?: Record<string, unknown>): string {
  return String(i18n.t(key, values));
}

export async function setLocale(value?: string | null, persist = true): Promise<Locale> {
  const locale = resolveLocale(value);
  await i18n.changeLanguage(locale);
  syncDocument(locale);

  if (persist) {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, locale);
      } catch {
        // Keep the in-memory choice when storage is unavailable.
      }
    }
    if (typeof document !== 'undefined') {
      try {
        const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${COOKIE_KEY}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      } catch {
        // Keep the in-memory choice when cookies are unavailable.
      }
    }
  }

  return locale;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) void setLocale(event.newValue, false);
  });
}
