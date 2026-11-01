import { ArrowDown, ArrowRight, ArrowUpRight, Bot, Check, Clock3, CreditCard, Database, Globe2, LayoutDashboard, MessageCircle, ShieldCheck, Sparkles, UserRound, Zap } from 'lucide-react';
import { Button, Card, Grid, Steps, Tabs, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import DubaiIllustration from '../components/DubaiIllustration';
import BrandMark from '../components/BrandMark';
import type { Navigate } from '../App';

const flowIcons = [MessageCircle, LayoutDashboard, ShieldCheck];

function ChatVisual() {
  const { t } = useTranslation();
  return <div className="hero-scene" role="img" aria-label={t('hero.buyerJourney')}>
    <div className="scene-orbit orbit-one"/><div className="scene-orbit orbit-two"/>
    <Card className="timezone-badge" variant="borderless"><Globe2 size={18}/><div><span>{t('hero.timezone')}</span><strong>{t('hero.buyerCity')} <b>02:14</b> <i>→</i> {t('hero.dubai')} <b>22:14</b></strong></div></Card>
    <Card className="chat-card" variant="borderless">
      <div className="chat-top"><div className="agent-avatar"><BrandMark /></div><div><strong>Sahar</strong><span><i/>{t('hero.online')}</span></div><MessageCircle size={21}/></div>
      <div className="chat-body">
        <div className="message-date">TELEGRAM · {t('hero.english')}</div>
        <div className="bubble bubble-buyer">{t('hero.chatHello')}<span>02:14</span></div>
        <div className="bubble bubble-agent"><span className="bubble-ai"><Sparkles size={11}/>SAHAR AI</span>{t('hero.chatReply')}<span>02:14 <Check size={12}/></span></div>
        <div className="bubble bubble-buyer">{t('hero.chatBuy')}<span>02:15</span></div>
        <div className="mini-order"><div className="mini-order-head"><span className="paypal-mark">P</span><span>{t('hero.orderLabel')}</span><Tag color="orange">SANDBOX</Tag></div><strong>{t('hero.orderValue')}</strong><div className="mini-order-bottom"><span><Check size={12}/>{t('hero.orderStatus')}</span><ArrowUpRight size={15}/></div></div>
      </div>
      <div className="chat-compose"><span>{t('hero.replyText')}</span><span className="send-circle"><ArrowUpRight size={16}/></span></div>
    </Card>
    <Card className="intent-badge" variant="borderless"><span className="intent-icon"><Zap size={17} fill="currentColor"/></span><div><span>{t('hero.intentLabel')}</span><strong>{t('hero.intentValue')}</strong></div><span className="intent-score">95</span></Card>
  </div>;
}

function BuyerVisual() {
  const { t } = useTranslation();
  return <div className="buyer-visual"><div className="flow-phone"><div className="phone-notch"/><div className="flow-chat-title"><MessageCircle size={18}/><strong>Sahar</strong><span>24 / 7</span></div><div className="flow-message left">{t('flows.buyer1')}</div><div className="flow-message right">{t('flows.buyer2')}</div><div className="flow-message left">{t('flows.buyer3')}</div><div className="flow-link"><CreditCard size={20}/><span>{t('flows.buyer5')}</span><ArrowUpRight size={16}/></div><div className="flow-message right short">{t('flows.buyer6')}</div><div className="flow-complete"><Check size={16}/>{t('console.paid')}</div></div><Tag className="flow-float-tag" icon={<Clock3 size={15}/>}>24 / 7</Tag></div>;
}

function DashboardVisual({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const stats = [
    { icon: MessageCircle, value: '24', label: t('metrics.conversations') },
    { icon: Zap, value: '08', label: t('metrics.highIntent') },
    { icon: CreditCard, value: '03', label: t('metrics.deposits') }
  ];
  return <div className={`dashboard-visual ${compact ? 'dashboard-compact' : ''}`}>
    <div className="mini-sidebar"><span className="mini-sidebar-logo"/><span/><span/><span/><span/></div>
    <div className="mini-main"><div className="mini-main-head"><strong>{t('console.workspace')}</strong><div><i/><i/></div></div><div className="mini-stat-row">{stats.map(({ icon: Icon, value, label }) => <Card key={label} variant="borderless"><Icon size={17}/><strong>{value}</strong><span>{label}</span></Card>)}</div><div className="mini-chart"><div className="mini-chart-title"><span>{t('console.overview')}</span><Tag color="green">{t('console.active')}</Tag></div><svg viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true"><path d="M0 96C45 88 57 100 89 77S146 87 173 65s51-3 76-25 35 7 63-9 46-20 88-27" stroke="#d97745" strokeWidth="3" fill="none"/><path d="M0 96C45 88 57 100 89 77S146 87 173 65s51-3 76-25 35 7 63-9 46-20 88-27V110H0Z" fill="url(#chart-fill)" opacity=".5"/><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#e7a17c"/><stop offset="1" stopColor="#faf6ee" stopOpacity="0"/></linearGradient></defs></svg></div><div className="mini-table"><span/><span/><span/><span/><span/><span/></div></div>
    <Tag className="dashboard-demo-tag" color="green"><span className="live-dot"/>{t('console.demoMode')}</Tag>
  </div>;
}

function ArchitectureVisual() {
  const { t } = useTranslation();
  return <div className="architecture-visual"><div className="architecture-diagram"><div className="arch-node arch-inbound"><MessageCircle size={22}/><span>Telegram</span><small>Webhook</small></div><div className="arch-line"><i/></div><div className="arch-core"><ShieldCheck size={29}/><strong>Sahar</strong><span>Business logic</span></div><div className="arch-line"><i/></div><div className="arch-node"><Database size={22}/><span>D1</span><small>Source of truth</small></div><div className="arch-line"><i/></div><div className="arch-node"><CreditCard size={22}/><span>PayPal</span><small>Sandbox adapter</small></div></div><Tag color="green" icon={<Check size={14}/>}>{t('legal.note')}</Tag></div>;
}

function WorkflowVisual({ type }: { type: number }) {
  if (type === 0) return <BuyerVisual/>;
  if (type === 1) return <DashboardVisual/>;
  return <ArchitectureVisual/>;
}

function SectionHeading({ eyebrow, title, body, align = 'left' }: { eyebrow: string; title: string; body: string; align?: 'left' | 'center' }) {
  return <div className={`section-heading section-heading-${align}`}><div className="eyebrow"><span/>{eyebrow}</div><h2>{title}</h2><p>{body}</p></div>;
}

export default function Home({ navigate }: { navigate: Navigate }) {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const flowData = [
    { title: t('flows.buyerTitle'), body: t('flows.buyerBody'), label: t('flows.buyerLabel'), items: [1, 2, 3, 4, 5, 6].map(n => t(`flows.buyer${n}`)) },
    { title: t('flows.webTitle'), body: t('flows.webBody'), label: t('flows.webLabel'), items: [1, 2, 3, 4, 5].map(n => t(`flows.web${n}`)) },
    { title: t('flows.serverTitle'), body: t('flows.serverBody'), label: t('flows.serverLabel'), items: [1, 2, 3, 4, 5].map(n => t(`flows.server${n}`)) }
  ];
  const fractures = [
    { icon: Clock3, index: '01 / TIME', title: t('hero.timezone'), body: t('flows.buyer1'), fix: t('proof.instant') },
    { icon: MessageCircle, index: '02 / DIALOGUE', title: t('flows.buyer2'), body: t('flows.buyer3'), fix: t('flows.web2') },
    { icon: CreditCard, index: '03 / PAYMENT', title: t('flows.buyer5'), body: t('flows.server5'), fix: t('console.deposit') }
  ];
  const consoleItems: { icon: typeof Bot; text: string }[] = [
    { icon: Bot, text: t('flows.web2') }, { icon: UserRound, text: t('flows.web4') }, { icon: CreditCard, text: t('flows.web5') }
  ];

  return <main className="marketing-home">
    <section className="hero">
      <div className="hero-grid page-width">
        <div className="hero-copy"><Tag className="hero-eyebrow" color="green"><span className="live-dot"/>{t('hero.eyebrow')}</Tag><h1>{t('hero.titleA')}<br/><em>{t('hero.titleEm')}</em><span>{t('hero.titleB')}</span></h1><p className="hero-body">{t('hero.body')}</p><div className="hero-buttons"><Button type="primary" size="large" href="https://t.me/SaharDubaiAgentBot" target="_blank" rel="noreferrer">{t('telegram.chat')}<ArrowUpRight size={18}/></Button><Button type="text" size="large" href="#workflow">{t('hero.secondary')}<ArrowDown size={17}/></Button></div><div className="hero-note"><ShieldCheck size={16}/>{t('hero.note')}</div></div>
        <ChatVisual/>
      </div>
      <div className="hero-skyline page-width"><DubaiIllustration/></div>
      <div className="proof-strip page-width"><span><Clock3 size={18}/>{t('proof.instant')}</span><span><Globe2 size={18}/>{t('proof.global')}</span><span><LayoutDashboard size={18}/>{t('proof.visible')}</span></div>
    </section>

    <section className="problem-section page-width" id="product">
      <SectionHeading eyebrow={t('intro.eyebrow')} title={t('intro.title')} body={t('intro.body')}/>
      <div className="fracture-grid">{fractures.map(({ icon: Icon, index, title, body, fix }) => <Card className="fracture-card" key={index} variant="outlined"><div className="fracture-card-top"><span className="card-index">{index}</span><span className="fracture-icon"><Icon size={23}/></span></div><h3>{title}</h3><p>{body}</p><Tag color="green" icon={<Check size={13}/>}>{fix}</Tag></Card>)}</div>
    </section>

    <section className="workflow-section" id="workflow">
      <div className="page-width"><SectionHeading eyebrow={t('flows.eyebrow')} title={t('flows.title')} body={t('flows.body')} align="center"/>
        <Tabs className="workflow-tabs" defaultActiveKey="0" centered={screens.md} size="large" items={flowData.map((flow, index) => {
          const Icon = flowIcons[index];
          return { key: String(index), label: <span className="workflow-tab-label"><span>0{index + 1}</span><Icon size={18}/>{flow.label.replace(/^0\d · /, '')}</span>, children: <div className="workflow-panel"><div className="workflow-copy"><Tag color="orange">{flow.label}</Tag><h3>{flow.title}</h3><p>{flow.body}</p><Steps className="workflow-steps" orientation="vertical" size="small" current={flow.items.length} items={flow.items.map(item => ({ title: item }))}/><Button type="link" className="text-link" onClick={() => navigate('/workspace')}>{t('account.startChatting')}<ArrowUpRight size={16}/></Button></div><div className="workflow-art"><WorkflowVisual type={index}/></div></div> };
        })}/>
      </div>
    </section>

    <section className="console-story page-width">
      <div className="console-story-copy"><div className="eyebrow"><span/>{t('console.eyebrow')}</div><h2>{t('console.title')}</h2><p>{t('console.body')}</p><div className="console-benefits">{consoleItems.map(({ icon: Icon, text }) => <Tag key={text} icon={<Icon size={17}/>}>{text}</Tag>)}</div><Button type="primary" size="large" onClick={() => navigate('/workspace')}>{t('account.getStarted')}<ArrowRight size={17}/></Button></div>
      <div className="console-preview"><div className="preview-bar"><div><i/><i/><i/></div><span>console.sahar / overview</span></div><DashboardVisual compact/></div>
    </section>

    <section className="closing-cta"><div className="page-width cta-content"><div><div className="eyebrow eyebrow-light"><span/>{t('cta.eyebrow')}</div><h2>{t('cta.title')}</h2><p>{t('cta.body')}</p></div><div className="cta-actions"><Button type="primary" size="large" onClick={() => navigate('/workspace')}>{t('account.getStarted')}<ArrowUpRight size={18}/></Button><Button ghost size="large" onClick={() => navigate('/docs')}>{t('cta.secondary')}<ArrowRight size={17}/></Button></div></div></section>
  </main>;
}
