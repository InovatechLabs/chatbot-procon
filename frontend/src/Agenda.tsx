import React, { useEffect, useMemo, useState } from 'react';
import { agendaService, type Agendamento } from './services/api';
import './App.css';

const IconChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
);
const IconChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);
const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
);
const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
);

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDataLonga = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
};

interface FormAgendamento {
  id?: string;
  nomeCliente: string;
  telefone: string;
  assunto: string;
  horario: string;
  status: 'confirmado' | 'pendente' | 'cancelado';
}

const FORM_VAZIO: FormAgendamento = {
  nomeCliente: '',
  telefone: '',
  assunto: '',
  horario: '',
  status: 'pendente',
};

export default function Agenda() {
  const hoje = useMemo(() => new Date(), []);
  const [mesAtual, setMesAtual] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [diaSelecionado, setDiaSelecionado] = useState<string>(toISODate(hoje));
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [horariosDisponiveis, setHorariosDisponiveis] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<FormAgendamento>(FORM_VAZIO);
  const [erro, setErro] = useState('');

  useEffect(() => {
    carregarAgendamentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesAtual]);

  useEffect(() => {
    if (modalAberto) {
      carregarHorariosDisponiveis(diaSelecionado);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalAberto, diaSelecionado]);

  const carregarAgendamentos = async () => {
    setLoading(true);
    try {
      const mesRef = `${mesAtual.getFullYear()}-${String(mesAtual.getMonth() + 1).padStart(2, '0')}`;
      const res = await agendaService.getAgendamentos({ mes: mesRef });
      const lista: Agendamento[] = Array.isArray(res?.data) ? res.data : [];
      setAgendamentos(lista);
    } catch (err) {
      console.error('Erro ao carregar agendamentos:', err);
      setAgendamentos([]);
    } finally {
      setLoading(false);
    }
  };

  const carregarHorariosDisponiveis = async (data: string) => {
    try {
      const res = await agendaService.getHorariosDisponiveis(data);
      const horarios: string[] = Array.isArray(res?.data) ? res.data : [];
      setHorariosDisponiveis(horarios);
    } catch (err) {
      console.error('Erro ao carregar horários disponíveis:', err);
      setHorariosDisponiveis([]);
    }
  };

  const agendamentosDoDia = useMemo(
    () => agendamentos
      .filter(a => a.data === diaSelecionado)
      .sort((a, b) => a.horario.localeCompare(b.horario)),
    [agendamentos, diaSelecionado]
  );

  const contagemPorDia = useMemo(() => {
    const mapa: Record<string, number> = {};
    agendamentos.forEach(a => {
      if (a.status !== 'cancelado') {
        mapa[a.data] = (mapa[a.data] || 0) + 1;
      }
    });
    return mapa;
  }, [agendamentos]);

  const diasDoGrid = useMemo(() => {
    const ano = mesAtual.getFullYear();
    const mes = mesAtual.getMonth();
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const totalDiasMes = new Date(ano, mes + 1, 0).getDate();
    const dias: { data: Date; noMes: boolean }[] = [];

    for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
      dias.push({ data: new Date(ano, mes, -i), noMes: false });
    }
    for (let d = 1; d <= totalDiasMes; d++) {
      dias.push({ data: new Date(ano, mes, d), noMes: true });
    }
    while (dias.length % 7 !== 0 || dias.length < 42) {
      const ultima = dias[dias.length - 1].data;
      dias.push({ data: new Date(ultima.getFullYear(), ultima.getMonth(), ultima.getDate() + 1), noMes: false });
    }
    return dias;
  }, [mesAtual]);

  const irParaMesAnterior = () => setMesAtual(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const irParaProximoMes = () => setMesAtual(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const abrirModalNovo = () => {
    setForm(FORM_VAZIO);
    setErro('');
    setModalAberto(true);
  };

  const abrirModalEdicao = (agendamento: Agendamento) => {
    setForm({
      id: agendamento.id,
      nomeCliente: agendamento.nomeCliente,
      telefone: agendamento.telefone,
      assunto: agendamento.assunto,
      horario: agendamento.horario,
      status: agendamento.status,
    });
    setErro('');
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setForm(FORM_VAZIO);
    setErro('');
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nomeCliente || !form.telefone || !form.horario) {
      setErro('Preencha nome, telefone e horário.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      if (form.id) {
        await agendaService.atualizarAgendamento(form.id, {
          nomeCliente: form.nomeCliente,
          telefone: form.telefone,
          assunto: form.assunto,
          horario: form.horario,
          status: form.status,
        });
      } else {
        await agendaService.criarAgendamento({
          data: diaSelecionado,
          horario: form.horario,
          nomeCliente: form.nomeCliente,
          telefone: form.telefone,
          assunto: form.assunto,
        });
      }
      fecharModal();
      carregarAgendamentos();
    } catch (err) {
      console.error('Erro ao salvar agendamento:', err);
      setErro('Erro ao salvar agendamento. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const handleCancelar = async (id: string) => {
    if (!confirm('Cancelar este agendamento?')) return;
    try {
      await agendaService.cancelarAgendamento(id);
      carregarAgendamentos();
    } catch (err) {
      console.error('Erro ao cancelar agendamento:', err);
      alert('Erro ao cancelar agendamento.');
    }
  };

  if (loading) {
    return <div className="loading-screen">Carregando agenda...</div>;
  }

  return (
    <main className="tab-content agenda-view">
      <div className="editor-layout agenda-layout">

        {/* CALENDÁRIO */}
        <div className="tree-panel calendar-panel">
          <div className="panel-header calendar-panel-header">
            <div>
              <h3>{MESES[mesAtual.getMonth()]} {mesAtual.getFullYear()}</h3>
              <p className="help-text">Selecione um dia para ver ou criar agendamentos.</p>
            </div>
            <div className="calendar-nav">
              <button type="button" className="btn-icon" onClick={irParaMesAnterior}><IconChevronLeft /></button>
              <button type="button" className="btn-icon" onClick={irParaProximoMes}><IconChevronRight /></button>
            </div>
          </div>

          <div className="calendar-weekdays">
            {DIAS_SEMANA.map(dia => (
              <span key={dia}>{dia}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {diasDoGrid.map(({ data, noMes }, i) => {
              const iso = toISODate(data);
              const isSelecionado = iso === diaSelecionado;
              const isHoje = iso === toISODate(hoje);
              const qtd = contagemPorDia[iso] || 0;
              return (
                <button
                  type="button"
                  key={i}
                  className={`calendar-day ${!noMes ? 'outside' : ''} ${isSelecionado ? 'selected' : ''} ${isHoje ? 'today' : ''}`}
                  onClick={() => setDiaSelecionado(iso)}
                >
                  <span className="calendar-day-number">{data.getDate()}</span>
                  {qtd > 0 && <span className="calendar-day-dot">{qtd}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* DETALHES DO DIA */}
        <div className="details-panel agenda-details-panel">
          <div className="panel-header-actions">
            <div>
              <h3 style={{ textTransform: 'capitalize' }}>{formatDataLonga(diaSelecionado)}</h3>
              <p className="node-path">{agendamentosDoDia.length} agendamento(s) neste dia</p>
            </div>
            <button type="button" className="btn-primary" onClick={abrirModalNovo}>
              <IconPlus /> Novo agendamento
            </button>
          </div>

          {agendamentosDoDia.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><IconCalendar /></div>
              <h4>Nenhum agendamento</h4>
              <p>Não há horários marcados para este dia ainda.</p>
            </div>
          ) : (
            <div className="agenda-list">
              {agendamentosDoDia.map(a => (
                <div key={a.id} className="agenda-item">
                  <div className="agenda-item-time">{a.horario}</div>
                  <div className="agenda-item-info">
                    <span className="table-strong">{a.nomeCliente}</span>
                    <span className="table-muted">{a.telefone}{a.assunto ? ` · ${a.assunto}` : ''}</span>
                  </div>
                  <span className={`tag badge-agenda-${a.status}`}>{a.status}</span>
                  <div className="agenda-item-actions">
                    <button type="button" className="btn-ghost" onClick={() => abrirModalEdicao(a)}>Editar</button>
                    <button type="button" className="btn-icon" onClick={() => handleCancelar(a.id)}><IconTrash /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE AGENDAMENTO */}
      {modalAberto && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="panel-header-actions">
              <h3>{form.id ? 'Editar agendamento' : 'Novo agendamento'}</h3>
              <button type="button" className="btn-icon" onClick={fecharModal}><IconX /></button>
            </div>

            {erro && <div className="login-error">{erro}</div>}

            <form onSubmit={handleSalvar} className="form-editor">
              <div className="form-group">
                <label>Nome do cliente</label>
                <input
                  type="text"
                  value={form.nomeCliente}
                  onChange={e => setForm({ ...form, nomeCliente: e.target.value })}
                  placeholder="Nome completo"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Telefone</label>
                  <input
                    type="text"
                    value={form.telefone}
                    onChange={e => setForm({ ...form, telefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Horário</label>
                  <select
                    value={form.horario}
                    onChange={e => setForm({ ...form, horario: e.target.value })}
                    required
                  >
                    <option value="">Selecione</option>
                    {form.id && form.horario && !horariosDisponiveis.includes(form.horario) && (
                      <option value={form.horario}>{form.horario}</option>
                    )}
                    {horariosDisponiveis.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Assunto</label>
                <input
                  type="text"
                  value={form.assunto}
                  onChange={e => setForm({ ...form, assunto: e.target.value })}
                  placeholder="Ex: Reclamação sobre produto"
                />
              </div>

              {form.id && (
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value as FormAgendamento['status'] })}
                  >
                    <option value="pendente">Pendente</option>
                    <option value="confirmado">Confirmado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              )}

              <button type="submit" className="btn-primary btn-full" disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar agendamento'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
