import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { cx, ui } from './ui/styles';
import { retentionApi, type RetentionSettings, type RetentionValue } from './services/retention';

const fields = [
  { key: 'sessionsDays', label: 'Conversas e histórico', help: 'Conta desde a última atualização. Preserva sessões com agendamentos ou mensagens pendentes.' },
  { key: 'appointmentsDays', label: 'Agendamentos encerrados', help: 'Conta desde a data agendada. Agendamentos pendentes são preservados.' },
  { key: 'receiptsDays', label: 'Registros de mensagens recebidas', help: 'Conta desde a conclusão. Mantém pendências, revisão e vínculos com saídas ainda retidas.' },
  { key: 'outgoingDays', label: 'Registros de mensagens enviadas', help: 'Conta desde o envio confirmado. Envios incertos e falhas para revisão são preservados.' },
] as const;
type Key = typeof fields[number]['key'];
type Draft = Record<Key, string> & { approved: boolean };
const draftOf = (data: RetentionSettings): Draft => ({ sessionsDays: data.sessionsDays?.toString() ?? '', appointmentsDays: data.appointmentsDays?.toString() ?? '', receiptsDays: data.receiptsDays?.toString() ?? '', outgoingDays: data.outgoingDays?.toString() ?? '', approved: data.approved });
const failureMessage = (failure: unknown) => axios.isAxiosError(failure) ? failure.response?.data?.error || 'Não foi possível concluir. Confira a conexão.' : 'Não foi possível concluir a operação.';

export default function RetentionSettingsPage() {
  const [saved, setSaved] = useState<RetentionSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError(''); setMessage('');
    try { const data = await retentionApi.get(); setSaved(data); setDraft(draftOf(data)); }
    catch (failure) { setError(failureMessage(failure)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void retentionApi.get().then(data => { if (active) { setSaved(data); setDraft(draftOf(data)); } })
      .catch(failure => { if (active) setError(failureMessage(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const dirty = !!saved && !!draft && JSON.stringify(draft) !== JSON.stringify(draftOf(saved));
  const save = async () => {
    if (!saved || !draft) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const value: RetentionValue = { sessionsDays: null, appointmentsDays: null, receiptsDays: null, outgoingDays: null, approved: draft.approved };
      for (const { key } of fields) {
        const number = draft[key] === '' ? null : Number(draft[key]);
        if (number !== null && (!Number.isInteger(number) || number < 1 || number > 36500)) throw new Error('invalid-days');
        value[key] = number;
      }
      const data = await retentionApi.save(saved.version, value);
      setSaved(data); setDraft(draftOf(data)); setMessage(data.approved ? 'Política ativa. A limpeza real será executada automaticamente na próxima verificação.' : 'Política desativada. Nenhuma nova limpeza será iniciada.');
    } catch (failure) { setError(failure instanceof Error && failure.message === 'invalid-days' ? 'Use dias inteiros entre 1 e 36500 ou deixe o campo vazio.' : failureMessage(failure)); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto grid max-w-5xl gap-6" aria-busy={loading || busy}>
    <section className="border border-slate-200 bg-white p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand">Privacidade e conservação</p>
      <h2 className="mt-2 text-2xl font-semibold text-brand-dark">Retenção dos registros</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Defina por quanto tempo cada categoria deve ser mantida. Campo vazio preserva a categoria. Ao ativar e salvar, registros vencidos são excluídos de verdade, inclusive os que já existem. A primeira execução ocorre na próxima verificação, em até um minuto; depois, a cada hora enquanto o backend estiver ligado.</p>
      {loading ? <p className="mt-6" role="status">Carregando política...</p> : <>
        {error && <p role="alert" className="mt-4 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="mt-4 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {saved && draft && <form className="mt-6" onSubmit={event => { event.preventDefault(); void save(); }}>
          <fieldset disabled={busy} className="grid gap-6">
            <legend className="sr-only">Prazos de conservação em dias</legend>
            <div className="grid gap-6 sm:grid-cols-2">{fields.map(({ key, label, help }) => <div key={key} className={cx(ui.formGroup)}>
              <label htmlFor={key}>{label} · dias</label>
              <input id={key} type="number" min={1} max={36500} step={1} value={draft[key]} placeholder="Sem limpeza" aria-describedby={`${key}-help`} onChange={event => { setDraft({ ...draft, [key]: event.target.value, approved: false }); setMessage(''); }} />
              <p id={`${key}-help`} className="text-xs leading-5 text-slate-500">{help}</p>
            </div>)}</div>
            <div className="border-l-4 border-amber-500 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Apagar registros recebidos também remove a memória de deduplicação: uma mensagem antiga reenviada pode ser processada novamente. Os prazos devem contemplar reentregas, recuperação e auditoria. Registros de revisão e trabalho pendente são preservados.</div>
            <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1 size-4 shrink-0 accent-brand" type="checkbox" checked={draft.approved} onChange={event => { setDraft({ ...draft, approved: event.target.checked }); setMessage(''); }} /><span>Ativar exclusão automática com estes prazos. Estou ciente de que a exclusão é real e irreversível pelo painel. Alterar um prazo desmarca esta opção; reative antes de salvar para continuar a limpeza.</span></label>
            <div className="flex flex-wrap gap-3">
              <button className={cx(ui.btnPrimary)} type="submit" disabled={!dirty || busy}>{busy ? 'Aguarde...' : 'Salvar política'}</button>
              <button className={cx(ui.btnGhost)} type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm('Descartar alterações e recarregar a política salva?')) void load(); }}>Recarregar</button>
            </div>
            {dirty && <p className="text-sm text-slate-600">As alterações só entram em vigor ao salvar.</p>}
            <p className="text-xs text-slate-500">Versão {saved.version} · Atualizada em {new Date(saved.updatedAt).toLocaleString('pt-BR')} · {saved.approved ? 'Limpeza automática ativa' : 'Limpeza automática desativada'}</p>
          </fieldset>
        </form>}
        {!saved && <button className={cx(ui.btnGhost, 'mt-4')} onClick={() => void load()}>Tentar novamente</button>}
      </>}
    </section>
    {saved && <section className="border border-slate-200 bg-white p-6 sm:p-8">
      <h2 className="text-xl font-semibold text-brand-dark">Última limpeza concluída</h2>
      {saved.lastRunAt && saved.lastRunCounts ? <>
        <p className="mt-2 text-sm text-slate-500">Política v{saved.lastRunVersion} · {new Date(saved.lastRunAt).toLocaleString('pt-BR')}</p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">{[['Conversas', saved.lastRunCounts.sessions], ['Agendamentos', saved.lastRunCounts.appointments], ['Mensagens recebidas', saved.lastRunCounts.receipts], ['Mensagens enviadas', saved.lastRunCounts.outgoing]].map(([label, count]) => <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-100 py-3"><dt className="text-sm text-slate-600">{label}</dt><dd className="text-2xl font-semibold tabular-nums text-brand-dark">{count}</dd></div>)}</dl>
      </> : <p className="mt-3 text-sm text-slate-600">Nenhuma limpeza concluída. Ative e salve uma política para iniciar a retenção automática.</p>}
      <p className="mt-4 text-xs text-slate-500">Use Recarregar para atualizar este resultado. Pendências e vínculos protegidos podem adiar a exclusão de registros vencidos.</p>
    </section>}
  </main>;
}
