import { cx, ui } from '../ui/styles';
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { panelUsersService } from '../services/api';
import type { ManagedPanelUser, PanelUser } from '../services/api';
import { useAuth } from './context';

type Action = { kind: 'edit' | 'password' | 'revoke' | 'delete'; user: ManagedPanelUser } | { kind: 'create' };
const failureMessage = (failure: unknown) => axios.isAxiosError(failure) ? failure.response?.data?.error || 'Não foi possível concluir. Confira a conexão e tente novamente.' : 'Não foi possível concluir a operação.';

export default function Users() {
  const auth = useAuth();
  const [users, setUsers] = useState<ManagedPanelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<PanelUser['role']>('ATTENDANT');
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { setUsers(await panelUsersService.list()); }
    catch (failure) { setLoadError(failureMessage(failure)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    panelUsersService.list().then(list => { if (active) setUsers(list); })
      .catch(failure => { if (active) setLoadError(failureMessage(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const open = (next: Action) => {
    setAction(next); setError(''); setMessage(''); setPassword(''); setConfirmation('');
    setUsername(next.kind === 'create' ? '' : next.user.username);
    setRole(next.kind === 'create' ? 'ATTENDANT' : next.user.role);
    setActive(next.kind === 'create' ? true : next.user.active);
  };
  const close = () => { setAction(null); setPassword(''); setConfirmation(''); setError(''); };
  const needsPassword = action?.kind === 'create' || action?.kind === 'password';
  const changesIdentity = action?.kind === 'create' || action?.kind === 'edit';
  const title = action?.kind === 'create' ? 'Cadastrar conta' : action?.kind === 'edit' ? 'Editar conta' : action?.kind === 'password' ? 'Redefinir senha' : action?.kind === 'revoke' ? 'Encerrar sessões' : 'Excluir conta';
  const execute = async () => {
    if (!action) return;
    setError('');
    if (needsPassword && password !== confirmation) { setError('As senhas não conferem.'); return; }
    setBusy(true);
    try {
      switch (action.kind) {
        case 'create': await panelUsersService.create({ username, role, password }); break;
        case 'edit': await panelUsersService.update(action.user.id, { username, role, active }); break;
        case 'password': await panelUsersService.resetPassword(action.user.id, password); break;
        case 'revoke': await panelUsersService.revokeSessions(action.user.id); break;
        case 'delete': await panelUsersService.remove(action.user.id); break;
      }
      const self = action.kind !== 'create' && action.user.id === auth.user?.id;
      const result = action.kind === 'create' ? 'Conta criada. Entregue a senha temporária ao funcionário por um canal privado; ele deverá alterá-la no primeiro acesso.' : action.kind === 'password' ? 'Senha redefinida e sessões encerradas. O funcionário deverá trocar a senha temporária ao entrar.' : action.kind === 'delete' ? 'Conta excluída.' : action.kind === 'revoke' ? 'Sessões encerradas. A conta poderá entrar novamente com sua senha.' : 'Conta atualizada. Se houve alteração, as sessões da conta foram encerradas.';
      close(); setMessage(result);
      if (self) await auth.refresh();
      else await load();
    } catch (failure) { setError(failureMessage(failure)); }
    finally { setBusy(false); }
  };
  return <section data-ui="users-page" className={cx(ui.usersPage)} aria-labelledby="users-title">
    <div data-ui="users-heading" className={cx(ui.usersHeading)}><div><h2 id="users-title">Contas do painel</h2><p>Cadastre acessos individuais e mantenha apenas os funcionários autorizados.</p></div><button data-ui="btn-primary" className={cx(ui.btnPrimary)} onClick={() => open({ kind: 'create' })}>Cadastrar conta</button></div>
    <p>Administradores gerenciam contas e fluxos. Atendentes acessam a agenda e o histórico de atendimento.</p>
    {message && <p role="status" data-ui="users-notice" className={cx(ui.usersNotice)}>{message}</p>}
    {loadError && <div role="alert"><p>{loadError}</p><button data-ui="btn-ghost" className={cx(ui.btnGhost)} onClick={() => void load()}>Tentar novamente</button></div>}
    {loading ? <p role="status">Carregando contas...</p> : !loadError && <div data-ui="users-table-wrap" className={cx(ui.usersTableWrap)}><table data-ui="users-table" className={cx(ui.usersTable)}><caption data-ui="users-sr-only" className={cx(ui.usersSrOnly)}>Contas cadastradas no painel</caption><thead><tr><th scope="col">Usuário</th><th scope="col">Perfil</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead><tbody>
      {users.map(user => <tr key={user.id}><th scope="row">{user.username}{user.id === auth.user?.id && <small> (você)</small>}</th><td>{user.role === 'ADMIN' ? 'Administrador' : 'Atendente'}</td><td>{user.active ? 'Ativa' : 'Desativada'}{user.mustChangePassword && <small data-ui="users-temporary" className={cx(ui.usersTemporary)}>Senha temporária</small>}</td><td><div data-ui="users-actions" className={cx(ui.usersActions)}>
        <button data-ui="btn-ghost" className={cx(ui.btnGhost)} onClick={() => open({ kind: 'edit', user })} aria-label={`Editar ${user.username}`}>Editar</button>
        <button data-ui="btn-ghost" className={cx(ui.btnGhost)} onClick={() => open({ kind: 'password', user })} aria-label={`Redefinir senha de ${user.username}`}>Redefinir senha</button>
        <button data-ui="btn-ghost" className={cx(ui.btnGhost)} onClick={() => open({ kind: 'revoke', user })} aria-label={`Encerrar sessões de ${user.username}`}>Encerrar sessões</button>
        <button data-ui="btn-ghost users-danger" className={cx(ui.btnGhost, ui.usersDanger)} onClick={() => open({ kind: 'delete', user })} aria-label={`Excluir ${user.username}`}>Excluir</button>
      </div></td></tr>)}
    </tbody></table></div>}
    {action && <section data-ui="users-editor" className={cx(ui.usersEditor)} aria-labelledby="user-action-title">
      <h3 id="user-action-title">{title}{action.kind !== 'create' ? `: ${action.user.username}` : ''}</h3>
      <form data-ui="login-form" className={cx(ui.loginForm)} onSubmit={event => { event.preventDefault(); void execute(); }}>
        <fieldset disabled={busy}>
          {changesIdentity && <>
            <div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="managed-username">Usuário</label><input id="managed-username" autoFocus required minLength={3} maxLength={64} pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,63}" autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} /><small>3–64 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.</small></div>
            <div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="managed-role">Perfil</label><select id="managed-role" value={role} onChange={event => setRole(event.target.value as PanelUser['role'])}><option value="ATTENDANT">Atendente</option><option value="ADMIN">Administrador</option></select></div>
          </>}
          {action.kind === 'edit' && <><label data-ui="users-active" className={cx(ui.usersActive)}><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Conta ativa</label><p>Alterações de usuário, perfil ou situação encerram as sessões dessa conta.</p></>}
          {needsPassword && <><p>Informe uma senha temporária. O funcionário terá de escolher outra antes de usar o painel.</p><div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="managed-password">Senha temporária (12–128 caracteres)</label><input id="managed-password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></div><div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="managed-confirmation">Confirme a senha temporária</label><input id="managed-confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div></>}
          {action.kind === 'revoke' && <p>Confirma encerrar todas as sessões desta conta? Isso não muda sua senha.</p>}
          {action.kind === 'delete' && <><p>A exclusão é permanente e encerra todas as sessões. Para suspender o acesso e preservar a conta, use Editar e desmarque Conta ativa.</p><div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="delete-confirmation">Digite {action.user.username} para confirmar</label><input id="delete-confirmation" autoComplete="off" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div></>}
          {action.kind !== 'create' && action.user.id === auth.user?.id && <p data-ui="users-notice" className={cx(ui.usersNotice)}>Você está alterando sua própria conta. Sua sessão poderá ser encerrada. O último administrador ativo não pode ser removido, desativado ou rebaixado.</p>}
        </fieldset>
        {error && <p role="alert" data-ui="login-error" className={cx(ui.loginError)}>{error}</p>}
        <div data-ui="users-actions" className={cx(ui.usersActions)}><button type="submit" data-ui="btn-primary" className={cx(ui.btnPrimary)} disabled={busy || (action.kind === 'delete' && confirmation !== action.user.username)}>{busy ? 'Salvando...' : action.kind === 'delete' ? 'Confirmar exclusão' : action.kind === 'revoke' ? 'Confirmar encerramento' : 'Salvar'}</button><button type="button" data-ui="btn-ghost" className={cx(ui.btnGhost)} disabled={busy} onClick={close}>Cancelar</button></div>
      </form>
    </section>}
  </section>;
}
