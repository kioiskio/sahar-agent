import { lazy, Suspense, useCallback, useEffect, useState, Component, type ReactNode } from 'react';
import { ArrowUpRight, Globe2, Menu } from 'lucide-react';
import { Button, Drawer, Grid, Layout, Select, Spin, Result } from 'antd';
import { useTranslation } from 'react-i18next';
import { locales, languageNames, setLocale, type Locale } from './i18n';
import Home from './pages/Home';
import BrandMark from './components/BrandMark';
import './home.css';

const Console = lazy(() => import('./pages/Console'));
import DemoWorkspace from './pages/DemoWorkspace';
import Docs from './pages/Docs';
import Login from './pages/Login';
import Workspace from './pages/Workspace';
import Admin from './pages/Admin';

class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <Result status="warning" title="This page could not load" extra={<Button onClick={() => window.location.reload()}>Reload page</Button>} /> : this.props.children;
  }
}

export type Navigate = (path: string) => void;

function Brand({ dark = false }: { dark?: boolean }) {
  return <a className={`brand ${dark ? 'brand-dark' : ''}`} href="/" aria-label="Sahar home" dir="ltr">
    <BrandMark className="brand-mark" />
    <span>sahar<span className="brand-dot">.</span></span>
  </a>;
}

function LanguageSelect() {
  const { t, i18n } = useTranslation();
  return <Select
    className="language-select"
    aria-label={t('nav.language')}
    value={i18n.resolvedLanguage}
    onChange={value => void setLocale(value as Locale)}
    suffixIcon={<Globe2 size={16} />}
    options={locales.map(locale => ({ value: locale, label: languageNames[locale] }))}
  />;
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate: Navigate = useCallback(next => {
    window.history.pushState({}, '', next);
    setPath(window.location.pathname);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const isConsole = path.startsWith('/console') || path.startsWith('/demo') || path.startsWith('/checkout/');
  const loading = <div className="page-loading"><Spin size="large" /></div>;
  if (path === '/login') return <Login navigate={navigate} />;
  if (path.startsWith('/workspace')) return <Workspace path={path} navigate={navigate} />;
  if (path.startsWith('/admin')) return <Admin navigate={navigate} />;
  if (path === '/docs') return <Docs navigate={navigate} />;
  if (path.startsWith('/demo/workspace')) return <RouteBoundary key={path}><DemoWorkspace path={path} navigate={navigate} /></RouteBoundary>;
  if (isConsole) return <RouteBoundary key={path}><Suspense fallback={loading}><Console path={path} navigate={navigate}/></Suspense></RouteBoundary>;

  const navLinks = <nav className="main-nav" aria-label="Main navigation">
    <a href="#product" onClick={() => setMenuOpen(false)}>{t('nav.product')}</a>
    <a href="#workflow" onClick={() => setMenuOpen(false)}>{t('nav.workflow')}</a>
    <a href="/workspace" onClick={event => { event.preventDefault(); navigate('/workspace'); }}>{t('account.workspace')}</a>
    <a href="/docs" onClick={event => { event.preventDefault(); navigate('/docs'); }}>{t('nav.docs')}</a>
  </nav>;

  return <Layout className="marketing-shell">
    <Layout.Header className="site-header">
      <div className="nav-wrap page-width">
        <Brand/>
        {screens.lg && navLinks}
        <div className="nav-actions">
          {screens.md && <LanguageSelect/>}
          {screens.lg && <Button className="nav-console-button" type="primary" onClick={() => navigate('/workspace')}>{t('account.getStarted')}<ArrowUpRight size={16}/></Button>}
          {!screens.lg && <Button className="menu-toggle" type="text" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} icon={<Menu size={22}/>} />}
        </div>
      </div>
    </Layout.Header>
    <Drawer className="mobile-nav-drawer" title={<Brand/>} open={menuOpen} onClose={() => setMenuOpen(false)} placement="right" size={320}>
      {navLinks}
      <div className="drawer-actions"><LanguageSelect/><Button type="primary" size="large" block onClick={() => navigate('/workspace')}>{t('account.getStarted')}<ArrowUpRight size={17}/></Button></div>
    </Drawer>
    <div className="marketing-content"><Home navigate={navigate}/></div>
    <Layout.Footer className="site-footer" id="boundary">
      <div className="page-width">
        <div className="footer-top"><div className="footer-intro"><Brand dark/><p className="footer-tagline">{t('footer.tagline')}</p></div><div className="footer-column"><span>{t('footer.product')}</span><a href="#workflow">{t('nav.workflow')}</a><a href="/workspace" onClick={event => { event.preventDefault(); navigate('/workspace'); }}>{t('account.workspace')}</a></div><div className="footer-column"><span>{t('footer.resources')}</span><a href="https://paypalaihackathon.devpost.com/" target="_blank" rel="noreferrer">{t('footer.hackathon')}<ArrowUpRight size={13}/></a><a href="/docs" onClick={event => { event.preventDefault(); navigate('/docs'); }}>{t('nav.docs')}</a></div></div>
        <div className="footer-boundary"><span>{t('footer.boundary')}</span><p>{t('footer.boundaryText')}</p></div>
        <div className="footer-bottom"><span>© 2026 Sahar. Built for clearer conversations.</span><span>sahar-agent · Telegram + Web</span></div>
      </div>
    </Layout.Footer>
  </Layout>;
}
