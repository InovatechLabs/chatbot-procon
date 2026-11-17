import { cx, ui } from '../ui/styles';
import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/api';
import { useAuth } from './context';

export default function Account() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const auth = useAuth();
  return <section data-ui="account-card" className={cx(ui.accountCard)}>
    <h2>Alterar senha</h2>
    {auth.user?.mustChangePassword && <p role="status">Sua senha é temporária. Defina uma senha pessoal diferente para liberar o acesso ao painel.</p>}
    <p>Após a alteração, todas as sessões serão encerradas. Entre novamente com a nova senha.</p>
    <form data-ui="login-form" className={cx(ui.loginForm)} onSubmit={async event => {
      event.preventDefault(); setError('');
      if (password !== confirmation) { setError('As novas senhas não conferem.'); return; }
      setBusy(true);
      try { await authService.changePassword(current, password); window.dispatchEvent(new Event('panel-session-expired')); navigate('/', { replace: true, state: { passwordChanged: true } }); }
      catch (failure) { setError(axios.isAxiosError(failure) ? failure.response?.data?.error || 'Não foi possível alterar a senha.' : 'Não foi possível alterar a senha.'); }
      finally { setBusy(false); setCurrent(''); setPassword(''); setConfirmation(''); }
    }}>
      <div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="current-password">Senha atual</label><input id="current-password" type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={event => setCurrent(event.target.value)} /></div>
      <div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="new-password">Nova senha (12–128 caracteres)</label><input id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></div>
      <div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="confirm-password">Confirme a nova senha</label><input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>
      {error && <p role="alert" data-ui="login-error" className={cx(ui.loginError)}>{error}</p>}
      <button data-ui="btn-primary" className={cx(ui.btnPrimary)} disabled={busy} type="submit">{busy ? 'Salvando...' : 'Alterar senha'}</button>
    </form>
  </section>;
}
