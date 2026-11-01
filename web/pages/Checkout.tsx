import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, Result, Space, Spin, Statistic, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, CreditCardOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api, type CheckoutOrder } from '../api';
import type { Navigate } from '../App';
import { checkoutReturn, rememberCheckoutReturn } from '../navigation';
import { readCheckout } from '../checkout-data';
const { Text } = Typography;
function money(cents: number, currency: string, locale: string) { return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100); }
function Status({ status }: { status: string }) {
 const { t } = useTranslation();
 const colors: Record<string, string> = { paid: 'green', pending_payment: 'gold', processing: 'processing', failed: 'red' };
 const labels: Record<string, string> = { paid: t('ui.statusPaid'), pending_payment: t('ui.statusPending'), processing: t('ui.statusProcessing'), failed: t('ui.statusFailed') };
 return <Tag color={colors[status] ?? 'default'}>{labels[status] ?? status.replaceAll('_', ' ')}</Tag>;
}

export default function Checkout({ orderId, navigate }: { orderId: string; navigate: Navigate }) {
  const { t, i18n } = useTranslation();
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [returnTo, setReturnTo] = useState('/workspace');
  const search = window.location.search;
  useEffect(() => {
    let active = true;
    const preferred = checkoutReturn(orderId, search);
    if (preferred) {
      rememberCheckoutReturn(orderId, preferred);
      setReturnTo(preferred);
    } else {
      setReturnTo('/workspace');
      void api.session().then(session => {
        if (active) setReturnTo(session.user?.admin ? '/console/orders' : '/workspace');
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [orderId, search]);
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token') ?? params.get('token') ?? '';
  const paymentReturn = params.get('payment_return') === '1';
  const paymentCancelled = params.get('payment_cancelled') === '1';
  const returned = paymentReturn || paymentCancelled;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setOrder(null);
    setIsDemo(false);
    setError('');
    const load = async () => {
      try {
        const next = await readCheckout(orderId, accessToken, controller.signal);
        if (!active) return;
        setOrder(next);
        setIsDemo(!accessToken);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : t('ui.error'));
      }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [orderId, accessToken, t, loadAttempt]);
  const complete = async () => {
    if (!agreed || !order) return;
    setLoading(true);
    setError('');
    try {
      if (isDemo) {
        await api.completeDemoOrder(orderId);
        navigate('/demo/' + order.conversation_id);
      } else if (paymentReturn) {
        const next = await api.capturePaymentOrder(orderId, accessToken);
        setOrder(next.order);
        setAgreed(false);
      } else {
        const next = await api.acceptPaymentTerms(orderId, accessToken);
        setOrder(next.order);
        if (next.order.approval_url) window.location.assign(next.order.approval_url);
        else setError(t('ui.approvalMissing'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('ui.error'));
    } finally {
      setLoading(false);
    }
  };
  if (!order) return <div className="page-loading" role="status">{error ? <Alert type="error" message={error} action={<Button onClick={() => setLoadAttempt(value => value + 1)}>{t('ui.refresh')}</Button>} /> : <><Spin size="large" /><span>{t('ui.loading')}</span></>}</div>;
  const paid = order.status === 'paid';
  const processing = order.status === 'processing';
  const needsApproval = !isDemo && !paymentReturn;
  const agreement = isDemo ? t('ui.depositAgreement') : t('ui.depositAgreementReal');
  return <div className="checkout-shell"><Card className="checkout-panel">
    <Space direction="vertical" size={22} style={{ width: '100%' }}>
      <div className="checkout-brand"><Text strong>sahar.</Text>{isDemo ? <Tag color="orange">{t('ui.mock')}</Tag> : <Tag color="blue">{t('ui.paypal')}</Tag>}</div>
      <Result status={paid ? 'success' : paymentCancelled ? 'warning' : 'info'} icon={paid ? <CheckOutlined /> : <CreditCardOutlined />} title={order.title} subTitle={order.area} />
      <Statistic title={t('console.deposit')} value={money(order.amount_cents, order.currency, i18n.language)} />
      <Status status={order.status} />
      {order.terms && <Alert type="warning" showIcon message={order.terms} />}
      {returned && !paid && <Alert type={paymentCancelled ? 'warning' : 'info'} showIcon message={t(paymentCancelled ? 'ui.paymentCancelled' : 'ui.paymentReturned')} />}
      {!paid && !processing && <Checkbox checked={agreed} onChange={event => setAgreed(event.target.checked)}>{agreement}</Checkbox>}
      {isDemo
        ? <Button type="primary" size="large" block loading={loading} disabled={!agreed || paid} icon={<CheckOutlined />} onClick={() => void complete()}>{paid ? t('ui.statusPaid') : t('ui.demoPay')}</Button>
        : <Button type="primary" size="large" block loading={loading} disabled={!agreed || paid || processing || order.status !== 'pending_payment' || !accessToken} icon={<CheckOutlined />} onClick={() => void complete()}>{paid ? t('ui.statusPaid') : processing ? t('ui.statusProcessing') : t(needsApproval ? 'ui.continueToPaypal' : 'ui.capturePayment')}</Button>}
      {isDemo && <Text type="secondary">{t('console.noRealMoney')}</Text>}
      {(isDemo || paid) && <Button block icon={<ArrowLeftOutlined />} onClick={() => navigate(isDemo ? '/demo/' + order.conversation_id : returnTo)}>{t(isDemo ? 'ui.back' : returnTo === '/console/orders' ? 'account.backToOrders' : returnTo.startsWith('/console/') ? 'account.backToAgentWorkspace' : returnTo === '/admin' ? 'account.admin' : 'account.backToChat')}</Button>}
      {error && <Alert type="error" message={error} />}
    </Space>
  </Card></div>;
}

