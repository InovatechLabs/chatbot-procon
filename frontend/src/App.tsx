import { cx, ui } from './ui/styles';
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Login from './Login';
import Analytics from './Analytics';
import Flow from './Flow';
import Agenda from './Agenda';
import AuthProvider from './auth/AuthProvider';
import { useAuth } from './auth/context';
import Account from './auth/Account';
import Users from './auth/Users';
import ScheduleSettingsPage from './ScheduleSettings';
import Brand from './Brand';

const IconChart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);
const IconTree = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="2" width="8" height="6" rx="1"/><rect x="2" y="16" width="7" height="6" rx="1"/><rect x="15" y="16" width="7" height="6" rx="1"/><path d="M12 8v4H5.5v4M12 12h6.5v4"/>
  </svg>
);
const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconLogOut = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

function ProtectedRoute({ children, admin = false, passwordChange = false }: { children: React.ReactNode; admin?: boolean; passwordChange?: boolean }) {
  const auth = useAuth();
  if (auth.loading) return <p role="status">Verificando sessão...</p>;
  if (auth.error) return <div><p role="alert">{auth.error}</p><button onClick={() => void auth.refresh()}>Tentar novamente</button></div>;
  if (!auth.user) return <Navigate to="/" replace />;
  if (auth.user.mustChangePassword && !passwordChange) return <Navigate to="/account" replace />;
  if (admin && auth.user.role !== 'ADMIN') return <Navigate to="/agenda" replace />;
  return <>{children}</>;
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const [logoutError, setLogoutError] = React.useState('');
  const [navOpen, setNavOpen] = React.useState(false);
  const menuButton = React.useRef<HTMLButtonElement>(null);
  const go = (path: string) => { setNavOpen(false); navigate(path); };

  const handleLogout = async () => {
    try { await auth.logout(); navigate('/', { replace: true }); }
    catch { setLogoutError('Não foi possível encerrar a sessão. Tente novamente.'); }
  };

  const isAnalytics = location.pathname === '/analytics';
  const isAgenda = location.pathname === '/agenda';
  const isAccount = location.pathname === '/account';
  const isUsers = location.pathname === '/users';
  const isSchedule = location.pathname === '/schedule';
  const pageTitle = isSchedule ? 'Disponibilidade' : isUsers ? 'Usuários e acessos' : isAccount ? 'Minha conta' : isAnalytics ? 'Indicadores' : isAgenda ? 'Agenda de atendimentos' : 'Menu do chatbot';
  const description = isSchedule ? 'Defina os dias, os horários e as vagas de atendimento.' : isUsers ? 'Gerencie as contas e as permissões da equipe.' : isAccount ? 'Mantenha sua senha de acesso atualizada.' : isAnalytics ? 'Acompanhe o uso do assistente e os atendimentos.' : isAgenda ? 'Consulte a agenda e organize os atendimentos presenciais.' : 'Organize as opções e as orientações do assistente virtual.';

  return (
    <div data-ui="admin-layout" className={cx(ui.adminLayout)} onKeyDown={event => { if (event.key === 'Escape' && navOpen) { setNavOpen(false); menuButton.current?.focus(); } }}>
      <a data-ui="skip-link" className={cx(ui.skipLink)} href="#main-content">Ir para o conteúdo</a>
      <aside data-ui="sidebar" className={cx(ui.sidebar)}>
        <div data-ui="sidebar-logo" className={cx(ui.sidebarLogo)}>
          <Brand />
          {!auth.user?.mustChangePassword && <button ref={menuButton} type="button" data-ui="nav-toggle" className={cx(ui.navToggle)} aria-expanded={navOpen} aria-controls="panel-navigation" onClick={() => setNavOpen(value => !value)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>Menu</button>}
        </div>
        {!auth.user?.mustChangePassword && <nav id="panel-navigation" data-open={navOpen} data-ui="sidebar-nav" className={cx(ui.sidebarNav)} aria-label="Menu principal">
          <p data-ui="nav-caption" className={cx(ui.navCaption)}>Painel de atendimento</p>
          {auth.user?.role === 'ADMIN' && <>
          <button
            data-ui="nav-item" className={cx(ui.navItem)}
            aria-current={isAnalytics ? 'page' : undefined} onClick={() => go('/analytics')}
          >
            <IconChart />
            <span>Indicadores</span>
          </button>
          </>}
          <button
            data-ui="nav-item" className={cx(ui.navItem)}
            aria-current={isAgenda ? 'page' : undefined} onClick={() => go('/agenda')}
          >
            <IconCalendar />
            <span>Agenda de atendimentos</span>
          </button>
          {auth.user?.role === 'ADMIN' && <button
            data-ui="nav-item" className={cx(ui.navItem)}
            aria-current={location.pathname === '/flow' ? 'page' : undefined} onClick={() => go('/flow')}
          >
            <IconTree />
            <span>Menu do chatbot</span>
          </button>}
          {auth.user?.role === 'ADMIN' && <button data-ui="nav-item" className={cx(ui.navItem)} aria-current={isSchedule ? 'page' : undefined} onClick={() => go('/schedule')}><IconCalendar /><span>Disponibilidade</span></button>}
          {auth.user?.role === 'ADMIN' && <button data-ui="nav-item" className={cx(ui.navItem)} aria-current={isUsers ? 'page' : undefined} onClick={() => go('/users')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/></svg><span>Usuários e acessos</span></button>}
        </nav>}
        <div data-ui="sidebar-footer" className={cx(ui.sidebarFooter)}>
          <strong>PROCON de Jacareí</strong>
          <span>Defesa e proteção do consumidor</span>
        </div>
      </aside>

      <div data-ui="main" className={cx(ui.main)}>
        <header data-ui="topbar" className={cx(ui.topbar)}>
          <div data-ui="topbar-left" className={cx(ui.topbarLeft)}>
            <h1>{pageTitle}</h1>
            <p data-ui="breadcrumb" className={cx(ui.breadcrumb)}>{description}</p>
          </div>
          <div data-ui="topbar-actions" className={cx(ui.topbarActions)}>
            <div data-ui="user-identity" className={cx(ui.userIdentity)}><span data-ui="user-avatar" className={cx(ui.userAvatar)} aria-hidden="true">{auth.user?.username.slice(0, 1).toUpperCase()}</span><div><strong>{auth.user?.username}</strong><span>{auth.user?.role === 'ADMIN' ? 'Administrador' : 'Atendente'}</span></div></div>
            <button data-ui="btn-ghost" className={cx(ui.btnGhost)} onClick={() => navigate('/account')}>Alterar senha</button>
            {logoutError && <span role="alert">{logoutError}</span>}
            <button data-ui="btn-ghost" className={cx(ui.btnGhost)} onClick={handleLogout}>
              <IconLogOut /> Sair
            </button>
          </div>
        </header>

        <div data-ui="content" className={cx(ui.content)} id="main-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute admin>
              <MainLayout>
                <Analytics />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agenda"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Agenda />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/flow"
          element={
            <ProtectedRoute admin>
              <MainLayout>
                <Flow />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/account" element={<ProtectedRoute passwordChange><MainLayout><Account /></MainLayout></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute admin><MainLayout><Users /></MainLayout></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute admin><MainLayout><ScheduleSettingsPage /></MainLayout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}
