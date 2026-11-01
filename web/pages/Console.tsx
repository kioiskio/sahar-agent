import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Avatar, Badge, Button, Card, Col, Descriptions, Drawer, Empty, Form, Input, InputNumber, Layout, List, Menu, message, Modal, Progress, Row, Segmented, Select, Space, Spin, Statistic, Steps, Switch, Table, Tag, Typography } from 'antd';
import type { InputRef, MenuProps } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, BankOutlined, CheckOutlined, CloseOutlined, EditOutlined, PauseCircleOutlined, PlusOutlined, CommentOutlined, CreditCardOutlined, DashboardOutlined, DollarOutlined, HomeOutlined, LockOutlined, MenuOutlined, MessageOutlined, PlayCircleOutlined, RobotOutlined, SafetyCertificateOutlined, SendOutlined, SettingOutlined, ShopOutlined, TeamOutlined, ThunderboltFilled } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ApiError, api, type Bootstrap, type Conversation, type ConversationDetail, type DemoSnapshot, type Listing, type ListingInput, type Message, type Order, type SettingsInput } from '../api';
import { languageNames, locales, type Locale } from '../i18n';
import ListingCover from '../components/ListingCover';
import BrandMark from '../components/BrandMark';
import BuyerAvatar from '../components/BuyerAvatar';
import type { Navigate } from '../App';
import { checkoutFrom, checkoutPath, loginPath } from '../navigation';

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

function money(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

const MOBILE_BREAKPOINT = 992;

function displayBuyer(waId: string, sandboxBuyer: string, demoBuyer: string) {
  if (waId.startsWith('tg:')) return 'Telegram · ' + waId.slice(3);
  if (waId.startsWith('demo-')) return demoBuyer;
  return waId.startsWith('sandbox-') ? sandboxBuyer + ' · ' + waId : waId;
}

function validSandboxCheckoutUrl(value: string) {
  return checkoutPath(value);
}

function ChatLog({ messages: items, loading = false, className = '', label }: { messages: Message[]; loading?: boolean; className?: string; label?: string }) {
  const { t, i18n } = useTranslation();
  const senderLabels: Record<string, string> = { buyer: t('ui.buyer'), agent: t('ui.agent'), system: t('ui.system') };
  const accessibleLabel = label ?? t('ui.conversationMessages');
  const logRef = useRef<HTMLDivElement>(null);
    const lastMessageId = items.at(-1)?.id;
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lastMessageId, loading]);
  const focusComposer = () => {
    const scope = logRef.current?.parentElement;
    const input = scope?.querySelector<HTMLInputElement>('.chat-window input, .agent-reply-form input');
    input?.focus({ preventScroll: true });
  };
  return <div ref={logRef} className={('chat-messages ' + className).trim()} role="log" aria-live="polite" aria-label={accessibleLabel} tabIndex={0} onFocus={focusComposer} onClick={focusComposer}>
    {items.map(item => <div className={'chat-bubble ' + (item.direction === 'inbound' ? 'buyer' : 'agent')} key={item.id}><Text type="secondary">{item.sender_type === 'ai' ? 'SAHAR AI' : senderLabels[item.sender_type] ?? item.sender_type}</Text><p>{item.body}</p><time dateTime={item.created_at}>{new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(item.created_at))}</time></div>)}
    {loading && <Spin aria-label={accessibleLabel} />}
  </div>;
}

function Status({ status }: { status: string }) {
  const { t } = useTranslation();
  const colors: Record<string, string> = { paid: 'green', active: 'blue', handoff: 'purple', pending_payment: 'gold', processing: 'processing', failed: 'red' };
  const labels: Record<string, string> = { paid: t('ui.statusPaid'), active: t('console.active'), handoff: t('console.handoff'), pending_payment: t('ui.statusPending'), processing: t('ui.statusProcessing'), failed: t('ui.statusFailed') };
  return <Tag color={colors[status] ?? 'default'}>{labels[status] ?? status.replaceAll('_', ' ')}</Tag>;
}


export function ConsoleHeader({ title, onMenu, extra }: { title: string; onMenu: () => void; extra?: ReactNode }) {
  const { t } = useTranslation();
  return <div className="workspace-header"><div className="workspace-title"><Button className="mobile-menu" type="text" icon={<MenuOutlined />} onClick={onMenu} aria-label={t('ui.menu')} /><div><Text className="eyebrow-text">SAHAR / {t('account.agentWorkspace')}</Text><Title level={2}>{title}</Title></div></div><Space size="middle">{extra}</Space></div>;
}

function Overview({ data, navigate, refresh }: { data: Bootstrap; navigate: Navigate; refresh: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const cards = [
    { title: t('metrics.conversations'), value: data.stats.conversations, icon: <CommentOutlined />, tone: 'green' },
    { title: t('metrics.highIntent'), value: data.stats.highIntent, icon: <ThunderboltFilled />, tone: 'orange' },
    { title: t('metrics.deposits'), value: data.stats.paidOrders, icon: <DollarOutlined />, tone: 'blue', suffix: money(data.stats.paidCents, data.stats.currency, i18n.language) },
    { title: t('metrics.handoffs'), value: data.stats.pendingHandoffs, icon: <TeamOutlined />, tone: 'purple' }
  ];
  return <>
    <Alert type="info" showIcon message={data.settings.connections.telegram ? t('telegram.adminNotice') : data.settings.paypal_mode === 'sandbox' ? t('demoWorkspace.adminNotice') : t('legal.note')} className="demo-alert" />
    <Row gutter={[20, 20]}>{cards.map(card => <Col xs={12} sm={12} xl={6} key={card.title}><Card className="metric-card"><div className={'metric-icon ' + card.tone}>{card.icon}</div><Statistic title={card.title} value={card.value} /><Text type="secondary">{card.suffix ?? (data.settings.paypal_mode === 'sandbox' ? t('ui.sandbox') : t('account.agentWorkspace'))}</Text></Card></Col>)}</Row>
    <Row gutter={[20, 20]} className="section-row"><Col xs={24} xl={15}><Card title={t('flows.buyerTitle')} extra={<Tag color="green">{t('console.active')}</Tag>} className="dashboard-card"><div className="funnel">{[
      [t('metrics.conversations'), data.stats.conversations, 90],
      [t('metrics.highIntent'), data.stats.highIntent, 65],
      [t('ui.statusPending'), data.orders.filter(order => order.status === 'pending_payment').length, 45],
      [t('console.paid'), data.stats.paidOrders, 30]
    ].map(item => { const [label, value, percent] = item as [string, number, number]; return <div className="funnel-row" key={String(label)}><Text>{label}</Text><Progress percent={value ? percent : 0} showInfo={false} strokeColor="#276749" /><strong>{String(value).padStart(2, '0')}</strong></div>; })}</div><Alert message={t('footer.boundaryText')} type="warning" showIcon /></Card></Col>
      <Col xs={24} xl={9}><Card title={t('metrics.handoffs')} className="dashboard-card handoff-card"><Avatar size={64} icon={<TeamOutlined />} /><Title level={3}>{data.stats.pendingHandoffs} {t('metrics.handoffs')}</Title><Paragraph type="secondary">{t('console.demoIntro')}</Paragraph><Button type="primary" ghost onClick={() => navigate('/demo')} icon={<ArrowRightOutlined />}>{t('console.preview')}</Button></Card></Col></Row>
    <Card title={t('pages.conversations')} className="section-row dashboard-card"><Conversations data={data} refresh={refresh} contained /></Card></>;
}

function ConversationTable({ data, onOpen }: { data: Conversation[]; onOpen: (conversation: Conversation) => void }) {
  const { t } = useTranslation();
  const buyer = (waId: string) => displayBuyer(waId, t('ui.sandboxBuyer'), t('ui.demoBuyer'));
  return <Table rowKey="id" dataSource={data} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: <Empty description={t('ui.noConversations')} /> }} onRow={row => ({ onClick: () => onOpen(row), onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(row); } }, tabIndex: 0, 'aria-label': t('console.openConversation') + ': ' + buyer(row.wa_id), className: 'clickable-row' })} columns={[
    { title: t('pages.conversations'), render: (_, row) => <Space><BuyerAvatar seed={row.wa_id} /><div><Text strong>{buyer(row.wa_id)}</Text><br /><Text type="secondary">{row.locale} · {(row.transport ?? row.channel) === 'telegram' ? 'Telegram' : row.channel === 'demo' ? t('ui.mock') : 'Web'}</Text></div></Space> },
    { title: t('console.score'), dataIndex: 'lead_score', render: score => <Badge count={score} color={score >= 70 ? '#276749' : '#8a968f'} overflowCount={100} /> },
    { title: t('pages.listings'), dataIndex: 'title', render: value => value ?? '—' },
    { title: t('demoWorkspace.status'), dataIndex: 'status', render: status => <Status status={status} /> },
    { title: t('ui.actions'), render: (_, row) => <Button type="link" aria-label={t('console.openConversation') + ': ' + buyer(row.wa_id)} onClick={event => { event.stopPropagation(); onOpen(row); }}>{t('console.openConversation')}</Button> }
  ]} />;
}

function ConversationDrawer({ conversation, onClose, refresh }: { conversation: Conversation | null; onClose: () => void; refresh: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const replyRef = useRef<InputRef>(null);
  const id = conversation?.id;
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setDetail(await api.getConversation(id));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('ui.error'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);
  useEffect(() => {
    setDetail(null);
    setText('');
    setError('');
    void load();
  }, [load]);
  const act = async (action: 'handoff' | 'resume' | 'close') => {
    if (!id) return;
    setActing(action);
    setError('');
    try {
      await api.conversationAction(id, action);
      await Promise.all([load(), refresh()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('ui.error'));
    } finally {
      setActing('');
    }
  };
  const send = async () => {
    if (!id || !text.trim()) return;
    const body = text.trim();
    setSending(true);
    setText('');
    setError('');
    try {
      await api.replyToConversation(id, body);
      await Promise.all([load(), refresh()]);
    } catch (cause) {
      setText(body);
      setError(cause instanceof Error ? cause.message : t('ui.error'));
    } finally {
      setSending(false);
      replyRef.current?.focus();
    }
  };
  const current = detail?.conversation ?? conversation;
  return <Drawer className="conversation-drawer" title={current ? displayBuyer(current.wa_id, t('ui.sandboxBuyer'), t('ui.demoBuyer')) : t('console.openConversation')} extra={current && <Status status={current.status} />} open={Boolean(conversation)} onClose={onClose} size={640} destroyOnHidden={false}>
    {current && <div className="conversation-summary"><Space wrap><Tag>{current.locale} · {(current.transport ?? current.channel) === 'telegram' ? 'Telegram' : current.channel === 'demo' ? t('ui.mock') : 'Web'}</Tag><Tag>{t('console.score')}: {current.lead_score}</Tag></Space><Space wrap className="conversation-controls">
      {current.status !== 'handoff' && current.status !== 'closed' && <Button icon={<TeamOutlined />} loading={acting === 'handoff'} disabled={Boolean(acting)} onClick={() => void act('handoff')}>{t('ui.handoffAction')}</Button>}
      {current.status === 'handoff' && <Button icon={<PauseCircleOutlined />} loading={acting === 'resume'} disabled={Boolean(acting)} onClick={() => void act('resume')}>{t('ui.resumeAction')}</Button>}
      {current.status !== 'closed' && <Button danger icon={<CloseOutlined />} loading={acting === 'close'} disabled={Boolean(acting)} onClick={() => void act('close')}>{t('ui.close')}</Button>}
    </Space></div>}
    {error && <Alert className="operation-alert" type="error" showIcon message={error} />}
    {loading && !detail ? <div className="drawer-loading"><Spin /></div> : <>
      <ChatLog messages={detail?.messages ?? []} loading={loading} className="workspace-chat-log" label={t('console.openConversation') + ': ' + (current ? displayBuyer(current.wa_id, t('ui.sandboxBuyer'), t('ui.demoBuyer')) : '')} />
      <Form className="agent-reply-form" onFinish={() => void send()}><label htmlFor="agent-reply">{t('ui.agentReply')}</label><Space.Compact><Input ref={replyRef} id="agent-reply" value={text} onChange={event => setText(event.target.value)} placeholder={t('ui.agentReplyHint')} maxLength={2000} disabled={sending || current?.status === 'closed'} /><Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={sending} disabled={!text.trim() || current?.status === 'closed'} aria-label={t('ui.send')} /></Space.Compact></Form>
      <section className="conversation-orders" aria-label={t('pages.orders')}><Title level={5}>{t('pages.orders')}</Title>{detail?.orders.length ? detail.orders.map(order => <div className="conversation-order" key={order.id}><div><Text strong>{order.title ?? t('console.deposit')}</Text><br /><Text type="secondary">{money(order.amount_cents, order.currency, i18n.language)}</Text></div><Status status={order.status} /></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.noOrders')} />}</section>
    </>}
  </Drawer>;
}

function Conversations({ data, refresh, contained = false }: { data: Bootstrap; refresh: () => Promise<void>; contained?: boolean }) {
  const [selected, setSelected] = useState<Conversation | null>(null);
  const content = <><ConversationTable data={data.conversations} onOpen={setSelected} /><ConversationDrawer conversation={selected} onClose={() => setSelected(null)} refresh={refresh} /></>;
  return contained ? content : <Card className="dashboard-card">{content}</Card>;
}

type ListingFormValues = {
  title: string; area: string; layout: string; bedrooms: number; bathrooms: number;
  price: number; currency: string; deposit: number; deposit_currency: string; description: string; status: string;
};

function ListingFormModal({ listing, open, onClose, refresh }: { listing: Listing | null; open: boolean; onClose: () => void; refresh: () => Promise<void> }) {
  const { t } = useTranslation();
  const [form] = Form.useForm<ListingFormValues>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    form.setFieldsValue(listing ? {
      title: listing.title, area: listing.area, layout: listing.layout, bedrooms: listing.bedrooms, bathrooms: listing.bathrooms,
      price: listing.price_cents / 100, currency: listing.currency, deposit: listing.deposit_cents / 100,
      deposit_currency: listing.deposit_currency, description: listing.description, status: listing.status
    } : { title: '', area: '', layout: '', bedrooms: 1, bathrooms: 1, price: 0, currency: 'AED', deposit: 0, deposit_currency: 'AED', description: '', status: 'active' });
  }, [form, listing, open]);
  const save = async (values: ListingFormValues) => {
    setSaving(true);
    setError('');
    const payload: ListingInput = {
      title: values.title.trim(), area: values.area.trim(), layout: values.layout.trim(), bedrooms: values.bedrooms, bathrooms: values.bathrooms,
      price_cents: Math.round(values.price * 100), currency: values.currency.toUpperCase(),
      deposit_cents: Math.round(values.deposit * 100), deposit_currency: values.deposit_currency.toUpperCase(),
      description: values.description.trim(), status: values.status
    };
    try {
      if (listing) await api.updateListing(listing.id, payload);
      else await api.createListing(payload);
      await refresh();
      onClose();
      void message.success(t('ui.save'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('ui.error'));
    } finally {
      setSaving(false);
    }
  };
  return <Modal className="listing-modal" title={listing ? 'Edit listing' : t('ui.addListing')} open={open} onCancel={onClose} footer={null} destroyOnHidden={false} width={720}>
    <Form form={form} layout="vertical" onFinish={save} requiredMark="optional">
      {error && <Alert className="operation-alert" type="error" showIcon message={error} />}
      <Row gutter={16}><Col xs={24} sm={12}><Form.Item name="title" label={t('ui.title')} rules={[{ required: true, whitespace: true }]}><Input maxLength={200} /></Form.Item></Col><Col xs={24} sm={12}><Form.Item name="area" label={t('ui.area')} rules={[{ required: true, whitespace: true }]}><Input maxLength={120} /></Form.Item></Col></Row>
      <Form.Item name="layout" label={t('ui.layout')} rules={[{ required: true, whitespace: true }]}><Input maxLength={160} /></Form.Item>
      <Row gutter={16}><Col xs={12}><Form.Item name="bedrooms" label={t('ui.bedrooms')} rules={[{ required: true }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item></Col><Col xs={12}><Form.Item name="bathrooms" label={t('ui.bathrooms')} rules={[{ required: true }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item></Col></Row>
      <Alert className="minor-unit-note" type="info" showIcon message="Enter amounts in major units, for example 1500.00 AED. The API stores exact minor units: 150000 fils (100 fils = 1 AED)." />
      <Row gutter={16}><Col xs={24} sm={16}><Form.Item name="price" label={t('ui.price')} rules={[{ required: true }]}><InputNumber min={0} precision={2} step={0.01} style={{ width: '100%' }} /></Form.Item></Col><Col xs={24} sm={8}><Form.Item name="currency" label={t('ui.currency')} rules={[{ required: true }]}><Input maxLength={3} placeholder="AED" /></Form.Item></Col></Row>
      <Row gutter={16}><Col xs={24} sm={16}><Form.Item name="deposit" label={t('ui.depositAmount')} rules={[{ required: true }]}><InputNumber min={0.01} precision={2} step={0.01} style={{ width: '100%' }} /></Form.Item></Col><Col xs={24} sm={8}><Form.Item name="deposit_currency" label={t('ui.depositCurrency')} rules={[{ required: true }]}><Input maxLength={3} placeholder="AED" /></Form.Item></Col></Row>
      <Form.Item name="description" label={t('ui.description')}><Input.TextArea rows={4} maxLength={4000} showCount /></Form.Item>
      <Form.Item name="status" label={t('demoWorkspace.status')} rules={[{ required: true }]}><Select options={[{ value: 'active', label: t('console.active') }, { value: 'inactive', label: t('ui.inactive') }]} /></Form.Item>
      <div className="modal-actions"><Button onClick={onClose}>{t('ui.cancel')}</Button><Button type="primary" htmlType="submit" loading={saving}>{t('ui.save')}</Button></div>
    </Form>
  </Modal>;
}

function Listings({ listings, refresh }: { listings: Listing[]; refresh: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<Listing | null>(null);
  const [open, setOpen] = useState(false);
  const edit = (listing: Listing | null) => { setSelected(listing); setOpen(true); };
  return <><div className="section-actions"><Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>{t('ui.addListing')}</Button></div>
    {listings.length ? <Row gutter={[20, 20]}>{listings.map(listing => <Col xs={24} md={12} xl={8} key={listing.id}><Card className="property-card" cover={<ListingCover id={listing.id} title={listing.title} area={listing.area} />}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}><div className="listing-title"><div><Title level={4}>{listing.title}</Title><Text type="secondary">{listing.layout}</Text></div><Status status={listing.status} /></div><Space size="large"><Text>{listing.bedrooms} {t('ui.bedrooms')}</Text><Text>{listing.bathrooms} {t('ui.bathrooms')}</Text></Space><Descriptions column={1} size="small" items={[{ key: 'price', label: t('ui.price'), children: <Text strong>{money(listing.price_cents, listing.currency, i18n.language)}</Text> }, { key: 'deposit', label: t('ui.depositAmount'), children: <Text type="success" strong>{money(listing.deposit_cents, listing.deposit_currency, i18n.language)}</Text> }]} /><Paragraph type="secondary">{listing.description}</Paragraph><Button icon={<EditOutlined />} onClick={() => edit(listing)}>Edit listing</Button></Space></Card></Col>)}</Row> : <Card><Empty description={t('ui.noListings')} /></Card>}
    <ListingFormModal key={selected?.id ?? 'new'} listing={selected} open={open} onClose={() => setOpen(false)} refresh={refresh} /></>;
}

function OrderDrawer({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const checkoutUrl = order?.checkout_url ? validSandboxCheckoutUrl(order.checkout_url) : null;
  const items = order ? [
    ...(order.wa_id.startsWith('sandbox-') ? [{ key: 'buyer', label: t('ui.sandboxBuyer'), children: displayBuyer(order.wa_id, t('ui.sandboxBuyer'), t('ui.demoBuyer')) }] : []),
    { key: 'listing', label: t('pages.listings'), children: order.title ?? order.listing_id },
    { key: 'area', label: t('ui.area'), children: order.area ?? '—' },
    { key: 'amount', label: t('ui.depositAmount'), children: money(order.amount_cents, order.currency, i18n.language) },
    { key: 'provider', label: t('ui.paymentProvider'), children: order.provider === 'mock' ? t('ui.mock') : order.provider },
    { key: 'status', label: t('demoWorkspace.status'), children: <Status status={order.status} /> },
    { key: 'created', label: t('ui.createdAt'), children: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.created_at)) },
    { key: 'paid', label: t('ui.paidAt'), children: order.paid_at ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.paid_at)) : '—' },
    { key: 'accepted', label: t('ui.termsAccepted'), children: order.terms_accepted_at ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.terms_accepted_at)) : t('ui.notAccepted') }
  ] : [];
  return <Drawer className="order-details-drawer" title={t('hero.orderLabel')} open={Boolean(order)} onClose={onClose} size={440}><Descriptions column={1} bordered size="small" items={items} />{checkoutUrl && <div className="order-checkout-actions"><Button className="payment-approval-link" type="primary" icon={<CreditCardOutlined />} href={checkoutFrom(checkoutUrl, '/console/orders')}>{t('ui.checkout')}</Button></div>}</Drawer>;
}

function SandboxOrderModal({ open, listings, onClose, refresh }: { open: boolean; listings: Listing[]; onClose: () => void; refresh: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [listingId, setListingId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const activeListings = listings.filter(listing => listing.status === 'active');
  const listing = activeListings.find(item => item.id === listingId);
  const close = () => {
    setListingId('');
    setRequestId('');
    setCheckoutUrl('');
    setError('');
    onClose();
  };
  const selectListing = (id: string) => {
    setListingId(id);
    setRequestId(crypto.randomUUID());
    setCheckoutUrl('');
    setError('');
  };
  const create = async () => {
    if (!listing) return;
    const id = checkoutUrl ? crypto.randomUUID() : requestId || crypto.randomUUID();
    setRequestId(id);
    setLoading(true);
    setError('');
    setCheckoutUrl('');
    try {
      const result = await api.createSandboxOrder(listing.id, i18n.resolvedLanguage as Locale, id);
      const url = validSandboxCheckoutUrl(result.checkoutUrl);
      if (!url) throw new Error(t('ui.sandboxInvalidCheckout'));
      setCheckoutUrl(url);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('ui.error'));
    } finally {
      setLoading(false);
    }
  };
  return <Modal title={t('ui.sandboxOrderTitle')} open={open} onCancel={close} footer={null} destroyOnHidden={false}>
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert type="info" showIcon message={t('ui.sandboxOrderExplanation')} />
      {error && <Alert type="error" showIcon message={error} />}
      <Select aria-label={t('ui.selectListing')} placeholder={t('ui.selectListing')} style={{ width: '100%' }} value={listingId || undefined} onChange={selectListing} options={activeListings.map(item => ({ value: item.id, label: item.title }))} disabled={loading} />
      {listing && <Statistic title={t('ui.sandboxServerAmount')} value={money(listing.deposit_cents, listing.deposit_currency, i18n.language)} />}
      <Button type="primary" icon={<CreditCardOutlined />} loading={loading} disabled={!listing} onClick={() => void create()}>{t(checkoutUrl ? 'ui.sandboxCreateAnother' : 'ui.sandboxCreateOrder')}</Button>
      {checkoutUrl && <Alert type="success" showIcon message={t('ui.sandboxOrderCreated')} description={<Button type="link" href={checkoutFrom(checkoutUrl, '/console/orders')} icon={<CreditCardOutlined />}>{t('ui.sandboxOpenCheckout')}</Button>} />}
    </Space>
  </Modal>;
}

function Orders({ data, refresh }: { data: Bootstrap; refresh: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<Order | null>(null);
  const [sandboxOpen, setSandboxOpen] = useState(false);
  return <Card className="dashboard-card" extra={data.settings.paypal_mode === 'sandbox' && <Button icon={<CreditCardOutlined />} onClick={() => setSandboxOpen(true)}>{t('ui.sandboxCheckoutTest')}</Button>}><Table rowKey="id" dataSource={data.orders} scroll={{ x: 800 }} locale={{ emptyText: <Empty description={t('ui.noOrders')} /> }} onRow={row => ({ onClick: () => setSelected(row), onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(row); } }, tabIndex: 0, 'aria-label': t('hero.orderLabel') + ': ' + (row.title ?? ''), className: 'clickable-row' })} columns={[
    { title: t('hero.orderLabel'), dataIndex: 'id', render: id => <Text code>{id.slice(0, 18)}…</Text> },
    { title: t('pages.listings'), dataIndex: 'title' },
    { title: t('ui.depositAmount'), dataIndex: 'amount_cents', render: (_, row) => <Text strong>{money(row.amount_cents, row.currency, i18n.language)}</Text> },
    { title: t('demoWorkspace.status'), dataIndex: 'status', render: status => <Status status={status} /> },
    { title: t('ui.createdAt'), dataIndex: 'created_at', render: date => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(date)) },
    { title: t('ui.actions'), render: (_, row) => <Button type="link" onClick={event => { event.stopPropagation(); setSelected(row); }}>{t('demoWorkspace.details')}</Button> }
  ]} /><OrderDrawer order={selected} onClose={() => setSelected(null)} /><SandboxOrderModal open={sandboxOpen} listings={data.listings} onClose={() => setSandboxOpen(false)} refresh={refresh} /></Card>;
}

function WorkspaceSettings({ data, refresh }: { data: Bootstrap; refresh: () => Promise<void> }) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (values: { locale: Locale; provider: string; tone: string; autoReply: boolean; terms: string }) => {
    setSaving(true);
    setError('');
    const settings: SettingsInput = { default_locale: values.locale, ai_provider: values.provider, ai_tone: values.tone, auto_reply_enabled: values.autoReply, deposit_terms: values.terms };
    try {
      await api.updateSettings(settings);
      await refresh();
      void message.success(t('ui.save'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('ui.error'));
    } finally {
      setSaving(false);
    }
  };
  return <Row gutter={[20, 20]}><Col xs={24} lg={13}><Card title={t('pages.settings')} className="dashboard-card"><Form form={form} layout="vertical" requiredMark={false} initialValues={{ locale: data.settings.default_locale, provider: data.settings.ai_provider, tone: data.settings.ai_tone, autoReply: Boolean(data.settings.auto_reply_enabled), terms: data.settings.deposit_terms }} onFinish={save}>
    {error && <Alert className="operation-alert" type="error" showIcon closable message="Settings could not be saved" description={error} />}
    <Form.Item name="locale" label={t('ui.language')}><Select options={locales.map(value => ({ value, label: languageNames[value] }))} /></Form.Item>
    <Form.Item name="provider" label={t('ui.aiProvider')}><Select options={[{ value: 'rules', label: t('ui.rules') }, { value: 'openai', label: 'OpenAI' }]} /></Form.Item>
    <Form.Item name="tone" label={t('ui.aiTone')}><Segmented block options={[{ value: 'concise', label: t('ui.concise') }, { value: 'warm', label: t('ui.warm') }, { value: 'professional', label: t('ui.professional') }]} /></Form.Item>
    <Form.Item name="autoReply" label={t('ui.autoReply')} valuePropName="checked"><Switch /></Form.Item>
    <Form.Item name="terms" label={t('ui.terms')}><Input.TextArea rows={5} maxLength={4000} showCount /></Form.Item>
    <Button type="primary" htmlType="submit" icon={<CheckOutlined />} loading={saving}>{t('ui.save')}</Button></Form></Card></Col>
    <Col xs={24} lg={11}><Card title={t('flows.serverTitle')} className="dashboard-card"><List dataSource={[{ icon: <MessageOutlined />, title: 'Telegram Bot', connected: data.settings.connections.telegram, mode: data.settings.connections.telegram ? 'Telegram Bot API' : 'Not configured' }, { icon: <CreditCardOutlined />, title: 'PayPal', connected: data.settings.connections.paypal, mode: data.settings.paypal_mode }, { icon: <RobotOutlined />, title: 'AI provider', connected: data.settings.connections.ai, mode: data.settings.ai_provider }]} renderItem={item => <List.Item actions={[<Tag color={item.connected ? 'green' : 'default'} key="status">{item.connected ? 'Credentials present' : 'No credentials'}</Tag>]}><List.Item.Meta avatar={<Avatar icon={item.icon} />} title={item.title} description={item.mode} /></List.Item>} /><Alert type="info" showIcon icon={<LockOutlined />} message={t('ui.connectionNote')} /></Card></Col></Row>;
}

function Demo({ id, navigate }: { id?: string; navigate: Navigate }) {
  const { t, i18n } = useTranslation();
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const inputRef = useRef<InputRef>(null);
  const load = useCallback(async () => { if (id) { try { setSnapshot(await api.getDemo(id)); } catch (cause) { setError(cause instanceof Error ? cause.message : t('ui.error')); } } }, [id, t]);
  useEffect(() => {
    if (id) setSnapshot(null);
    void load();
  }, [load]);
  const start = async () => { setLoading(true); try { const next = await api.createDemo(i18n.resolvedLanguage as Locale); setSnapshot(next); navigate('/demo/' + next.conversation.id); } catch (cause) { setError(cause instanceof Error ? cause.message : t('ui.error')); } finally { setLoading(false); } };
  const send = async (body: string) => { if (!snapshot || !body.trim()) return; setLoading(true); setText(''); setError(''); try { setSnapshot(await api.sendDemo(snapshot.conversation.id, body)); } catch (cause) { setError(cause instanceof Error ? cause.message : t('ui.error')); } finally { setLoading(false); inputRef.current?.focus(); } };
  if (!id && !snapshot) return <div className="demo-welcome"><Card><div className="demo-welcome-icon"><MessageOutlined /></div><Tag color="orange">{t('ui.mock')}</Tag><Title>{t('console.demo')}</Title><Paragraph type="secondary">{t('console.demoIntro')}</Paragraph><Steps orientation="vertical" current={0} items={[{ title: t('flows.buyerLabel'), icon: <MessageOutlined /> }, { title: t('flows.webLabel'), icon: <RobotOutlined /> }, { title: t('flows.serverLabel'), icon: <CreditCardOutlined /> }]} /><Button type="primary" size="large" icon={<PlayCircleOutlined />} loading={loading} onClick={() => void start()}>{t('demoWorkspace.tryChat')}</Button><Button type="link" onClick={() => navigate('/demo/workspace/overview')}>{t('ui.back')} · {t('demoWorkspace.title')}</Button><Paragraph type="secondary" className="demo-disclaimer"><SafetyCertificateOutlined /> {t('console.noRealMoney')}</Paragraph>{error && <Alert type="error" message={error} />}</Card></div>;
  if (!snapshot) return <div className="page-loading">{error ? <Alert type="error" message={error} /> : <Spin size="large" />}</div>;
  const listing = snapshot.listings.find(item => item.id === snapshot.conversation.selected_listing_id);
  const stageKeys: Record<string, string> = { new: 'stageNew', exploring: 'stageExploring', qualified: 'stageQualified', checkout: 'stageCheckout', paid: 'stagePaid' };
  const stageLabel = t('chatDemo.' + (stageKeys[snapshot.conversation.intent_stage] ?? 'stageNew'));
  return <div className="demo-shell"><div className="demo-toolbar"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/demo/workspace/overview')}>{t('demoWorkspace.title')}</Button><Space wrap className="demo-reset-actions"><Button icon={<PlayCircleOutlined />} onClick={() => navigate('/demo')}>{t('ui.demoReset')}</Button></Space></div>
    <div className="demo-notice"><SafetyCertificateOutlined /><Text>{t('chatDemo.notice')}</Text></div>
    <div className="demo-layout"><Row gutter={[24, 24]}><Col xs={24} lg={16}><Card className="chat-window" title={<Space><BuyerAvatar seed={snapshot.conversation.wa_id} /><div><Text strong>{t('ui.demoBuyer')}</Text><br /><Text type="secondary">{languageNames[snapshot.conversation.locale]} · Telegram</Text></div></Space>} extra={<Status status={snapshot.conversation.status} />}>
      <ChatLog messages={snapshot.messages} loading={loading} label={t('ui.demoConversationMessages')} />
      <div className="chat-composer"><div className="chat-actions"><Text type="secondary">{t('chatDemo.shortcuts')}</Text><Space wrap>{[
        { body: 'Marina Sky Residence', label: 'chooseListing', disabled: false },
        { body: 'deposit', label: 'reviewDeposit', disabled: !listing },
        { body: 'confirm deposit', label: 'confirmDeposit', disabled: !listing || !!snapshot.order }
      ].map(action => <Button key={action.label} size="small" onClick={() => void send(action.body)} disabled={loading || action.disabled}>{t('chatDemo.' + action.label)}</Button>)}</Space></div>
      <Form onFinish={() => void send(text)}><Space.Compact style={{ width: '100%' }}><Input ref={inputRef} value={text} onChange={event => setText(event.target.value)} placeholder={t('ui.demoHint')} aria-label={t('ui.demoHint')} maxLength={2000} /><Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading} disabled={!text.trim()} aria-label={t('ui.send')} /></Space.Compact></Form>{error && <Alert type="error" message={error} />}</div></Card></Col>
      <Col xs={24} lg={8}><div className="demo-sidebar"><Card title={t('hero.intentLabel')} className="demo-intent-card"><div className="demo-score"><Text>{stageLabel}</Text><Text strong>{snapshot.conversation.lead_score}%</Text></div><Progress percent={snapshot.conversation.lead_score} showInfo={false} strokeColor="#276749" /><Descriptions column={1} size="small" colon={false} items={[{ key: 'language', label: t('ui.language'), children: languageNames[snapshot.conversation.locale] }, { key: 'ai', label: 'AI', children: t('chatDemo.ruleReplies') }]} /></Card>
        <Card title={t('console.deposit')} className="demo-deposit-card">{listing ? <Space direction="vertical" size={16} style={{ width: '100%' }}><div><Text type="secondary">{listing.area}</Text><Title level={4}>{listing.title}</Title></div>{snapshot.order ? <><Statistic title={t('console.deposit')} value={money(snapshot.order.amount_cents, snapshot.order.currency, i18n.language)} /><Status status={snapshot.order.status} />{snapshot.order.status !== 'paid' && snapshot.checkoutUrl && <Button type="primary" block icon={<CreditCardOutlined />} onClick={() => navigate(snapshot.checkoutUrl!)}>{t('ui.checkout')}</Button>}</> : <><Statistic title={t('console.deposit')} value={money(listing.deposit_cents, listing.deposit_currency, i18n.language)} /><Button block onClick={() => void send('deposit')} disabled={loading} icon={<CreditCardOutlined />}>{t('chatDemo.reviewDeposit')}</Button></>}</Space> : <div className="demo-listing-empty"><HomeOutlined /><Text type="secondary">{t('ui.selectListing')}</Text><Button block onClick={() => void send('Marina Sky Residence')} disabled={loading}>{t('chatDemo.chooseListing')}</Button></div>}</Card>
        </div></Col></Row></div></div>;
}


export default function Console({ path, navigate }: { path: string; navigate: Navigate }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const isPublicFlow = path.startsWith('/demo');
  const refresh = useCallback(async () => {
    setError('');
    try { setData(await api.bootstrap()); }
    catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setAllowed(false);
        setData(null);
        navigate(loginPath(path));
      }
      setError(cause instanceof Error ? cause.message : t('ui.error'));
      throw cause;
    }
  }, [navigate, path, t]);
  useEffect(() => {
    if (isPublicFlow) return;
    let active = true;
    void api.session().then(session => {
      if (!active) return;
      if (!session.user) { navigate(loginPath(path)); return; }
      if (!session.user.admin) { setAllowed(false); setError(t('account.notAdmin')); return; }
      setAllowed(true);
      void refresh().catch(() => undefined);
    }).catch(() => { if (active) navigate(loginPath(path)); });
    const resize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', resize);
    return () => { active = false; window.removeEventListener('resize', resize); };
  }, [refresh, isPublicFlow, navigate, t]);
  const logout = () => { void api.logout().finally(() => navigate('/')); };
  if (path.startsWith('/demo')) return <Demo id={path.split('/')[2]} navigate={navigate} />;
  if (!allowed) return <div className="page-loading">{error ? <Card style={{ width: 420, maxWidth: '100%' }}><Alert type="warning" showIcon message={error} /><Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate('/workspace')}>{t('account.buyerChat')}</Button></Card> : <Spin size="large" />}</div>;
  if (!data) return <div className="page-loading">{error ? <Alert type="error" message={error} action={<Button onClick={() => void refresh().catch(() => undefined)}>{t('ui.refresh')}</Button>} /> : <Spin size="large" />}</div>;
  const active = ['overview', 'conversations', 'listings', 'orders', 'settings'].includes(path.split('/')[2]) ? path.split('/')[2] : 'overview';
  const menuItems: MenuProps['items'] = [
    { key: 'overview', icon: <DashboardOutlined />, label: t('pages.overview') },
    { key: 'conversations', icon: <MessageOutlined />, label: t('pages.conversations') },
    { key: 'listings', icon: <ShopOutlined />, label: t('pages.listings') },
    { key: 'orders', icon: <CreditCardOutlined />, label: t('pages.orders') },
    { key: 'settings', icon: <SettingOutlined />, label: t('pages.settings') }
  ];
  const sidebar = <div className="sidebar-content"><a className="console-logo" dir="ltr" href="/" onClick={event => { event.preventDefault(); navigate('/'); }}><BrandMark className="console-brand-mark" />sahar.</a><Card className="workspace-card"><Space><Avatar icon={<BankOutlined />} /><div><Text strong>{t('account.agentWorkspace')}</Text><br /><Text type="secondary">{data.settings.paypal_mode === 'sandbox' ? t('ui.sandbox') : data.settings.channel_mode === 'mock' ? t('console.demoMode') : t('account.agentWorkspace')}</Text></div></Space></Card><Menu theme="dark" mode="inline" selectedKeys={[active]} items={menuItems} onClick={({ key }) => { navigate('/console/' + key); setMenuOpen(false); }} /><div className="sidebar-bottom"><Button type="primary" block onClick={() => navigate('/admin')}>{t('account.admin')}</Button><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/workspace')}>{t('account.buyerChat')}</Button></div></div>;
  return <Layout className="workspace-shell"><Sider width={248} breakpoint="lg" collapsedWidth={0} trigger={null}>{sidebar}</Sider><Drawer placement="left" open={isMobile && menuOpen} onClose={() => setMenuOpen(false)} width={280} className="workspace-drawer">{sidebar}</Drawer><Layout><Header className="console-header"><Button className="console-menu" type="text" icon={<MenuOutlined />} onClick={() => setMenuOpen(true)} aria-label={t('ui.menu')} /><Text strong>{t('account.agentWorkspace')}</Text></Header><Content className="workspace-content"><div className="workspace-heading"><div><Text className="eyebrow-text">SAHAR / {t('account.agentWorkspace')}</Text><Title level={2}>{t('pages.' + active)}</Title></div><Space wrap className="workspace-actions"><Button type="primary" onClick={() => navigate('/workspace')}>{t('account.buyerChat')}</Button><Button onClick={() => navigate('/admin')}>{t('account.admin')}</Button><Button icon={<LockOutlined />} onClick={logout}>{t('account.logout')}</Button></Space></div>{active === 'overview' && <Overview data={data} navigate={navigate} refresh={refresh} />}{active === 'conversations' && <Conversations data={data} refresh={refresh} />}{active === 'listings' && <Listings listings={data.listings} refresh={refresh} />}{active === 'orders' && <Orders data={data} refresh={refresh} />}{active === 'settings' && <WorkspaceSettings data={data} refresh={refresh} />}</Content></Layout></Layout>;
}
