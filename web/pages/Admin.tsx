import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Drawer, Form, Grid, Input, InputNumber, Modal, Space, Table, Tabs, Typography, type TableColumnsType } from 'antd';
import { useTranslation } from 'react-i18next';
import { ApiError, api, type AdminLedgerEntry, type AdminUser, type AdminUserEvent } from '../api';
import BrandMark from '../components/BrandMark';
import { loginPath } from '../navigation';
import type { Navigate } from '../App';

const { Paragraph, Text, Title } = Typography;

type HistoryTab = 'signin' | 'credits';

const CREDIT_REASON_KEYS: Record<string, string> = {
  signup_grant: 'account.creditReasonSignup',
  admin_grant: 'account.creditReasonAdmin',
  ai_reply: 'account.creditReasonAi'
};

export default function Admin({ navigate }: { navigate: Navigate }) {
  const { t, i18n } = useTranslation();
  const screens = Grid.useBreakpoint();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [historyUser, setHistoryUser] = useState<AdminUser | null>(null);
  const [events, setEvents] = useState<AdminUserEvent[]>([]);
  const [ledger, setLedger] = useState<AdminLedgerEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('signin');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const historyRequest = useRef(0);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantForm] = Form.useForm<{ amount: number; note: string }>();
  const [grantError, setGrantError] = useState('');
  const [success, setSuccess] = useState('');
  const [requestId, setRequestId] = useState(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const data = await api.adminUsers();
    setUsers(data.users);
  };

  useEffect(() => {
    void api.session().then(async session => {
      if (!session.user) { navigate(loginPath('/admin')); return; }
      if (!session.user.admin) { setError(t('account.notAdmin')); return; }
      await load();
    }).catch(() => navigate(loginPath('/admin'))).finally(() => setLoading(false));
  }, [navigate, t]);

  const loadUserDetail = async (userId: string) => {
    const request = ++historyRequest.current;
    setHistoryLoading(true);
    setHistoryError('');
    setEvents([]);
    setLedger([]);
    try {
      const detail = await api.adminUser(userId);
      if (request !== historyRequest.current) return;
      if (detail.user) setHistoryUser(current => current?.id === userId ? { ...current, ...detail.user } : current);
      setEvents(detail.events ?? []);
      setLedger(detail.ledger ?? []);
    } catch (cause) {
      if (request !== historyRequest.current) return;
      setHistoryError(cause instanceof ApiError ? cause.message : t('ui.error'));
    } finally {
      if (request === historyRequest.current) setHistoryLoading(false);
    }
  };

  const openHistory = (user: AdminUser, tab: HistoryTab) => {
    setHistoryUser(user);
    setHistoryTab(tab);
    setHistoryOpen(true);
    void loadUserDetail(user.id);
  };

  const closeHistory = () => {
    historyRequest.current += 1;
    setHistoryOpen(false);
    setHistoryLoading(false);
    setHistoryError('');
    setEvents([]);
    setLedger([]);
    setHistoryUser(null);
  };

  const reasonLabel = (reason: string) => {
    const key = CREDIT_REASON_KEYS[(reason ?? '').trim()];
    return key ? t(key) : t('account.creditReasonOther', { reason: (reason ?? '').trim() || '—' });
  };

  const grant = async () => {
    if (!target || saving) return;
    const values = await grantForm.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    setGrantError('');
    try {
      const result = await api.grantCredits({ userId: target.id, amount: values.amount, note: values.note.trim(), requestId });
      setGrantOpen(false);
      setRequestId(crypto.randomUUID());
      setUsers(current => current.map(user => user.id === target.id ? { ...user, balance: result.balance } : user));
      setHistoryUser(current => current?.id === target.id ? { ...current, balance: result.balance } : current);
      setSuccess(t('account.grantDone', { count: values.amount, balance: result.balance }));
      grantForm.resetFields();
      if (historyOpen && historyUser?.id === target.id) void loadUserDetail(target.id);
    } catch (cause) {
      setGrantError(cause instanceof ApiError ? cause.message : t('ui.error'));
    } finally {
      setSaving(false);
    }
  };

  const ledgerColumns: TableColumnsType<AdminLedgerEntry> = [
    { title: t('account.creditTime'), dataIndex: 'created_at', width: 170, render: (value: string) => new Date(value).toLocaleString(i18n.language) },
    { title: t('account.creditChange'), dataIndex: 'delta', width: 90, align: 'right', render: (value: number) => <Text type={value > 0 ? 'success' : value < 0 ? 'danger' : 'secondary'}>{value > 0 ? `+${value}` : String(value)}</Text> },
    { title: t('account.creditBalanceAfter'), dataIndex: 'balance_after', width: 110, align: 'right' },
    { title: t('account.creditReason'), dataIndex: 'reason', width: 170, render: (value: string) => reasonLabel(value) },
    { title: t('account.note'), dataIndex: 'note', width: 240, render: (value: string | null) => value ? <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</span> : '—' },
    { title: t('account.creditActor'), dataIndex: 'actor_user_id', width: 150, render: (value: string | null) => value ?? '—' }
  ];

  return <div className="account-shell admin-shell">
    <header className="account-top admin-top">
      <a className="brand" href="/" onClick={event => { event.preventDefault(); navigate('/'); }}><BrandMark className="brand-mark" /><span>sahar<span className="brand-dot">.</span></span></a>
      <Space wrap>
        <Button onClick={() => navigate('/workspace')}>{t('account.buyerChat')}</Button>
        <Button onClick={() => navigate('/console/overview')}>{t('account.agentWorkspace')}</Button>
        <Button onClick={() => navigate('/console/orders')}>{t('pages.orders')}</Button>
      </Space>
    </header>
    <main className="account-frame admin-frame">
      <Title level={3}>{t('account.admin')}</Title>
      <Paragraph type="secondary">{t('account.sandboxNote')}</Paragraph>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {success && <Alert type="success" showIcon message={success} style={{ marginBottom: 16 }} />}
      <Card className="admin-users-card">
        <Table loading={loading} size="middle" rowKey="id" dataSource={users} scroll={{ x: 1280 }} pagination={{ pageSize: 20, hideOnSinglePage: true }} columns={[
          { title: t('account.email'), dataIndex: 'email', width: 260 },
          { title: t('account.registered'), dataIndex: 'created_at', render: (value: string) => new Date(value).toLocaleString(i18n.language) },
          { title: t('account.lastLogin'), dataIndex: 'last_login_at', render: (value: string | null) => value ? new Date(value).toLocaleString(i18n.language) : '—' },
          { title: t('account.balance'), dataIndex: 'balance', width: 90, align: 'right' },
          { title: t('account.spent'), dataIndex: 'spent', width: 90, align: 'right' },
          { title: t('account.verified'), dataIndex: 'email_verified_at', render: (value: string) => value ? t('account.verified') : '—' },
          { title: t('ui.actions'), width: 400, render: (_, user) => <Space size={0}>
            <Button type="link" onClick={() => openHistory(user, 'signin')}>{t('account.loginHistory')}</Button>
            <Button type="link" onClick={() => openHistory(user, 'credits')}>{t('account.creditHistory')}</Button>
            <Button type="link" onClick={() => { setTarget(user); setError(''); setGrantError(''); setSuccess(''); grantForm.resetFields(); setRequestId(crypto.randomUUID()); setGrantOpen(true); }}>{t('account.addCredits')}</Button>
          </Space> }
        ]} />
      </Card>
      <Modal title={t('account.addCredits')} open={grantOpen} onCancel={() => { if (!saving) setGrantOpen(false); }} onOk={() => void grant()} confirmLoading={saving} closable={!saving} maskClosable={!saving} cancelButtonProps={{ disabled: saving }} okText={t('account.grant')}>
        <Form form={grantForm} layout="vertical" initialValues={{ amount: 10, note: '' }} disabled={saving}>
          <Form.Item label={t('account.email')}><Input value={target?.email} disabled /></Form.Item>
          <Form.Item name="amount" label={t('account.amount')} rules={[{ required: true, type: 'integer', min: 1, max: 500, message: t('account.amountRequired') }]}><InputNumber min={1} max={500} precision={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="note" label={t('account.note')} rules={[{ required: true, whitespace: true, max: 500, message: t('account.noteRequired') }]}><Input.TextArea maxLength={500} showCount placeholder={t('account.notePlaceholder')} /></Form.Item>
        </Form>
        {grantError && <Alert type="error" showIcon message={grantError} />}
      </Modal>
      <Drawer title={t('account.historyTitle')} open={historyOpen} onClose={closeHistory} size={screens.lg ? 1040 : screens.md ? 720 : '100%'} styles={{ body: { paddingTop: 12 } }}>
        {historyUser && <Paragraph style={{ marginTop: 0, marginBottom: 12 }}>
          <Text strong>{historyUser.email}</Text>
          <Text type="secondary">{` · ${t('account.balance')}: ${historyUser.balance}`}</Text>
        </Paragraph>}
        {historyError && <Alert
          type="error"
          showIcon
          message={historyError}
          style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={() => historyUser && void loadUserDetail(historyUser.id)}>{t('ui.refresh')}</Button>}
        />}
        <Tabs
          activeKey={historyTab}
          onChange={key => setHistoryTab(key as HistoryTab)}
          items={[
            {
              key: 'signin',
              label: t('account.loginHistory'),
              children: <Table
                rowKey="id"
                size="small"
                dataSource={events}
                loading={historyLoading}
                pagination={false}
                scroll={{ x: 420 }}
                locale={{ emptyText: historyLoading ? t('ui.loading') : t('account.signInHistoryEmpty') }}
                columns={[
                  { title: t('account.loginHistory'), dataIndex: 'event_type' },
                  { title: t('account.lastLogin'), dataIndex: 'created_at', render: (value: string) => new Date(value).toLocaleString(i18n.language) }
                ]}
              />
            },
            {
              key: 'credits',
              label: t('account.creditHistory'),
              children: <>
                <Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 8 }}>{t('account.creditScopeNote')}</Paragraph>
                {ledger.length > 0 && <Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 8 }}>{t('account.creditEntriesShown', { count: ledger.length })}</Paragraph>}
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={ledger}
                  loading={historyLoading}
                  pagination={false}
                  scroll={{ x: 930 }}
                  locale={{ emptyText: historyLoading ? t('ui.loading') : t('account.creditHistoryEmpty') }}
                  columns={ledgerColumns}
                />
              </>
            }
          ]}
        />
      </Drawer>
    </main>
  </div>;
}
