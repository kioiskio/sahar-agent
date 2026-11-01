import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Grid, Input, Modal, Popconfirm, Spin } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, MenuOutlined } from '@ant-design/icons';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { useTranslation } from 'react-i18next';
import { ApiError, api, type Credits, type SessionUser, type WebConversationSummary, type WebMessage, type WebSnapshot } from '../api';
import BrandMark from '../components/BrandMark';
import type { Navigate } from '../App';
import { checkoutFrom, loginPath } from '../navigation';

const CONTACT = 'mailto:kioiskio01@gmail.com?subject=Sahar%20trial%20credits';

function explain(t: (key: string) => string, error: unknown): string {
  if (!(error instanceof ApiError)) return t('ui.error');
  if (error.status === 402) return t('account.exhausted');
  if (error.status === 409 && /payment record/i.test(error.message)) return t('account.cannotDelete');
  if (error.status === 409 || error.status === 429) return t('account.busy');
  if (error.status === 503) return t('account.unavailable');
  if (error.status === 502) return t('account.aiFailed');
  return error.message || t('ui.error');
}

function when(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export default function Workspace({ path, navigate }: { path: string; navigate: Navigate }) {
  const { t, i18n } = useTranslation();
  const screens = Grid.useBreakpoint();
  const conversationId = path.startsWith('/workspace/') ? decodeURIComponent(path.split('/')[2] ?? '') : '';
  const [user, setUser] = useState<SessionUser | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [conversations, setConversations] = useState<WebConversationSummary[]>([]);
  const [snapshot, setSnapshot] = useState<WebSnapshot | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<TextAreaRef>(null);
  const activeConversation = useRef(conversationId);
  activeConversation.current = conversationId;
  const mounted = useRef(true);
  const messageOperation = useRef(0);
  const locale = i18n.resolvedLanguage ?? 'en';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      messageOperation.current += 1;
    };
  }, []);

  const refreshList = async () => {
    const data = await api.myConversations();
    if (!mounted.current) return;
    setConversations(data.conversations);
    setCredits(data.credits);
  };

  useEffect(() => {
    let cancelled = false;
    void api.session().then(async session => {
      if (cancelled) return;
      if (!session.user) { navigate(loginPath(window.location.pathname)); return; }
      setUser(session.user);
      setCredits(session.credits ?? null);
      const data = await api.myConversations();
      if (!cancelled) setConversations(data.conversations);
    }).catch(() => { if (!cancelled) navigate(loginPath(window.location.pathname)); });
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    messageOperation.current += 1;
    setLoading(false);
    setReplyingTo(null);
    setSnapshot(null);
    setPendingId(null);
    setDraft('');
    if (!conversationId) return;
    let cancelled = false;
    setError('');
    void api.getMyConversation(conversationId).then(next => {
      if (!cancelled) setSnapshot(next);
    }).catch(cause => { if (!cancelled) setError(explain(t, cause)); });
    return () => { cancelled = true; };
  }, [conversationId, t]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [snapshot?.messages.length, conversationId, replyingTo]);

  useEffect(() => {
    if (conversationId) composerRef.current?.focus();
  }, [conversationId]);

  const visible = conversations.filter(item => {
    const haystack = `${item.title ?? ''} ${item.preview ?? ''}`.toLocaleLowerCase();
    return haystack.includes(query.trim().toLocaleLowerCase());
  });
  const balance = credits?.balance ?? 0;
  const title = snapshot?.conversation.title || t('account.untitled');

  const start = async () => {
    setLoading(true);
    setError('');
    try {
      const created = await api.createConversation(locale);
      await refreshList();
      navigate('/workspace/' + created.conversation.id);
    } catch (cause) {
      setError(explain(t, cause));
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    if (!snapshot || snapshot.conversation.id !== conversationId || loading || !draft.trim() || balance < 1) return;
    const requestId = pendingId ?? crypto.randomUUID();
    const text = draft.trim();
    const operation = ++messageOperation.current;
    setPendingId(requestId);
    setReplyingTo(conversationId);
    setLoading(true);
    setError('');
    setDraft('');
    setSnapshot(current => current ? {
      ...current,
      messages: [...current.messages, { id: 'pending-' + requestId, direction: 'inbound', sender_type: 'buyer', body: text, message_type: 'text', created_at: new Date().toISOString() }]
    } : current);
    try {
      const next = await api.sendMyMessage(snapshot.conversation.id, text, requestId);
      if (operation !== messageOperation.current || activeConversation.current !== snapshot.conversation.id) return;
      setSnapshot(next);
      setReplyingTo(null);
      setCredits(next.credits);
      setPendingId(null);
      await refreshList();
    } catch (cause) {
      if (operation !== messageOperation.current || activeConversation.current !== snapshot.conversation.id) return;
      // A provider 502/503 is refunded by the server, so retry as a new request.
      // Ambiguous transport errors keep the same ID and unchanged text for replay.
      if (cause instanceof ApiError && (cause.status === 502 || cause.status === 503)) setPendingId(null);
      setDraft(text);
      setError(explain(t, cause));
      const recovered = await api.getMyConversation(snapshot.conversation.id).catch(() => snapshot);
      if (operation === messageOperation.current && activeConversation.current === snapshot.conversation.id) setSnapshot(recovered);
    } finally {
      if (operation === messageOperation.current) {
        setReplyingTo(null);
        setLoading(false);
      }
    }
  };

  const saveName = async () => {
    if (!renameId) return;
    setLoading(true);
    setError('');
    try {
      const saved = await api.renameConversation(renameId, renameValue);
      setSnapshot(current => current && current.conversation.id === renameId ? { ...current, conversation: { ...current.conversation, title: saved.title } } : current);
      setRenameId(null);
      await refreshList();
    } catch (cause) {
      setError(explain(t, cause));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    setError('');
    try {
      await api.deleteConversation(id);
      if (id === conversationId) navigate('/workspace');
      await refreshList();
    } catch (cause) {
      setError(explain(t, cause));
    }
  };

  return <div className="workspace-app">
    <header className="workspace-bar">
      <a className="brand" href="/" onClick={event => { event.preventDefault(); navigate('/'); }}><BrandMark className="brand-mark" /><span>sahar<span className="brand-dot">.</span></span></a>
      {user && <span className="workspace-email">{user.email}</span>}
      <span className="workspace-credits">{t('account.creditsLeft', { count: balance })}</span>
      {user?.admin && (screens.md ? <>
        <Button type="text" onClick={() => navigate('/console/overview')}>{t('account.agentWorkspace')}</Button>
        <Button type="text" onClick={() => navigate('/admin')}>{t('account.admin')}</Button>
      </> : <Dropdown menu={{ items: [{ key: '/console/overview', label: t('account.agentWorkspace') }, { key: '/admin', label: t('account.admin') }], onClick: ({ key }) => navigate(key) }} trigger={['click']}>
        <Button type="text" icon={<MenuOutlined />} aria-label={t('account.manageWorkspace')} />
      </Dropdown>)}
      <Button type="text" onClick={() => void api.logout().finally(() => navigate('/'))}>{t('account.logout')}</Button>
    </header>
    <div className={conversationId ? 'workspace-body has-chat' : 'workspace-body'}>
      <aside className="workspace-side">
        <div className="workspace-side-tools">
          <Button type="primary" block loading={loading && !snapshot} onClick={() => void start()}>{t('account.newChat')}</Button>
          <Input.Search allowClear value={query} onChange={event => setQuery(event.target.value)} placeholder={t('account.searchChats')} aria-label={t('account.searchChats')} />
        </div>
        <div className="workspace-list">
          {visible.length === 0 && <p className="workspace-hint">{query ? t('account.noMatches') : t('account.empty')}</p>}
          {visible.map(item => <ConversationRow key={item.id} item={item} selected={item.id === conversationId} locale={locale} untitled={t('account.untitled')} renameLabel={t('account.rename')} deleteLabel={t('account.deleteChat')} confirm={t('account.deleteConfirm')} onOpen={() => navigate('/workspace/' + item.id)} onRename={() => { setRenameId(item.id); setRenameValue(item.title || ''); }} onDelete={() => void remove(item.id)} />)}
        </div>
      </aside>
      <main className="workspace-main">
        {error && <Alert className="workspace-alert" type="error" showIcon message={error} />}
        {!conversationId && <div className="workspace-empty">
          <h2>{t('account.startChatting')}</h2>
          <p>{t('account.chatHint')}</p>
          <Button type="primary" size="large" onClick={() => void start()}>{t('account.newChat')}</Button>
        </div>}
        {conversationId && snapshot && <>
          <div className="workspace-thread-head">
            <Button className="workspace-back" type="text" icon={<ArrowLeftOutlined />} aria-label={t('account.backToChats')} onClick={() => navigate('/workspace')} />
            <h2>{title}</h2>
            <Button type="text" icon={<EditOutlined />} aria-label={t('account.rename')} title={t('account.rename')} onClick={() => { setRenameId(snapshot.conversation.id); setRenameValue(snapshot.conversation.title || ''); }} />
            <Popconfirm title={t('account.deleteConfirm')} okText={t('account.deleteChat')} cancelText={t('ui.cancel')} onConfirm={() => void remove(snapshot.conversation.id)}>
              <Button type="text" danger icon={<DeleteOutlined />} aria-label={t('account.deleteChat')} title={t('account.deleteChat')} />
            </Popconfirm>
          </div>
          {balance < 1 && <Alert className="workspace-alert" type="warning" showIcon message={t('account.exhausted')} action={<Button href={CONTACT}>{t('account.contact')}</Button>} />}
          <div className="workspace-thread" ref={threadRef} role="log" aria-label={t('ui.conversationMessages')}>
            {snapshot.messages.map(message => <MessageBubble key={message.id} message={message} conversationId={conversationId} />)}
            {replyingTo === conversationId && <div className="account-bubble workspace-replying" role="status" aria-live="polite"><Spin size="small" /><span>{t('account.replying')}</span></div>}
          </div>
          <div className="workspace-compose">
            <div className="workspace-compose-box">
              <Input.TextArea ref={composerRef} value={draft} autoSize={{ minRows: 1, maxRows: 6 }} maxLength={2000} placeholder={t('account.placeholder')} aria-label={t('account.placeholder')} disabled={balance < 1 || loading} onChange={event => { setDraft(event.target.value); setPendingId(null); }} onPressEnter={event => { if (!event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void send(); } }} />
              <Button type="primary" loading={loading} disabled={balance < 1 || !draft.trim()} onClick={() => void send()}>{t('account.send')}</Button>
            </div>
            <p className="workspace-hint">{t('account.chatHint')}</p>
          </div>
        </>}
        {conversationId && !snapshot && !error && <div className="workspace-empty"><p>{t('account.empty')}</p></div>}
      </main>
    </div>
    <Modal title={t('account.rename')} open={renameId !== null} okText={t('account.saveName')} cancelText={t('ui.cancel')} confirmLoading={loading} onOk={() => void saveName()} onCancel={() => setRenameId(null)}>
      <Input value={renameValue} maxLength={80} aria-label={t('account.titleLabel')} onChange={event => setRenameValue(event.target.value)} onPressEnter={() => void saveName()} />
    </Modal>
  </div>;
}

function ConversationRow({ item, selected, locale, untitled, renameLabel, deleteLabel, confirm, onOpen, onRename, onDelete }: {
  item: WebConversationSummary; selected: boolean; locale: string; untitled: string; renameLabel: string; deleteLabel: string; confirm: string;
  onOpen: () => void; onRename: () => void; onDelete: () => void;
}) {
  return <div className="workspace-row">
    <button type="button" className="workspace-item" aria-current={selected ? 'true' : undefined} onClick={onOpen}>
      <span className="workspace-item-top"><strong>{item.title || untitled}</strong><time dateTime={item.updated_at}>{when(item.updated_at, locale)}</time></span>
      {item.preview && <p>{item.preview}</p>}
    </button>
    <span className="workspace-item-actions">
      <Button type="text" size="small" onClick={onRename}>{renameLabel}</Button>
      <Popconfirm title={confirm} okText={deleteLabel} onConfirm={onDelete}>
        <Button type="text" size="small" danger>{deleteLabel}</Button>
      </Popconfirm>
    </span>
  </div>;
}

function MessageBubble({ message, conversationId }: { message: WebMessage; conversationId: string }) {
  const { t } = useTranslation();
  const mine = message.direction === 'inbound';
  if (!mine && message.sender_type === 'system' && message.message_type === 'checkout_link') {
    const candidate = message.body.match(/https:\/\/[^\s]+|\/checkout\/[^\s]+/)?.[0];
    if (candidate) {
      try {
        const url = new URL(candidate, window.location.origin);
        if (url.origin === window.location.origin && url.pathname.startsWith('/checkout/') && !url.username && !url.password) {
          return <div className="account-bubble"><p>{message.body.replace(candidate, '').trim()}</p><Button type="primary" href={checkoutFrom(url.href, '/workspace/' + conversationId)}>{t('ui.checkout')}</Button></div>;
        }
      } catch { /* Invalid checkout URLs remain plain text. */ }
    }
  }
  return <div className={mine ? 'account-bubble mine' : 'account-bubble'}>{message.body}</div>;
}
