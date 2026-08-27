import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Login from './Login';
import Analytics from './Analytics';
import Flow from './Flow';
import './App.css';

const IconChart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);
const IconTree = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m4.22-10.22l4.24-4.24M6.34 17.66l-4.24 4.24M23 12h-6m-6 0H1m20.24 4.24l-4.24-4.24M6.34 6.34L2.1 2.1"/>
  </svg>
);
const IconLogOut = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = localStorage.getItem('authenticated') === 'true';
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('authenticated');
    navigate('/');
  };

  const isAnalytics = location.pathname === '/analytics';
  const pageTitle = isAnalytics ? 'Analytics & Métricas' : 'Editor do Fluxo';

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">P</div>
          <div className="sidebar-logo-text">Painel PROCON<span>Admin</span></div>
        </div>
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${isAnalytics ? 'active' : ''}`}
            onClick={() => navigate('/analytics')}
          >
            <IconChart />
            <span>Analytics & Métricas</span>
          </button>
          <button
            className={`nav-item ${!isAnalytics ? 'active' : ''}`}
            onClick={() => navigate('/flow')}
          >
            <IconTree />
            <span>Editor do Fluxo</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-footer-dot"></span>
          PROCON SP — v2.0
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <h1>{pageTitle}</h1>
            <span className="breadcrumb">Painel PROCON Admin / {pageTitle}</span>
          </div>
          <div className="topbar-actions">
            <button className="btn-ghost" onClick={handleLogout}>
              <IconLogOut /> Sair
            </button>
          </div>
        </header>

        <div className="content">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Analytics />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/flow"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Flow />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}