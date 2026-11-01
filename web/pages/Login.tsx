import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../api';
import BrandMark from '../components/BrandMark';
import type { Navigate } from '../App';
import { afterSignIn } from '../navigation';

const { Paragraph, Title } = Typography;
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    action: string;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }) => string;
  reset: (widget: string) => void;
  remove: (widget: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

function messageFor(t: (key: string) => string, error: unknown): string {
  if (!(error instanceof ApiError)) return t('ui.error');
  if (error.status === 429) return t('account.rateLimited');
  if (error.status === 401) return t('account.invalidCode');
  if (error.status === 400 && /verification check/i.test(error.message)) return t('account.checkFailed');
  return error.message || t('ui.error');
}

export default function Login({ navigate }: { navigate: Navigate }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const widgetContainer = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const token = useRef('');
  const mounted = useRef(true);

  const resetTurnstile = () => {
    token.current = '';
    setTurnstileReady(false);
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  };

  const failTurnstile = () => {
    token.current = '';
    setTurnstileReady(false);
    setError(t('account.checkFailed'));
  };

  useEffect(() => {
    let active = true;
    const returnSearch = window.location.search;
    mounted.current = true;
    void api.session().then(session => { if (active && session.user) navigate(afterSignIn(returnSearch, session.user.admin)); }).catch(() => undefined);
    void api.authConfig().then(config => {
      if (mounted.current) setSiteKey(config.turnstileSiteKey);
    }).catch(() => {
      if (mounted.current) setError(t('account.checkUnavailable'));
    }).finally(() => {
      if (mounted.current) setConfigLoaded(true);
    });
    return () => { active = false; mounted.current = false; };
  }, [navigate]);

  useEffect(() => {
    if (!siteKey || sent) return;
    const container = widgetContainer.current;
    let cancelled = false;
    let check = 0;

    const render = () => {
      if (cancelled || widgetId.current || !widgetContainer.current) return;
      if (!window.turnstile) {
        check = window.setTimeout(render, 50);
        return;
      }
      widgetId.current = window.turnstile.render(widgetContainer.current, {
        sitekey: siteKey,
        action: 'login',
        callback: value => {
          if (cancelled) return;
          token.current = value;
          setTurnstileReady(true);
          setError('');
        },
        'expired-callback': () => {
          if (!cancelled) resetTurnstile();
        },
        'error-callback': () => {
          if (cancelled) return;
          token.current = '';
          setTurnstileReady(false);
          setError(t('account.checkFailed'));
        }
      });
    };

    let script = document.querySelector<HTMLScriptElement>('script[data-sahar-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.saharTurnstile = '1';
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);
    script.addEventListener('error', failTurnstile);
    if (window.turnstile) render();
    return () => {
      cancelled = true;
      window.clearTimeout(check);
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', failTurnstile);
      const currentWidget = widgetId.current;
      widgetId.current = null;
      token.current = '';
      if (window.turnstile) {
        if (currentWidget) window.turnstile.remove(currentWidget);
        container?.replaceChildren();
      }
    };
  }, [siteKey, sent, t]);

  const submit = async () => {
    if (!sent) {
      if (!siteKey) {
        setError(t('account.checkUnavailable'));
        return;
      }
      if (!token.current) {
        setError(t('account.checkFailed'));
        return;
      }
    }
    setLoading(true);
    setError('');
    try {
      if (!sent) {
        await api.sendCode(email.trim(), token.current);
        if (!mounted.current) return;
        setSent(true);
        return;
      }
      const session = await api.verifyCode(email.trim(), code.trim());
      if (mounted.current) navigate(afterSignIn(window.location.search, session.user.admin));
    } catch (cause) {
      if (mounted.current) setError(messageFor(t, cause));
      if (!sent && siteKey && turnstileReady) resetTurnstile();
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  return <div className="account-shell">
    <div className="account-top"><a className="brand" href="/" onClick={event => { event.preventDefault(); navigate('/'); }}><BrandMark className="brand-mark" /><span>sahar<span className="brand-dot">.</span></span></a></div>
    <Card className="account-card">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Title level={3}>{t('account.loginTitle')}</Title>
        <Paragraph type="secondary">{t('account.loginBody')}</Paragraph>
        <Form layout="vertical" onFinish={() => void submit()}>
          <Form.Item label={t('account.email')}>
            <Input type="email" autoComplete="email" value={email} disabled={sent} onChange={event => setEmail(event.target.value)} aria-label={t('account.email')} />
          </Form.Item>
          {sent && <Form.Item label={t('account.code')}>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value)} aria-label={t('account.code')} />
          </Form.Item>}
          {siteKey && !sent && <div ref={widgetContainer} />}
          <Button type="primary" htmlType="submit" block loading={loading} disabled={!email.trim() || (!sent && (!configLoaded || !siteKey || !turnstileReady)) || (sent && code.trim().length !== 6)}>{sent ? t('account.verify') : t('account.sendCode')}</Button>
        </Form>
        {error && <Alert type="error" showIcon message={error} />}
        <Button type="link" onClick={() => navigate('/')}>{t('account.backHome')}</Button>
      </Space>
    </Card>
  </div>;
}
