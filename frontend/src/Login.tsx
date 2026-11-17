import { cx, ui } from './ui/styles';
import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from './auth/context';
import Brand from './Brand';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const navigate = useNavigate();
  const auth = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(''); setBusy(true);
    try {
      const user = await auth.login(username, password);
      navigate(user.mustChangePassword ? '/account' : user.role === 'ADMIN' ? '/analytics' : '/agenda', { replace: true });
    } catch (failure) {
      setErro(axios.isAxiosError(failure) ? failure.response?.data?.error || 'Não foi possível entrar. Confira a conexão.' : 'Não foi possível entrar.');
    } finally { setBusy(false); setPassword(''); }
  };

  if (auth.loading) return <p data-ui="loading-screen" className={cx(ui.loadingScreen)} role="status">Verificando sessão...</p>;
  if (auth.user) return <Navigate to={auth.user.mustChangePassword ? '/account' : auth.user.role === 'ADMIN' ? '/analytics' : '/agenda'} replace />;
  if (auth.error) return <div data-ui="login-container" className={cx(ui.loginContainer)}><aside data-ui="login-intro" className={cx(ui.loginIntro)}><div data-ui="login-brand" className={cx(ui.loginBrand)}><Brand /></div></aside><main data-ui="login-access" className={cx(ui.loginAccess)}><div data-ui="login-card" className={cx(ui.loginCard)}><div data-ui="login-header" className={cx(ui.loginHeader)}><h2>Acesso ao painel</h2></div><p data-ui="login-error" className={cx(ui.loginError)} role="alert">{auth.error}</p><button data-ui="btn-primary" className={cx(ui.btnPrimary)} onClick={() => void auth.refresh()}>Tentar novamente</button></div></main></div>;

  return (
    <div data-ui="login-container" className={cx(ui.loginContainer)}>
      <aside data-ui="login-intro" className={cx(ui.loginIntro)}>
        <div data-ui="login-brand" className={cx(ui.loginBrand)}><Brand /></div>
        <div data-ui="login-message" className={cx(ui.loginMessage)}><h1>Atendimento ao consumidor, bem organizado.</h1><p>Um espaço para organizar a agenda, acompanhar as orientações e manter o assistente virtual atualizado.</p><div data-ui="login-services" className={cx(ui.loginServices)}><span>Agenda de atendimentos</span><span>Orientações do assistente</span><span>Gestão da equipe</span></div></div>
        <p data-ui="login-location" className={cx(ui.loginLocation)}>PROCON Municipal de Jacareí<span>São Paulo</span></p>
      </aside>
      <main data-ui="login-access" className={cx(ui.loginAccess)}><div data-ui="login-card" className={cx(ui.loginCard)}>
        <div data-ui="login-header" className={cx(ui.loginHeader)}>
          <span data-ui="login-access-icon" className={cx(ui.loginAccessIcon)} aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></span>
          <h2>Acesse o painel</h2>
          <p>Use o usuário e a senha cadastrados pela administração.</p>
        </div>

        {location.state?.passwordChanged && <p data-ui="login-notice" className={cx(ui.loginNotice)} role="status">Senha alterada. Entre novamente.</p>}
        {erro && <div role="alert" data-ui="login-error" className={cx(ui.loginError)}>{erro}</div>}

        <form onSubmit={handleLogin} data-ui="login-form" className={cx(ui.loginForm)}>
          <div data-ui="form-group" className={cx(ui.formGroup)}>
            <label htmlFor="username">Usuário</label>
            <input
              id="username"
              type="text"
              placeholder="Digite o usuário"
              value={username}
              autoComplete="username"
              maxLength={64}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div data-ui="form-group" className={cx(ui.formGroup)}>
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              placeholder="Digite a senha"
              value={password}
              autoComplete="current-password"
              maxLength={128}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" data-ui="btn-primary btn-full" className={cx(ui.btnPrimary, ui.btnFull)} disabled={busy}>
            {busy ? 'Entrando...' : 'Entrar no painel'}
          </button>
        </form>
        <p data-ui="login-help" className={cx(ui.loginHelp)}>Precisa de acesso? Procure o administrador do sistema.</p>
        <p data-ui="login-restricted" className={cx(ui.loginRestricted)}>Área restrita à equipe do PROCON.</p>
      </div></main>
    </div>
  );
}
