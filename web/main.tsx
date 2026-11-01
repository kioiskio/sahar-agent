import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import arEG from 'antd/locale/ar_EG';
import enUS from 'antd/locale/en_US';
import { useTranslation } from 'react-i18next';
import App from './App';
import './i18n';
import './styles.css';
import './console.css';
import './account.css';
import { theme } from './theme';

window.addEventListener('vite:preloadError', event => {
  // A previously open tab can reference a retired deployment chunk. Recover
  // once without replaying any checkout API mutation or dropping URL state.
  try {
    const key = 'sahar:chunk-recovery:' + window.location.pathname;
    const previous = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - previous < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  } catch { /* The route error boundary remains available when storage is blocked. */ }
});

function LocalizedApp() {
  const { i18n } = useTranslation();
  const isArabic = i18n.resolvedLanguage === 'ar';
  return <ConfigProvider theme={theme} direction={isArabic ? 'rtl' : 'ltr'} locale={isArabic ? arEG : enUS}>
    <App />
  </ConfigProvider>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocalizedApp />
  </React.StrictMode>
);
