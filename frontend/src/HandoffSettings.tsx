import { useEffect, useState } from 'react';
import axios from 'axios';
import api from './services/api';
import { ui } from './ui/styles';

interface Period { weekday: number; start: string; end: string }
interface Rules {
  enabled: boolean;
  periods: Period[] | null;
  queueMessage: string;
  closedMessage: string;
}
interface Settings extends Rules { version: number; pilotRestricted: boolean }

const weekdays = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
const startPattern = '(?:[01][0-9]|2[0-3]):[0-5][0-9]';
const endPattern = `(?:${startPattern}|24:00)`;
const rulesOf = ({ enabled, periods, queueMessage, closedMessage }: Settings): Rules => ({ enabled, periods, queueMessage, closedMessage });
const comparePeriods = (a: Period, b: Period) => a.weekday - b.weekday || a.start.localeCompare(b.start);

export default function HandoffSettingsPage() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Rules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void api.get<Settings>('/handoff-settings', { signal: controller.signal }).then(({ data }) => {
      setSaved(data);
      setDraft(rulesOf(data));
      setConflict(false);
    }).catch(() => {
      if (!controller.signal.aborted) setError('Não foi possível carregar as regras de atendimento.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [reload]);

  const updateDraft = (change: Partial<Rules>) => {
    setDraft(previous => previous && { ...previous, ...change });
    setNotice('');
  };
  const save = async () => {
    if (!saved || !draft || saving || conflict) return;
    const periods = draft.periods === null ? null : [...draft.periods].sort(comparePeriods);
    if (periods && !periods.length) { setError('Adicione pelo menos um intervalo ou selecione disponibilidade sem horário fixo.'); return; }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.put<Settings>('/handoff-settings', { version: saved.version, value: { ...draft, periods } });
      setSaved(data);
      setDraft(rulesOf(data));
      setNotice('Regras salvas. Os próximos pedidos de atendimento já usam esta configuração.');
    } catch (failure) {
      setConflict(axios.isAxiosError(failure) && failure.response?.status === 409);
      setError(axios.isAxiosError(failure) ? failure.response?.data?.error || 'Não foi possível salvar as regras.' : 'Não foi possível salvar as regras.');
    } finally { setSaving(false); }
  };

  return <main className="mx-auto grid max-w-5xl gap-5" aria-busy={loading || saving}>
    {loading && <p role="status">Carregando regras de atendimento...</p>}
    {error && <p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!loading && draft && <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={saving || conflict} className="grid min-w-0 gap-5">
        <section className="border border-slate-200 bg-white p-5 sm:p-8">
          <h2 className="mb-4 text-xl font-semibold text-brand-dark">Disponibilidade do chat</h2>
          <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={draft.enabled} onChange={event => updateDraft({ enabled: event.target.checked })} />
            Receber novos pedidos de atendimento por chat
          </label>
          <p className="mt-2 text-sm text-slate-600">Ao desativar, a equipe ainda pode concluir as conversas já abertas e atender as pessoas que já estão na fila.</p>
          {saved?.pilotRestricted && <p className="mt-3 text-sm font-medium text-slate-700">Modo piloto ativo. A entrada no chat está restrita ao número de teste configurado no servidor.</p>}
          <label className="mt-5 flex items-start gap-3 text-sm font-semibold text-slate-800">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={draft.periods !== null} onChange={event => updateDraft({ periods: event.target.checked ? [] : null })} />
            Restringir novos pedidos ao expediente semanal
          </label>
          {draft.periods !== null && <div className="mt-3">
            <p className="mb-4 text-sm leading-6 text-slate-600">Use o horário de Brasília. Dias sem intervalos ficam fechados. Para um intervalo até a meia-noite, use 24:00 como fim.</p>
            <div className="divide-y divide-slate-200">
              {weekdays.map((day, weekdayIndex) => {
                const weekday = weekdayIndex + 1;
                const periods = draft.periods ?? [];
                return <section key={day} aria-label={day} className="grid items-start gap-3 py-3 sm:grid-cols-[9rem_1fr_auto]">
                  <h3 className="pt-2 text-sm font-semibold text-slate-700">{day}</h3>
                  <div className="grid gap-2">
                    {periods.map((value, index) => value.weekday === weekday && <div key={index} className="flex flex-wrap items-end gap-2">
                      {(['start', 'end'] as const).map(key => <label key={key} className="grid gap-1 text-xs text-slate-600">
                        {key === 'start' ? 'Início' : 'Fim'}
                        <input required placeholder="HH:MM" maxLength={5} pattern={key === 'start' ? startPattern : endPattern} value={value[key]} className="w-20 rounded-md border border-slate-300 px-2 py-2 text-sm"
                          onChange={event => updateDraft({ periods: periods.map((item, position) => position === index ? { ...item, [key]: event.target.value } : item) })} />
                      </label>)}
                      <button type="button" className={ui.btnGhost} onClick={() => updateDraft({ periods: periods.filter((_, position) => position !== index) })}>Remover</button>
                    </div>)}
                  </div>
                  <button type="button" className={ui.btnGhost} disabled={periods.length >= 28} onClick={() => updateDraft({ periods: [...periods, { weekday, start: '', end: '' }] })}>Adicionar intervalo</button>
                </section>;
              })}
            </div>
          </div>}
        </section>
        <section className="border border-slate-200 bg-white p-5 sm:p-8">
          <h2 className="text-xl font-semibold text-brand-dark">Mensagens do WhatsApp</h2>
          <p className="mt-2 mb-5 text-sm leading-6 text-slate-600">Use <code>{'{{nome}}'}</code>, <code>{'{{telefone}}'}</code>, <code>{'{{horario}}'}</code>, <code>{'{{endereco}}'}</code> ou <code>{'{{email}}'}</code> para inserir dados da página Institucional.</p>
          {([
            { key: 'queueMessage', label: 'Entrada na fila', help: 'O bot acrescenta a posição e a opção de sair da fila.' },
            { key: 'closedMessage', label: 'Fora do expediente', help: 'O bot oferece agendamento presencial e retorno ao menu.' },
          ] as const).map(({ key, label, help }) => <div key={key} className={ui.formGroup}>
            <label htmlFor={key}>{label}</label>
            <textarea id={key} required rows={3} maxLength={600} value={draft[key]} aria-describedby={`${key}-help`} onChange={event => updateDraft({ [key]: event.target.value })} />
            <p id={`${key}-help`} className="mt-1 text-xs text-slate-600">{help}</p>
          </div>)}
        </section>
        <div><button type="submit" className={ui.btnPrimary}>{saving ? 'Salvando...' : 'Salvar regras'}</button></div>
      </fieldset>
    </form>}
    {!loading && (!saved || conflict) && <div><button type="button" className={ui.btnGhost} onClick={() => {
      if (conflict && !window.confirm('Descartar as alterações locais e recarregar as regras?')) return;
      setError(''); setNotice(''); setLoading(true); setReload(value => value + 1);
    }}>Recarregar regras</button></div>}
  </main>;
}
