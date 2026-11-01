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
