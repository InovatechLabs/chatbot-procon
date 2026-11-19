import { cx, ui } from './ui/styles';
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { scheduleApi } from './services/schedule';
import type { BlockRule, ScheduleSettings as Settings, ScheduleSlot, ScheduleView } from './services/schedule';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const time = (minute: number) => `${String(Math.floor((minute % 1440) / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const endMinutes = (value: string) => minutes(value) || 1440;
const dateLabel = (value: string) => value.split('-').reverse().join('/');
const errorMessage = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.error || 'Não foi possível concluir. Confira a conexão.' : 'Não foi possível concluir a operação.';
const defaults: Settings = { capacity: 1, startMinute: 540, endMinute: 1020, slotMinutes: 30, minLeadMinutes: 60, workDays: [1, 2, 3, 4, 5] };
const blankBlock = (): Omit<BlockRule, 'id'> => ({ startDate: today(), endDate: today(), weekDays: [], startMinute: null, endMinute: null, note: null });
function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return <div data-ui="schedule-days" className={cx(ui.scheduleDays)}>{DAYS.map((label, index) => <label key={label}><input type="checkbox" checked={value.includes(index)} onChange={() => onChange(value.includes(index) ? value.filter(day => day !== index) : [...value, index].sort())} />{label}</label>)}</div>;
}
export default function ScheduleSettingsPage() {
  const [view, setView] = useState<ScheduleView | null>(null);
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [capacity, setCapacity] = useState({ date: today(), minute: -1, capacity: 2 });
  const [capacityId, setCapacityId] = useState<string>();
  const [block, setBlock] = useState(blankBlock);
  const [blockId, setBlockId] = useState<string>();
  const [recurring, setRecurring] = useState(false);
  const [fullDay, setFullDay] = useState(true);
  const [previewDate, setPreviewDate] = useState(today);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [removing, setRemoving] = useState<{ kind: 'capacities' | 'blocks'; id: string } | null>(null);
  const apply = useCallback((data: ScheduleView, reset = false) => {
    setView(data);
    setPreviewLoading(true);
    if (reset) { const { capacity, startMinute, endMinute, slotMinutes, minLeadMinutes, workDays } = data.settings; setSettings({ capacity, startMinute, endMinute, slotMinutes, minLeadMinutes, workDays }); }
  }, []);
  useEffect(() => {
    let active = true;
    scheduleApi.get().then(data => { if (active) apply(data, true); }).catch(failure => { if (active) setError(errorMessage(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apply]);
  useEffect(() => {
    if (!view || !previewDate) return;
    let active = true;
    scheduleApi.preview(previewDate).then(data => { if (active) { setSlots(data); setPreviewError(''); } }).catch(failure => { if (active) { setPreviewError(errorMessage(failure)); setSlots([]); } }).finally(() => { if (active) setPreviewLoading(false); });
    return () => { active = false; };
  }, [previewDate, view]);
  const reload = async () => {
    setLoading(true); setError('');
    try { apply(await scheduleApi.get(), true); } catch (failure) { setError(errorMessage(failure)); } finally { setLoading(false); }
  };
  const save = async (operation: () => Promise<ScheduleView>, text: string, reset = false) => {
    setBusy(true); setError(''); setMessage('');
    try { const data = await operation(); apply(data, reset); setMessage(text); return true; }
    catch (failure) { setError(errorMessage(failure)); return false; }
    finally { setBusy(false); }
  };
  const clearBlock = () => { setBlockId(undefined); setBlock(blankBlock()); setRecurring(false); setFullDay(true); };
  if (loading) return <p role="status">Carregando regras de disponibilidade...</p>;
  return <section data-ui="users-page" className={cx(ui.usersPage)}>
    <div data-ui="users-heading" className={cx(ui.usersHeading)}><div><h2>Disponibilidade de atendimentos</h2><p>Regras compartilhadas pelo painel e pelo bot. Datas e horários de Brasília.</p></div><button data-ui="btn-ghost" className={cx(ui.btnGhost)} disabled={busy} onClick={() => void reload()}>Recarregar regras</button></div>
    {error && <p role="alert" data-ui="login-error" className={cx(ui.loginError)}>{error}</p>}{message && <p role="status" data-ui="users-notice" className={cx(ui.usersNotice)}>{message}</p>}
    {!view ? <p>As regras não puderam ser carregadas.</p> : <>
      {view.conflicts.length > 0 && <aside data-ui="schedule-warning" className={cx(ui.scheduleWarning)} role="status"><h3>{view.conflicts.length} agendamento(s) precisam de revisão</h3><p>As marcações abaixo foram preservadas. Use Gestão de Atendimento para remarcar ou cancelar com o consumidor.</p><ul>{view.conflicts.slice(0, 50).map(item => <li key={item.id}>{new Date(item.scheduledAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}: {item.reasons.join('; ')}</li>)}</ul>{view.conflicts.length > 50 && <p>Exibindo os primeiros 50.</p>}</aside>}
      <div data-ui="schedule-columns" className={cx(ui.scheduleColumns)}>
        <section data-ui="users-editor" className={cx(ui.usersEditor)}><h3>Regra geral e expediente</h3><p>Usados em todos os dias e horários sem exceção de capacidade. Alterar funcionários não altera esse número.</p>
          <form data-ui="login-form" className={cx(ui.loginForm)} onSubmit={event => { event.preventDefault(); void save(() => scheduleApi.settings(view.settings.version, settings), 'Regra geral atualizada. Agendamentos existentes foram preservados.', true); }}><fieldset disabled={busy}>
            <div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="general-capacity">Atendimentos simultâneos</label><input id="general-capacity" type="number" min={1} max={1000} required value={settings.capacity} onChange={event => setSettings({ ...settings, capacity: Number(event.target.value) })} /></div>
            <div data-ui="schedule-pair" className={cx(ui.schedulePair)}><div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="open-time">Início</label><input id="open-time" type="time" required value={time(settings.startMinute)} onChange={event => setSettings({ ...settings, startMinute: minutes(event.target.value) })} /></div><div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="close-time">Fim</label><input id="close-time" type="time" required value={time(settings.endMinute)} onChange={event => setSettings({ ...settings, endMinute: endMinutes(event.target.value) })} /></div></div>
            <div data-ui="schedule-pair" className={cx(ui.schedulePair)}><div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="slot-duration">Duração (minutos)</label><input id="slot-duration" type="number" min={5} max={480} required value={settings.slotMinutes} onChange={event => setSettings({ ...settings, slotMinutes: Number(event.target.value) })} /></div><div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="min-lead">Antecedência mínima (minutos)</label><input id="min-lead" type="number" min={0} max={10080} required value={settings.minLeadMinutes} onChange={event => setSettings({ ...settings, minLeadMinutes: Number(event.target.value) })} /></div></div>
            <div><p>Dias de atendimento</p><DayPicker value={settings.workDays} onChange={workDays => setSettings({ ...settings, workDays })} /></div>
            <p>Fim às 00:00 significa o final do dia. A última sessão precisa terminar dentro do expediente. Marcações existentes mantêm sua duração.</p>
            <button data-ui="btn-primary" className={cx(ui.btnPrimary)} type="submit">Salvar regra geral</button>
          </fieldset></form>
        </section>
        <section data-ui="users-editor" className={cx(ui.usersEditor)}><h3>{capacityId ? 'Editar exceção de capacidade' : 'Capacidade por dia ou horário'}</h3><p>A capacidade do horário prevalece sobre a do dia; a do dia prevalece sobre a geral. Bloqueios sempre prevalecem.</p>
          <form data-ui="login-form" className={cx(ui.loginForm)} onSubmit={event => { event.preventDefault(); void save(() => scheduleApi.capacity(view.settings.version, capacity, capacityId), 'Exceção de capacidade salva.').then(ok => { if (ok) setCapacityId(undefined); }); }}><fieldset disabled={busy}>
            <div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="capacity-date">Data</label><input id="capacity-date" type="date" required value={capacity.date} onChange={event => setCapacity({ ...capacity, date: event.target.value })} /></div>
            <label data-ui="users-active" className={cx(ui.usersActive)}><input type="checkbox" checked={capacity.minute === -1} onChange={event => setCapacity({ ...capacity, minute: event.target.checked ? -1 : view.settings.startMinute })} />Todos os horários desse dia</label>
            {capacity.minute !== -1 && <div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="capacity-time">Horário</label><input id="capacity-time" type="time" required value={time(capacity.minute)} onChange={event => setCapacity({ ...capacity, minute: minutes(event.target.value) })} /></div>}
            <div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="capacity-value">Capacidade total (não vagas adicionais)</label><input id="capacity-value" type="number" min={1} max={1000} required value={capacity.capacity} onChange={event => setCapacity({ ...capacity, capacity: Number(event.target.value) })} /></div>
            <p>Exceções não criam horários fora da grade ou do expediente. Para impedir reservas, use um bloqueio.</p>
            <div data-ui="users-actions" className={cx(ui.usersActions)}><button data-ui="btn-primary" className={cx(ui.btnPrimary)} type="submit">Salvar capacidade</button>{capacityId && <button data-ui="btn-ghost" className={cx(ui.btnGhost)} type="button" onClick={() => { setCapacityId(undefined); setCapacity({ date: today(), minute: -1, capacity: 2 }); }}>Cancelar edição</button>}</div>
          </fieldset></form>
        </section>
      </div>
      <section data-ui="users-editor schedule-block-editor" className={cx(ui.usersEditor, ui.scheduleBlockEditor)}><h3>{blockId ? 'Editar bloqueio' : 'Bloquear dia, período ou recorrência'}</h3><p>Use dia inteiro para feriados e férias. Para almoço, selecione os dias recorrentes e o intervalo.</p>
        <form data-ui="login-form" className={cx(ui.loginForm)} onSubmit={event => { event.preventDefault(); const value = { ...block, weekDays: recurring ? block.weekDays : [], startMinute: fullDay ? null : block.startMinute, endMinute: fullDay ? null : block.endMinute }; void save(() => scheduleApi.block(view.settings.version, value, blockId), 'Bloqueio salvo. Novas reservas serão impedidas; revise os avisos sobre marcações existentes.').then(ok => { if (ok) clearBlock(); }); }}><fieldset disabled={busy}>
          <label data-ui="users-active" className={cx(ui.usersActive)}><input type="checkbox" checked={recurring} onChange={event => { setRecurring(event.target.checked); setBlock({ ...block, weekDays: event.target.checked ? [1, 2, 3, 4, 5] : [], startDate: event.target.checked ? null : today(), endDate: event.target.checked ? null : today() }); }} />Repetir por dias da semana</label>
          {recurring && <div><p>Dias recorrentes</p><DayPicker value={block.weekDays} onChange={weekDays => setBlock({ ...block, weekDays })} /><p>Datas abaixo são opcionais para limitar a recorrência.</p></div>}
          <div data-ui="schedule-pair" className={cx(ui.schedulePair)}><div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="block-start">De</label><input id="block-start" type="date" required={!recurring} value={block.startDate ?? ''} onChange={event => setBlock({ ...block, startDate: event.target.value || null })} /></div><div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="block-end">Até (inclusive)</label><input id="block-end" type="date" required={!recurring} value={block.endDate ?? ''} onChange={event => setBlock({ ...block, endDate: event.target.value || null })} /></div></div>
          <label data-ui="users-active" className={cx(ui.usersActive)}><input type="checkbox" checked={fullDay} onChange={event => { setFullDay(event.target.checked); setBlock({ ...block, startMinute: event.target.checked ? null : 720, endMinute: event.target.checked ? null : 780 }); }} />Dia inteiro</label>
          {!fullDay && <div data-ui="schedule-pair" className={cx(ui.schedulePair)}><div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="block-from-time">A partir de</label><input id="block-from-time" type="time" required value={time(block.startMinute ?? 720)} onChange={event => setBlock({ ...block, startMinute: minutes(event.target.value) })} /></div><div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="block-to-time">Até</label><input id="block-to-time" type="time" required value={time(block.endMinute ?? 780)} onChange={event => setBlock({ ...block, endMinute: endMinutes(event.target.value) })} /></div></div>}
          <div data-ui="form-group" className={cx(ui.formGroup)}><label htmlFor="block-note">Motivo (opcional, somente administração)</label><textarea id="block-note" maxLength={300} value={block.note ?? ''} onChange={event => setBlock({ ...block, note: event.target.value || null })} /></div>
          <p>Intervalos usam o início incluído e o fim excluído: 12:00–13:00 permite um atendimento começar às 13:00. Não são aceitas sessões que atravessem o bloqueio.</p>
          <div data-ui="users-actions" className={cx(ui.usersActions)}><button data-ui="btn-primary" className={cx(ui.btnPrimary)} type="submit">Salvar bloqueio</button>{blockId && <button data-ui="btn-ghost" className={cx(ui.btnGhost)} type="button" onClick={clearBlock}>Cancelar edição</button>}</div>
        </fieldset></form>
      </section>
      <section><h3>Exceções cadastradas</h3>{!view.capacities.length ? <p>Nenhuma exceção de capacidade.</p> : <ul data-ui="schedule-rules" className={cx(ui.scheduleRules)}>{view.capacities.map(rule => <li key={rule.id}><span>{dateLabel(rule.date)} · {rule.minute === -1 ? 'Dia inteiro' : time(rule.minute)} · capacidade {rule.capacity}</span><div data-ui="users-actions" className={cx(ui.usersActions)}><button data-ui="btn-ghost" className={cx(ui.btnGhost)} disabled={busy} onClick={() => { setCapacityId(rule.id); setCapacity({ date: rule.date, minute: rule.minute, capacity: rule.capacity }); }}>Editar</button><button data-ui="btn-ghost" className={cx(ui.btnGhost)} disabled={busy} onClick={() => setRemoving({ kind: 'capacities', id: rule.id })}>Remover</button></div></li>)}</ul>}</section>
      <section><h3>Bloqueios cadastrados</h3>{!view.blocks.length ? <p>Nenhum bloqueio.</p> : <ul data-ui="schedule-rules" className={cx(ui.scheduleRules)}>{view.blocks.map(rule => <li key={rule.id}><div><p>{rule.startDate ? dateLabel(rule.startDate) : 'Sem início definido'} até {rule.endDate ? dateLabel(rule.endDate) : 'sem fim definido'} · {rule.weekDays.length ? rule.weekDays.map(day => DAYS[day]).join(', ') : 'Todos os dias do período'} · {rule.startMinute === null ? 'Dia inteiro' : `${time(rule.startMinute)}–${time(rule.endMinute!)}`}</p>{rule.note && <small>Motivo: {rule.note}</small>}</div><div data-ui="users-actions" className={cx(ui.usersActions)}><button data-ui="btn-ghost" className={cx(ui.btnGhost)} disabled={busy} onClick={() => { const { id, startDate, endDate, weekDays, startMinute, endMinute, note } = rule; setBlockId(id); setBlock({ startDate, endDate, weekDays, startMinute, endMinute, note }); setRecurring(weekDays.length > 0); setFullDay(startMinute === null); }}>Editar</button><button data-ui="btn-ghost" className={cx(ui.btnGhost)} disabled={busy} onClick={() => setRemoving({ kind: 'blocks', id: rule.id })}>Remover</button></div></li>)}</ul>}</section>
      {removing && <aside data-ui="users-notice" className={cx(ui.usersNotice)}><p>Confirma remover {removing.kind === 'blocks' ? 'o bloqueio' : 'a exceção'}? Os horários voltarão a seguir as demais regras; nenhum agendamento será cancelado.</p><div data-ui="users-actions" className={cx(ui.usersActions)}><button data-ui="btn-primary" className={cx(ui.btnPrimary)} disabled={busy} onClick={() => void save(() => scheduleApi.remove(removing.kind, removing.id, view.settings.version), 'Regra removida.').then(ok => { if (ok) setRemoving(null); })}>Confirmar remoção</button><button data-ui="btn-ghost" className={cx(ui.btnGhost)} disabled={busy} onClick={() => setRemoving(null)}>Cancelar</button></div></aside>}
      <section><h3>Conferir disponibilidade</h3><label htmlFor="preview-date">Data</label><input id="preview-date" type="date" value={previewDate} onChange={event => { setPreviewDate(event.target.value); setPreviewLoading(Boolean(event.target.value)); setPreviewError(''); }} />
        {previewError && <p role="alert">{previewError}</p>}{!previewDate ? <p>Selecione uma data.</p> : previewLoading ? <p role="status">Consultando...</p> : !slots.length ? <p>Sem grade de atendimento nesse dia.</p> : <div data-ui="users-table-wrap" className={cx(ui.usersTableWrap)}><table data-ui="users-table" className={cx(ui.usersTable)}><thead><tr><th>Horário</th><th>Capacidade</th><th>Ocupação simultânea</th><th>Vagas</th><th>Situação</th></tr></thead><tbody>{slots.map(slot => <tr key={slot.scheduledAt}><th scope="row">{slot.time}</th><td>{slot.capacity}</td><td>{slot.taken}</td><td>{slot.remaining}</td><td>{slot.blocked ? 'Bloqueado' : slot.available ? 'Disponível' : slot.remaining ? 'Fora da antecedência mínima' : 'Lotado'}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </section>;
}
