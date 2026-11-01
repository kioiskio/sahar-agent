import { useState, type KeyboardEvent } from 'react';
import { Alert, Avatar, Badge, Button, Card, Col, Descriptions, Drawer, Empty, Grid, Layout, List, Menu, Modal, Row, Select, Space, Statistic, Switch, Table, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowLeftOutlined, BankOutlined, CommentOutlined, CreditCardOutlined, DashboardOutlined, DollarOutlined, LockOutlined, MenuOutlined, MessageOutlined, PlayCircleOutlined, RedoOutlined, SettingOutlined, ShopOutlined, TeamOutlined, ThunderboltFilled } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { languageNames, locales, type Locale } from '../i18n';
import ListingCover from '../components/ListingCover';
import BrandMark from '../components/BrandMark';
import BuyerAvatar from '../components/BuyerAvatar';

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

type BuyerKey = 'demoWorkspace.buyerA' | 'demoWorkspace.buyerB';
type ConversationStatus = 'active' | 'handoff';
type OrderStatus = 'paid' | 'pending_payment' | 'processing';

type DemoListing = {
  id: string;
  title: string;
  area: string;
  layout: string;
  bedrooms: number;
  bathrooms: number;
  priceCents: number;
  depositCents: number;
  depositCurrency: string;
  currency: string;
  createdAt: string;
};

type DemoMessage = {
  id: string;
  sender: 'buyer' | 'agent';
  translationKey: string;
  createdAt: string;
};

type DemoConversation = {
  id: string;
  buyerKey: BuyerKey;
  listingId: string;
  locale: Locale;
  score: number;
  status: ConversationStatus;
  updatedAt: string;
  messages: DemoMessage[];
};

type DemoOrder = {
  id: string;
  buyerKey: BuyerKey;
  listingId: string;
  amountCents: number;
  currency: string;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
};

type DemoSettings = {
  locale: Locale;
  autoReply: boolean;
};

const DEFAULT_SETTINGS: DemoSettings = { locale: 'en', autoReply: true };

const LISTINGS: DemoListing[] = [
  { id: 'demo-listing-marina', title: 'Marina Sky Residence', area: 'Dubai Marina', layout: '1 BR · Marina view', bedrooms: 1, bathrooms: 2, priceCents: 185000000, depositCents: 10000, depositCurrency: 'USD', currency: 'AED', createdAt: '2026-10-20T09:00:00.000Z' },
  { id: 'demo-listing-palm', title: 'Palm Lagoon Villa', area: 'Palm Jumeirah', layout: '4 BR · Private garden', bedrooms: 4, bathrooms: 5, priceCents: 890000000, depositCents: 25000, depositCurrency: 'USD', currency: 'AED', createdAt: '2026-10-21T09:00:00.000Z' },
  { id: 'demo-listing-downtown', title: 'Downtown Crest', area: 'Downtown Dubai', layout: '2 BR · Burj view', bedrooms: 2, bathrooms: 3, priceCents: 320000000, depositCents: 10000, depositCurrency: 'USD', currency: 'AED', createdAt: '2026-10-22T09:00:00.000Z' }
];

const CONVERSATIONS: DemoConversation[] = [
  {
    id: 'demo-conversation-a', buyerKey: 'demoWorkspace.buyerA', listingId: 'demo-listing-marina', locale: 'en', score: 92, status: 'handoff', updatedAt: '2026-10-28T06:16:00.000Z',
    messages: [
      { id: 'demo-message-a1', sender: 'buyer', translationKey: 'hero.chatHello', createdAt: '2026-10-28T06:14:00.000Z' },
      { id: 'demo-message-a2', sender: 'agent', translationKey: 'hero.chatReply', createdAt: '2026-10-28T06:14:30.000Z' },
      { id: 'demo-message-a3', sender: 'buyer', translationKey: 'hero.chatBuy', createdAt: '2026-10-28T06:15:00.000Z' },
      { id: 'demo-message-a4', sender: 'agent', translationKey: 'hero.chatConfirm', createdAt: '2026-10-28T06:16:00.000Z' }
    ]
  },
  {
    id: 'demo-conversation-b', buyerKey: 'demoWorkspace.buyerB', listingId: 'demo-listing-marina', locale: 'fr', score: 74, status: 'active', updatedAt: '2026-10-27T18:06:00.000Z',
    messages: [
      { id: 'demo-message-b1', sender: 'buyer', translationKey: 'hero.chatHello', createdAt: '2026-10-27T18:04:00.000Z' },
      { id: 'demo-message-b2', sender: 'agent', translationKey: 'hero.chatReply', createdAt: '2026-10-27T18:04:30.000Z' },
      { id: 'demo-message-b3', sender: 'buyer', translationKey: 'hero.chatBuy', createdAt: '2026-10-27T18:05:00.000Z' },
      { id: 'demo-message-b4', sender: 'agent', translationKey: 'hero.chatConfirm', createdAt: '2026-10-27T18:06:00.000Z' }
    ]
  }
];

const ORDERS: DemoOrder[] = [
  { id: 'DEMO-ORDER-001', buyerKey: 'demoWorkspace.buyerA', listingId: 'demo-listing-marina', amountCents: 10000, currency: 'USD', status: 'paid', createdAt: '2026-10-28T06:16:30.000Z', paidAt: '2026-10-28T06:18:00.000Z' },
  { id: 'DEMO-ORDER-002', buyerKey: 'demoWorkspace.buyerB', listingId: 'demo-listing-marina', amountCents: 10000, currency: 'USD', status: 'pending_payment', createdAt: '2026-10-28T07:05:00.000Z', paidAt: null },
  { id: 'DEMO-ORDER-003', buyerKey: 'demoWorkspace.buyerA', listingId: 'demo-listing-downtown', amountCents: 10000, currency: 'USD', status: 'processing', createdAt: '2026-10-28T08:20:00.000Z', paidAt: null }
];

function listingById(id: string) {
  return LISTINGS.find(listing => listing.id === id);
}

function money(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function formatDate(value: string, locale: string, includeTime = false) {
  return new Intl.DateTimeFormat(locale, includeTime
    ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }
    : { dateStyle: 'medium', timeZone: 'UTC' }
  ).format(new Date(value));
}

function openWithKeyboard(event: KeyboardEvent<HTMLElement>, open: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    open();
  }
}

function Status({ status }: { status: ConversationStatus | OrderStatus }) {
  const { t } = useTranslation();
  const colors = { active: 'blue', handoff: 'purple', paid: 'green', pending_payment: 'gold', processing: 'processing' } as const;
  const labels = {
    active: t('console.active'), handoff: t('console.handoff'), paid: t('ui.statusPaid'),
    pending_payment: t('ui.statusPending'), processing: t('ui.statusProcessing')
  };
  return <Tag color={colors[status]}>{labels[status]}</Tag>;
}


function ConversationTable({ items, onOpen }: { items: DemoConversation[]; onOpen: (conversation: DemoConversation) => void }) {
  const { t } = useTranslation();
  return <Table<DemoConversation>
    rowKey="id"
    dataSource={items}
    pagination={false}
    scroll={{ x: 760 }}
    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.noConversations')} /> }}
    onRow={row => ({
      onClick: () => onOpen(row),
      onKeyDown: event => openWithKeyboard(event, () => onOpen(row)),
      tabIndex: 0,
      className: 'clickable-row',
      'aria-label': `${t('console.openConversation')}: ${t(row.buyerKey)}`
    })}
    columns={[
      { title: t('pages.conversations'), render: (_, row) => <Space><BuyerAvatar seed={row.buyerKey} /><div><Text strong>{t(row.buyerKey)}</Text><br /><Text type="secondary">{row.locale} · Telegram</Text></div></Space> },
      { title: t('console.score'), dataIndex: 'score', render: (score: number) => <Badge count={score} color={score >= 70 ? '#276749' : '#8a968f'} overflowCount={100} /> },
      { title: t('pages.listings'), render: (_, row) => listingById(row.listingId)?.title ?? '—' },
      { title: t('demoWorkspace.status'), dataIndex: 'status', render: (status: ConversationStatus) => <Status status={status} /> },
      { title: t('ui.actions'), render: (_, row) => <Button type="link" aria-label={`${t('console.openConversation')}: ${t(row.buyerKey)}`} onClick={event => { event.stopPropagation(); onOpen(row); }}>{t('demoWorkspace.details')}</Button> }
    ]}
  />;
}

function OrderTable({ items, onOpen }: { items: DemoOrder[]; onOpen: (order: DemoOrder) => void }) {
  const { t, i18n } = useTranslation();
  return <Table<DemoOrder>
    rowKey="id"
    dataSource={items}
    pagination={false}
    scroll={{ x: 800 }}
    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.noOrders')} /> }}
    onRow={row => ({
      onClick: () => onOpen(row),
      onKeyDown: event => openWithKeyboard(event, () => onOpen(row)),
      tabIndex: 0,
      className: 'clickable-row',
      'aria-label': `${t('demoWorkspace.details')}: ${row.id}`
    })}
    columns={[
      { title: t('hero.orderLabel'), dataIndex: 'id', render: (id: string) => <Text code>{id}</Text> },
      { title: t('pages.listings'), render: (_, row) => listingById(row.listingId)?.title ?? '—' },
      { title: t('ui.depositAmount'), render: (_, row) => <Text strong>{money(row.amountCents, row.currency, i18n.language)}</Text> },
      { title: t('demoWorkspace.status'), dataIndex: 'status', render: (status: OrderStatus) => <Status status={status} /> },
      { title: t('ui.createdAt'), dataIndex: 'createdAt', render: (date: string) => formatDate(date, i18n.language) },
      { title: t('ui.actions'), render: (_, row) => <Button type="link" onClick={event => { event.stopPropagation(); onOpen(row); }}>{t('demoWorkspace.details')}</Button> }
    ]}
  />;
}

function Overview({ onOpenConversation, onOpenOrder }: { onOpenConversation: (conversation: DemoConversation) => void; onOpenOrder: (order: DemoOrder) => void }) {
  const { t, i18n } = useTranslation();
  const paidOrders = ORDERS.filter(order => order.status === 'paid');
  const paidCents = paidOrders.reduce((total, order) => total + order.amountCents, 0);
  const cards = [
    { title: t('metrics.conversations'), value: CONVERSATIONS.length, icon: <CommentOutlined />, tone: 'green', suffix: t('console.demoMode') },
    { title: t('metrics.highIntent'), value: CONVERSATIONS.filter(conversation => conversation.score >= 70).length, icon: <ThunderboltFilled />, tone: 'orange', suffix: t('console.highIntent') },
    { title: t('metrics.deposits'), value: paidOrders.length, icon: <DollarOutlined />, tone: 'blue', suffix: money(paidCents, 'USD', i18n.language) },
    { title: t('metrics.handoffs'), value: CONVERSATIONS.filter(conversation => conversation.status === 'handoff').length, icon: <TeamOutlined />, tone: 'purple', suffix: t('console.handoff') }
  ];
  return <>
    <Row gutter={[20, 20]}>{cards.map(card => <Col xs={12} sm={12} xl={6} key={card.title}><Card className="metric-card"><div className={`metric-icon ${card.tone}`}>{card.icon}</div><Statistic title={card.title} value={card.value} /><Text type="secondary">{card.suffix}</Text></Card></Col>)}</Row>
    <Row gutter={[20, 20]} className="section-row">
      <Col xs={24} xl={14}><Card title={t('pages.conversations')} className="dashboard-card"><List
        dataSource={CONVERSATIONS}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.noConversations')} /> }}
        renderItem={conversation => <List.Item actions={[<Button key="details" type="link" onClick={() => onOpenConversation(conversation)}>{t('demoWorkspace.details')}</Button>]}><List.Item.Meta
          avatar={<BuyerAvatar seed={conversation.buyerKey} />}
          title={<Space wrap><Text strong>{t(conversation.buyerKey)}</Text><Status status={conversation.status} /></Space>}
          description={`${listingById(conversation.listingId)?.title ?? ''} · ${formatDate(conversation.updatedAt, i18n.language, true)}`}
        /></List.Item>}
      /></Card></Col>
      <Col xs={24} xl={10}><Card title={t('pages.orders')} className="dashboard-card"><List
        dataSource={ORDERS}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.noOrders')} /> }}
        renderItem={order => <List.Item actions={[<Button key="details" type="link" onClick={() => onOpenOrder(order)}>{t('demoWorkspace.details')}</Button>]}><List.Item.Meta
          avatar={<Avatar icon={<CreditCardOutlined />} />}
          title={<Space wrap><Text strong>{money(order.amountCents, order.currency, i18n.language)}</Text><Status status={order.status} /></Space>}
          description={`${listingById(order.listingId)?.title ?? ''} · ${formatDate(order.createdAt, i18n.language)}`}
        /></List.Item>}
      /></Card></Col>
    </Row>
  </>;
}

function Listings({ onOpen }: { onOpen: (listing: DemoListing) => void }) {
  const { t, i18n } = useTranslation();
  if (!LISTINGS.length) return <Card className="dashboard-card"><Empty description={t('ui.noListings')} /></Card>;
  return <Row gutter={[20, 20]}>{LISTINGS.map(listing => <Col xs={24} md={12} xl={8} key={listing.id}><Card
    className="property-card"
    hoverable
    cover={<ListingCover id={listing.id} title={listing.title} area={listing.area} />}
    onClick={() => onOpen(listing)}
    onKeyDown={event => openWithKeyboard(event, () => onOpen(listing))}
    tabIndex={0}
    role="button"
    aria-label={`${t('demoWorkspace.details')}: ${listing.title}`}
  >
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="listing-title"><div><Title level={4}>{listing.title}</Title><Text type="secondary">{listing.layout}</Text></div><Tag color="green">{t('console.active')}</Tag></div>
      <Space size="large" wrap><Text>{listing.bedrooms} {t('ui.bedrooms')}</Text><Text>{listing.bathrooms} {t('ui.bathrooms')}</Text></Space>
      <Descriptions column={1} size="small" items={[
        { key: 'price', label: t('ui.price'), children: <Text strong>{money(listing.priceCents, listing.currency, i18n.language)}</Text> },
        { key: 'deposit', label: t('ui.depositAmount'), children: <Text type="success" strong>{money(listing.depositCents, listing.depositCurrency, i18n.language)}</Text> }
      ]} />
      <Button type="link" onClick={event => { event.stopPropagation(); onOpen(listing); }}>{t('demoWorkspace.details')}</Button>
    </Space>
  </Card></Col>)}</Row>;
}

function ConversationModal({ conversation, onClose, navigate }: { conversation: DemoConversation | null; onClose: () => void; navigate: (path: string) => void }) {
  const { t, i18n } = useTranslation();
  const tryChat = () => { onClose(); navigate('/demo'); };
  return <Modal
    title={<Space>{t('demoWorkspace.conversationPreview')}{conversation && <Status status={conversation.status} />}</Space>}
    open={Boolean(conversation)}
    onCancel={onClose}
    width={720}
    footer={[<Button key="close" onClick={onClose}>{t('ui.close')}</Button>, <Button key="chat" type="primary" icon={<PlayCircleOutlined />} onClick={tryChat}>{t('demoWorkspace.tryChat')}</Button>]}
  >
    {conversation && <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Descriptions column={{ xs: 1, sm: 3 }} size="small" items={[
        { key: 'buyer', label: t('ui.demoBuyer'), children: t(conversation.buyerKey) },
        { key: 'listing', label: t('pages.listings'), children: listingById(conversation.listingId)?.title ?? '—' },
        { key: 'score', label: t('console.score'), children: conversation.score }
      ]} />
      <div className="chat-messages workspace-chat-log" role="log" aria-label={`${t('demoWorkspace.conversationPreview')}: ${t(conversation.buyerKey)}`} tabIndex={0}>
        {conversation.messages.map(item => <div className={`chat-bubble ${item.sender}`} key={item.id}>
          <Text type="secondary">{item.sender === 'agent' ? 'SAHAR AI' : t(conversation.buyerKey)}</Text>
          <p>{t(item.translationKey)}</p>
          <time dateTime={item.createdAt}>{new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(item.createdAt))}</time>
        </div>)}
      </div>
    </Space>}
  </Modal>;
}

function ListingModal({ listing, onClose }: { listing: DemoListing | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  return <Modal title={listing?.title ?? t('pages.listings')} open={Boolean(listing)} onCancel={onClose} footer={[<Button key="close" type="primary" onClick={onClose}>{t('ui.close')}</Button>]}>
    {listing && <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small" items={[
      { key: 'listing', label: t('pages.listings'), children: `${listing.area} · ${listing.layout}`, span: 2 },
      { key: 'price', label: t('ui.price'), children: money(listing.priceCents, listing.currency, i18n.language) },
      { key: 'deposit', label: t('ui.depositAmount'), children: money(listing.depositCents, listing.depositCurrency, i18n.language) },
      { key: 'bedrooms', label: t('ui.bedrooms'), children: listing.bedrooms },
      { key: 'bathrooms', label: t('ui.bathrooms'), children: listing.bathrooms },
      { key: 'created', label: t('ui.createdAt'), children: formatDate(listing.createdAt, i18n.language) },
      { key: 'status', label: t('ui.mode'), children: <Tag color="green">{t('console.active')}</Tag> }
    ]} />}
  </Modal>;
}

function OrderModal({ order, onClose }: { order: DemoOrder | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  return <Modal title={order?.id ?? t('pages.orders')} open={Boolean(order)} onCancel={onClose} footer={[<Button key="close" type="primary" onClick={onClose}>{t('ui.close')}</Button>]}>
    {order && <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Alert type="info" showIcon message={t('demoWorkspace.modeNote')} />
      <Descriptions column={1} bordered size="small" items={[
        { key: 'buyer', label: t('ui.demoBuyer'), children: t(order.buyerKey) },
        { key: 'listing', label: t('pages.listings'), children: listingById(order.listingId)?.title ?? '—' },
        { key: 'amount', label: t('ui.depositAmount'), children: money(order.amountCents, order.currency, i18n.language) },
        { key: 'provider', label: t('ui.mode'), children: <Tag color="orange">{t('ui.mock')}</Tag> },
        { key: 'status', label: t('demoWorkspace.status'), children: <Status status={order.status} /> },
        { key: 'created', label: t('ui.createdAt'), children: formatDate(order.createdAt, i18n.language, true) },
        { key: 'paid', label: t('ui.statusPaid'), children: order.paidAt ? formatDate(order.paidAt, i18n.language, true) : '—' }
      ]} />
    </Space>}
  </Modal>;
}

function Settings({ settings, onChange, onReset }: { settings: DemoSettings; onChange: (settings: DemoSettings) => void; onReset: () => void }) {
  const { t } = useTranslation();
  return <Row gutter={[20, 20]}>
    <Col xs={24} lg={14}><Card title={t('pages.settings')} className="dashboard-card"><Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Alert type="info" showIcon message={t('demoWorkspace.settingsHint')} />
      <div>
        <label htmlFor="demo-reply-locale" style={{ display: 'block', marginBottom: 8 }}>{t('ui.language')}</label>
        <Select id="demo-reply-locale" style={{ width: '100%' }} value={settings.locale} onChange={locale => onChange({ ...settings, locale })} options={locales.map(value => ({ value, label: languageNames[value] }))} />
      </div>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Text id="demo-auto-reply-label">{t('ui.autoReply')}</Text>
        <Switch aria-labelledby="demo-auto-reply-label" checked={settings.autoReply} checkedChildren={t('ui.enabled')} unCheckedChildren={t('ui.disabled')} onChange={autoReply => onChange({ ...settings, autoReply })} />
      </Space>
      <Text type="secondary">{t('demoWorkspace.localOnly')}</Text>
      <Button icon={<RedoOutlined />} onClick={onReset}>{t('demoWorkspace.reset')}</Button>
    </Space></Card></Col>
    <Col xs={24} lg={10}><Card title={t('console.demoMode')} className="dashboard-card"><Space direction="vertical" size={16}>
      <Tag color="orange">{t('ui.mock')}</Tag>
      <Text>{t('demoWorkspace.modeNote')}</Text>
      <Text type="secondary">{t('demoWorkspace.localOnly')}</Text>
    </Space></Card></Col>
  </Row>;
}

const SECTIONS = ['overview', 'conversations', 'listings', 'orders', 'settings'] as const;
type Section = (typeof SECTIONS)[number];

export default function DemoWorkspace({ path, navigate }: { path: string; navigate: (path: string) => void }) {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const requestedSection = path.split('/')[3];
  const active: Section = SECTIONS.includes(requestedSection as Section) ? requestedSection as Section : 'overview';
  const [menuOpen, setMenuOpen] = useState(false);
  const [settings, setSettings] = useState<DemoSettings>({ ...DEFAULT_SETTINGS });
  const [selectedConversation, setSelectedConversation] = useState<DemoConversation | null>(null);
  const [selectedListing, setSelectedListing] = useState<DemoListing | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<DemoOrder | null>(null);

  const resetDemo = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    setSelectedConversation(null);
    setSelectedListing(null);
    setSelectedOrder(null);
    setMenuOpen(false);
  };
  const go = (destination: string) => { setMenuOpen(false); navigate(destination); };
  const menuItems: MenuProps['items'] = [
    { key: 'overview', icon: <DashboardOutlined />, label: t('pages.overview') },
    { key: 'conversations', icon: <MessageOutlined />, label: t('pages.conversations') },
    { key: 'listings', icon: <ShopOutlined />, label: t('pages.listings') },
    { key: 'orders', icon: <CreditCardOutlined />, label: t('pages.orders') },
    { key: 'settings', icon: <SettingOutlined />, label: t('pages.settings') }
  ];
  const sidebar = <div className="sidebar-content">
    <a className="console-logo" dir="ltr" href="/" onClick={event => { event.preventDefault(); go('/'); }}><BrandMark className="console-brand-mark" />sahar.</a>
    <Card className="workspace-card"><Space><Avatar icon={<BankOutlined />} /><div><Text strong>{t('demoWorkspace.title')}</Text><br /><Text type="secondary">{t('console.demoMode')}</Text></div></Space></Card>
    <Menu theme="dark" mode="inline" selectedKeys={[active]} items={menuItems} onClick={({ key }) => go('/demo/workspace/' + key)} />
    <div className="sidebar-bottom">
      <Button type="primary" icon={<PlayCircleOutlined />} block onClick={() => go('/demo')}>{t('demoWorkspace.tryChat')}</Button>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => go('/')}>{t('nav.product')}</Button>
    </div>
  </div>;

  return <Layout className="workspace-shell">
    <Sider width={248} breakpoint="lg" collapsedWidth={0} trigger={null}>{sidebar}</Sider>
    <Drawer placement="left" open={isMobile && menuOpen} onClose={() => setMenuOpen(false)} width={280} className="workspace-drawer">{sidebar}</Drawer>
    <Layout>
      <Header className="console-header"><Button className="console-menu" type="text" icon={<MenuOutlined />} onClick={() => setMenuOpen(true)} aria-label={t('nav.console')} /><Text strong>{t('demoWorkspace.title')}</Text></Header>
      <Content className="workspace-content">
        <div className="workspace-heading">
          <div><Text className="eyebrow-text">SAHAR / {t('console.workspace')}</Text><Title level={2}>{t('pages.' + active)}</Title></div>
          <Space wrap className="workspace-actions">

            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => navigate('/demo')}>{t('demoWorkspace.tryChat')}</Button>
            <Button icon={<RedoOutlined />} onClick={resetDemo}>{t('demoWorkspace.reset')}</Button>
            <Button icon={<LockOutlined />} onClick={() => navigate('/console')}>{t('demoWorkspace.admin')}</Button>
          </Space>
        </div>
        <Alert className="demo-alert" type="info" showIcon message={t('demoWorkspace.notice')} />
        {active === 'overview' && <Overview onOpenConversation={setSelectedConversation} onOpenOrder={setSelectedOrder} />}
        {active === 'conversations' && <Card className="dashboard-card"><ConversationTable items={CONVERSATIONS} onOpen={setSelectedConversation} /></Card>}
        {active === 'listings' && <Listings onOpen={setSelectedListing} />}
        {active === 'orders' && <><Alert className="demo-alert" type="info" showIcon message={t('demoWorkspace.modeNote')} /><Card className="dashboard-card"><OrderTable items={ORDERS} onOpen={setSelectedOrder} /></Card></>}
        {active === 'settings' && <Settings settings={settings} onChange={setSettings} onReset={resetDemo} />}
        <ConversationModal conversation={selectedConversation} onClose={() => setSelectedConversation(null)} navigate={navigate} />
        <ListingModal listing={selectedListing} onClose={() => setSelectedListing(null)} />
        <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      </Content>
    </Layout>
  </Layout>;
}
