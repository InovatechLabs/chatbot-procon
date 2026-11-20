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
import RetentionSettingsPage from './RetentionSettings';
import InstitutionSettingsPage from './InstitutionSettings';
import AiSettingsPage from './AiSettings';
import Conversations from './Conversations';
import { ConversationEventsContext, useConversationStream } from './services/conversationEvents';
import Brand from './Brand';

const IconChart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);
const IconChat = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
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
const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2h1.2l.5 2.2a8 8 0 0 1 2 .9l2-1.2 1.7 1.7-1.2 2a8 8 0 0 1 .9 2l2.2.5v2.4l-2.2.5a8 8 0 0 1-.9 2l1.2 2-1.7 1.7-2-1.2a8 8 0 0 1-2 .9l-.5 2.2h-2.4l-.5-2.2a8 8 0 0 1-2-.9l-2 1.2-1.7-1.7 1.2-2a8 8 0 0 1-.9-2L2.7 13v-2.4l2.2-.5a8 8 0 0 1 .9-2l-1.2-2 1.7-1.7 2 1.2a8 8 0 0 1 2-.9l.5-2.2H12Z" />
    <circle cx="12" cy="11.8" r="3" />
  </svg>
);
const IconLogOut = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const settingsLinks = [
  { path: '/flow', label: 'Menu do chatbot', icon: <IconTree /> },
  { path: '/schedule', label: 'Disponibilidade', icon: <IconCalendar /> },
  { path: '/institution', label: 'Institucional', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 21h18M5 21V8l7-5 7 5v13M10 21v-5h4v5M9 10h1m4 0h1m-6 3h1m4 0h1"/></svg> },
  { path: '/ai-settings', label: 'Configurações de IA', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5m6-5v5M9 18v5m6-5v5M1 9h5m-5 6h5m12-6h5m-5 6h5"/><circle cx="12" cy="12" r="2"/></svg> },
  { path: '/retention', label: 'Retenção de dados', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z"/><path d="m8 12 3 3 5-6"/></svg> },
  { path: '/users', label: 'Usuários e acessos', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/></svg> },
];

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
  const [settingsOverride, setSettingsOverride] = React.useState<{ locationKey: string; open: boolean } | null>(null);
  const isSettingsPage = settingsLinks.some(({ path }) => location.pathname === path);
  const settingsOpen = settingsOverride?.locationKey === location.key ? settingsOverride.open : isSettingsPage;
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
  const isInstitution = location.pathname === '/institution';
  const isAiSettings = location.pathname === '/ai-settings';
  const isRetention = location.pathname === '/retention';
  const isConversations = location.pathname === '/conversations';
  const conversationEvents = useConversationStream(!!auth.user && !auth.user.mustChangePassword);
  const pageTitle = isConversations ? 'Conversas' : isAiSettings ? 'Configurações de IA' : isInstitution ? 'Configurações institucionais' : isRetention ? 'Retenção de dados' : isSchedule ? 'Disponibilidade' : isUsers ? 'Usuários e acessos' : isAccount ? 'Minha conta' : isAnalytics ? 'Indicadores' : isAgenda ? 'Agenda de atendimentos' : 'Menu do chatbot';
  const description = isConversations ? 'Acompanhe a fila e responda pelo WhatsApp do PROCON.' : isAiSettings ? 'Escolha o modelo de geração do chatbot e ajuste o thinking mode.' : isInstitution ? 'Atualize os dados da unidade e as mensagens de encaminhamento do chatbot.' : isRetention ? 'Defina os prazos e controle a exclusão automática dos registros vencidos.' : isSchedule ? 'Defina os dias, os horários e as vagas de atendimento.' : isUsers ? 'Gerencie as contas e as permissões da equipe.' : isAccount ? 'Mantenha sua senha de acesso atualizada.' : isAnalytics ? 'Acompanhe o uso do assistente e os atendimentos.' : isAgenda ? 'Consulte a agenda e organize os atendimentos presenciais.' : 'Organize as opções e as orientações do assistente virtual.';

  return (
    <ConversationEventsContext.Provider value={conversationEvents}><div data-ui="admin-layout" className={cx(ui.adminLayout)} onKeyDown={event => { if (event.key === 'Escape' && navOpen) { setNavOpen(false); menuButton.current?.focus(); } }}>
      <a data-ui="skip-link" className={cx(ui.skipLink)} href="#main-content">Ir para o conteúdo</a>
      <aside data-ui="sidebar" className={cx(ui.sidebar)}>
        <div data-ui="sidebar-logo" className={cx(ui.sidebarLogo)}>
          <Brand />
          {!auth.user?.mustChangePassword && <button ref={menuButton} type="button" data-ui="nav-toggle" className={cx(ui.navToggle)} aria-expanded={navOpen} aria-controls="panel-navigation" onClick={() => setNavOpen(value => !value)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>Menu</button>}
        </div>
        {!auth.user?.mustChangePassword && <nav id="panel-navigation" data-open={navOpen} data-ui="sidebar-nav" className={cx(ui.sidebarNav)} aria-label="Menu principal">
          <p data-ui="nav-caption" className={cx(ui.navCaption)}>Painel de atendimento</p>
          {auth.user?.role === 'ADMIN' && <button
            data-ui="nav-item" className={cx(ui.navItem)}
            aria-current={isAnalytics ? 'page' : undefined} onClick={() => go('/analytics')}
          >
            <IconChart />
            <span>Indicadores</span>
          </button>}
          <button
            data-ui="nav-item" className={cx(ui.navItem)}
            aria-current={isAgenda ? 'page' : undefined} onClick={() => go('/agenda')}
          >
            <IconCalendar />
            <span>Agenda de atendimentos</span>
          </button>
          <button data-ui="nav-item" className={cx(ui.navItem)} aria-current={isConversations ? 'page' : undefined} onClick={() => go('/conversations')}>
            <IconChat />
            <span>Atendimento virtual</span>{conversationEvents.waiting > 0 && <span className="ml-auto rounded-full bg-brand-light px-2 text-sm font-semibold text-brand-dark">{conversationEvents.waiting}</span>}
          </button>
          {auth.user?.role === 'ADMIN' && <div className="mt-2 border-t border-white/15 pt-3">
            <button
              type="button"
              data-ui="nav-item"
              className={cx(ui.navItem, isSettingsPage && !settingsOpen && 'bg-white/10 text-white')}
              aria-expanded={settingsOpen}
              aria-controls="panel-settings-navigation"
              onClick={() => setSettingsOverride({ locationKey: location.key, open: !settingsOpen })}
            >
              <IconSettings />
              <span>Configurações</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cx('ml-auto shrink-0 transition-transform duration-200 motion-reduce:transition-none', settingsOpen && 'rotate-180')}><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div
              id="panel-settings-navigation"
              inert={!settingsOpen}
              className={cx('grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none', settingsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
            >
              <div className="min-h-0 overflow-hidden">
                <ul className="mt-1 ml-6 grid gap-1 border-l border-white/20 pl-2">
                  {settingsLinks.map(({ path, label, icon }) => <li key={path}>
                    <button
                      type="button"
                      data-ui="nav-item"
                      className={cx(ui.navItem, 'min-h-10! py-2! text-sm [&>svg]:size-[18px] [&>svg]:shrink-0')}
                      aria-current={location.pathname === path ? 'page' : undefined}
                      onClick={() => go(path)}
                    >
                      {icon}
                      <span>{label}</span>
                    </button>
                  </li>)}
                </ul>
              </div>
            </div>
          </div>}
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
          {conversationEvents.notification && conversationEvents.waiting > 0 && <div className="mx-auto mb-4 flex max-w-7xl flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-brand-dark" role="status">
            <span>Novo pedido de atendimento pelo WhatsApp.</span>
            <div className="flex gap-2"><button className={cx(ui.btnGhost)} onClick={() => { conversationEvents.dismiss(); go('/conversations'); }}>Ver fila</button><button className={cx(ui.btnGhost)} onClick={conversationEvents.dismiss}>Dispensar</button></div>
          </div>}
          {children}
        </div>
      </div>
    </div></ConversationEventsContext.Provider>
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
        <Route path="/institution" element={<ProtectedRoute admin><MainLayout><InstitutionSettingsPage /></MainLayout></ProtectedRoute>} />
        <Route path="/ai-settings" element={<ProtectedRoute admin><MainLayout><AiSettingsPage /></MainLayout></ProtectedRoute>} />
        <Route path="/retention" element={<ProtectedRoute admin><MainLayout><RetentionSettingsPage /></MainLayout></ProtectedRoute>} />
        <Route path="/conversations" element={<ProtectedRoute><MainLayout><Conversations /></MainLayout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}
