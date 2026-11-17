import { cx, ui } from './ui/styles';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  agendaService,
  type Agendamento,
  type HistoricoAtendimento,
  type StatusAgendamento,
} from './services/api';

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

const appointmentTones: Record<StatusAgendamento, string> = { pendente: 'bg-warning-light text-[#80510b]', concluido: 'bg-success-light text-[#216745]', cancelado: 'bg-danger-light text-[#9b3030]' };

const ROTULO_STATUS: Record<StatusAgendamento, string> = {
  pendente: 'Pendente',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const formatarTelefone = (digitos: string) => {
  if (!digitos) return 'Telefone não informado';
  const d = digitos.startsWith('55') ? digitos.slice(2) : digitos;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
};

const formatarDataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const mensagemErro = (err: unknown, padrao: string) =>
  isAxiosError(err) && typeof err.response?.data?.message === 'string' ? err.response.data.message : padrao;

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
  status: StatusAgendamento;
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
  const [historicoAlvo, setHistoricoAlvo] = useState<Agendamento | null>(null);
  const [historico, setHistorico] = useState<HistoricoAtendimento | null>(null);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoErro, setHistoricoErro] = useState('');
  const [contato, setContato] = useState<{ id: string; phone: string } | null>(null);
  const [contatoErro, setContatoErro] = useState('');
  const [contatoBusy, setContatoBusy] = useState(false);

  const carregarAgendamentos = useCallback(() => {
    const mesRef = `${mesAtual.getFullYear()}-${String(mesAtual.getMonth() + 1).padStart(2, '0')}`;
    return agendaService.getAgendamentos({ mes: mesRef }).then(res => {
      const lista: Agendamento[] = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      setAgendamentos(lista);
    }).catch(err => {
      console.error('❌ [carregarAgendamentos] Erro ao carregar agendamentos:', err);
      setAgendamentos([]);
    }).finally(() => {
      setLoading(false);
    });
  }, [mesAtual]);

  const carregarHorariosDisponiveis = useCallback((data: string) => {
    return agendaService.getHorariosDisponiveis(data).then(res => {
      const horarios: string[] = Array.isArray(res?.data) ? res.data : [];
      setHorariosDisponiveis(horarios);
    }).catch(err => {
      console.error('❌ Erro ao carregar horários disponíveis:', err);
      setHorariosDisponiveis([]);
    });
  }, []);

  useEffect(() => { void carregarAgendamentos(); }, [carregarAgendamentos]);
  useEffect(() => {
    if (modalAberto) void carregarHorariosDisponiveis(diaSelecionado);
  }, [modalAberto, diaSelecionado, carregarHorariosDisponiveis]);

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
      telefone: formatarTelefone(agendamento.telefone),
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
          data: diaSelecionado,
          horario: form.horario,
          nomeCliente: form.nomeCliente,
          assunto: form.assunto,
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
      console.error('❌ Erro ao salvar agendamento:', err);
      setErro(mensagemErro(err, 'Erro ao salvar agendamento. Tente novamente.'));
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
      console.error('❌ Erro ao cancelar agendamento:', err);
      alert(mensagemErro(err, 'Erro ao cancelar agendamento.'));
    }
  };

const abrirHistorico = async (agendamento: Agendamento) => {
    setHistoricoAlvo(agendamento);
    setHistorico(null);
    setHistoricoErro('');
    setHistoricoLoading(true);

    try {
      const res = await agendaService.getHistorico(agendamento.id);

      setHistorico(res);
    } catch (err) {
      console.error('Erro ao carregar conversa:', err);
      setHistoricoErro(mensagemErro(err, 'Não foi possível carregar a conversa.'));
    } finally {
      setHistoricoLoading(false);
    }
  };

  const fecharHistorico = () => {
    setHistoricoAlvo(null);
    setHistorico(null);
    setHistoricoErro('');
  };

  if (loading) {
    return <div data-ui="loading-screen" className={cx(ui.loadingScreen)}>Carregando agenda...</div>;
  }

  return (
    <main data-ui="tab-content agenda-view" className={cx(ui.tabContent, ui.agendaView)}>
      <div data-ui="editor-layout agenda-layout" className={cx(ui.editorLayout, ui.agendaLayout)}>

        {/* CALENDÁRIO */}
        <div data-ui="tree-panel calendar-panel" className={cx(ui.treePanel, ui.calendarPanel)}>
          <div data-ui="panel-header calendar-panel-header" className={cx(ui.panelHeader, ui.calendarPanelHeader)}>
            <div>
              <h3>{MESES[mesAtual.getMonth()]} {mesAtual.getFullYear()}</h3>
              <p data-ui="help-text" className={cx(ui.helpText)}>Selecione um dia para ver ou criar agendamentos.</p>
            </div>
            <div data-ui="calendar-nav" className={cx(ui.calendarNav)}>
              <button type="button" data-ui="btn-icon" className={cx(ui.btnIcon)} aria-label="Mês anterior" onClick={irParaMesAnterior}><IconChevronLeft /></button>
              <button type="button" data-ui="btn-icon" className={cx(ui.btnIcon)} aria-label="Próximo mês" onClick={irParaProximoMes}><IconChevronRight /></button>
            </div>
          </div>

          <div data-ui="calendar-weekdays" className={cx(ui.calendarWeekdays)}>
            {DIAS_SEMANA.map(dia => (
              <span key={dia}>{dia}</span>
            ))}
          </div>

          <div data-ui="calendar-grid" className={cx(ui.calendarGrid)}>
            {diasDoGrid.map(({ data, noMes }, i) => {
              const iso = toISODate(data);
              const isSelecionado = iso === diaSelecionado;
              const isHoje = iso === toISODate(hoje);
              const qtd = contagemPorDia[iso] || 0;
              return (
                <button
                  type="button"
                  key={i}
                  aria-pressed={isSelecionado}
                  aria-label={`${data.toLocaleDateString('pt-BR', { dateStyle: 'full' })}${qtd ? `, ${qtd} agendamentos` : ''}`}
                  data-outside={!noMes} data-today={isHoje} data-ui="calendar-day" className={cx(ui.calendarDay)}
                  onClick={() => setDiaSelecionado(iso)}
                >
                  <span data-ui="calendar-day-number" className={cx(ui.calendarDayNumber)}>{data.getDate()}</span>
                  {qtd > 0 && <span data-ui="calendar-day-dot" className={cx(ui.calendarDayDot)}>{qtd}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* DETALHES DO DIA */}
        <div data-ui="details-panel agenda-details-panel" className={cx(ui.detailsPanel, ui.agendaDetailsPanel)}>
          <div data-ui="panel-header-actions" className={cx(ui.panelHeaderActions)}>
            <div>
              <h3 className={cx("capitalize")}>{formatDataLonga(diaSelecionado)}</h3>
              <p data-ui="node-path" className={cx(ui.nodePath)}>{agendamentosDoDia.length} agendamento(s) neste dia</p>
            </div>
            <button type="button" data-ui="btn-primary" className={cx(ui.btnPrimary)} onClick={abrirModalNovo}>
              <IconPlus /> Novo agendamento
            </button>
          </div>

          {agendamentosDoDia.length === 0 ? (
            <div data-ui="empty-state" className={cx(ui.emptyState)}>
              <div data-ui="empty-icon" className={cx(ui.emptyIcon)}><IconCalendar /></div>
              <h4>Nenhum agendamento</h4>
              <p>Não há horários marcados para este dia ainda.</p>
            </div>
          ) : (
            <div data-ui="agenda-list" className={cx(ui.agendaList)}>
              {agendamentosDoDia.map(a => (
                <div key={a.id} data-ui="agenda-item" className={cx(ui.agendaItem)}>
                  <div data-ui="agenda-item-time" className={cx(ui.agendaItemTime)}>{a.horario}<small className={cx("block")}>{a.duracaoMin} min</small></div>
                  <div data-ui="agenda-item-info" className={cx(ui.agendaItemInfo)}>
                    <span data-ui="table-strong" className={cx(ui.tableStrong)}>{a.nomeCliente || 'Nome não informado'}</span>
                    <span data-ui="table-muted" className={cx(ui.tableMuted)}>{formatarTelefone(contato?.id === a.id ? contato.phone : a.telefone)}{a.assunto ? ` · ${a.assunto}` : ''}</span>
                    <button data-ui="btn-ghost" className={cx(ui.btnGhost)} disabled={contatoBusy} onClick={async () => {
                      if (contato?.id === a.id) { setContato(null); return; }
                      setContato(null); setContatoErro(''); setContatoBusy(true);
                      try { setContato({ id: a.id, phone: await agendaService.getContato(a.id) }); }
                      catch { setContatoErro('Não foi possível consultar o telefone.'); }
                      finally { setContatoBusy(false); }
                    }}>{contato?.id === a.id ? 'Ocultar telefone' : 'Ver telefone'}</button>
                    {contatoErro && <span role="alert">{contatoErro}</span>}
                  </div>
                  {a.origem === 'WHATSAPP' && <span data-ui="tag badge-agenda-whatsapp" className={cx(ui.tag, ui.badgeAgendaWhatsapp)}>WhatsApp</span>}
                  <span className={cx(ui.tag, appointmentTones[a.status])}>{ROTULO_STATUS[a.status]}</span>
                  <div data-ui="agenda-item-actions" className={cx(ui.agendaItemActions)}>
                    <button
                      type="button"
                      data-ui="btn-ghost" className={cx(ui.btnGhost)}
                      onClick={() => {
                        abrirHistorico(a);
                      }}
                    >
                      Conversa
                    </button>
                    <button type="button" data-ui="btn-ghost" className={cx(ui.btnGhost)} onClick={() => abrirModalEdicao(a)}>Editar</button>
                    {a.status === 'pendente' && (
                      <button type="button" data-ui="btn-icon" className={cx(ui.btnIcon)} title="Cancelar agendamento" onClick={() => handleCancelar(a.id)}><IconTrash /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE AGENDAMENTO */}
      {modalAberto && (
        <div data-ui="modal-overlay" className={cx(ui.modalOverlay)} onClick={fecharModal}>
          <div data-ui="modal-card" className={cx(ui.modalCard)} onClick={e => e.stopPropagation()}>
            <div data-ui="panel-header-actions" className={cx(ui.panelHeaderActions)}>
              <h3>{form.id ? 'Editar agendamento' : 'Novo agendamento'}</h3>
              <button type="button" data-ui="btn-icon" className={cx(ui.btnIcon)} aria-label="Fechar formulário" onClick={fecharModal}><IconX /></button>
            </div>

            {erro && <div data-ui="login-error" className={cx(ui.loginError)}>{erro}</div>}

            <form onSubmit={handleSalvar} data-ui="form-editor" className={cx(ui.formEditor)}>
              <div data-ui="form-group" className={cx(ui.formGroup)}>
                <label>Nome do cliente</label>
                <input
                  type="text"
                  value={form.nomeCliente}
                  onChange={e => setForm({ ...form, nomeCliente: e.target.value })}
                  placeholder="Nome completo"
                  required
                />
              </div>

              <div data-ui="form-row" className={cx(ui.formRow)}>
                <div data-ui="form-group" className={cx(ui.formGroup)}>
                  <label>Telefone</label>
                  <input
                    type="text"
                    value={form.telefone}
                    onChange={e => setForm({ ...form, telefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                    readOnly={!!form.id}
                    required
                  />
                </div>
                <div data-ui="form-group" className={cx(ui.formGroup)}>
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

              <div data-ui="form-group" className={cx(ui.formGroup)}>
                <label>Assunto</label>
                <input
                  type="text"
                  value={form.assunto}
                  onChange={e => setForm({ ...form, assunto: e.target.value })}
                  placeholder="Ex: Reclamação sobre produto"
                />
              </div>

              {form.id && (
                <div data-ui="form-group" className={cx(ui.formGroup)}>
                  <label>Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value as FormAgendamento['status'] })}
                  >
                    <option value="pendente">Pendente</option>
                    <option value="concluido">Concluído</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              )}

              <button type="submit" data-ui="btn-primary btn-full" className={cx(ui.btnPrimary, ui.btnFull)} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar agendamento'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* HISTÓRICO DA CONVERSA DO WHATSAPP */}
      {historicoAlvo && (
        <div data-ui="modal-overlay" className={cx(ui.modalOverlay)} onClick={fecharHistorico}>
          <div data-ui="modal-card modal-card-wide" className={cx(ui.modalCard, ui.modalCardWide)} onClick={e => e.stopPropagation()}>
            <div data-ui="panel-header-actions" className={cx(ui.panelHeaderActions)}>
              <div>
                <h3>Conversa do WhatsApp</h3>
                <p data-ui="node-path" className={cx(ui.nodePath)}>
                  {historicoAlvo.nomeCliente || 'Nome não informado'} · {formatarTelefone(historicoAlvo.telefone)}
                </p>
              </div>
              <button type="button" data-ui="btn-icon" className={cx(ui.btnIcon)} aria-label="Fechar conversa" onClick={fecharHistorico}><IconX /></button>
            </div>

            {historicoLoading && <p data-ui="help-text" className={cx(ui.helpText)}>Carregando conversa...</p>}
            {historicoErro && <div data-ui="login-error" className={cx(ui.loginError)}>{historicoErro}</div>}

            {historico && (
              <>
                {historico.sessao && (
                  <p data-ui="help-text" className={cx(ui.helpText)}>
                    Etapa atual no bot: {historico.sessao.etapaAtual || '—'} · Status: {historico.sessao.status}
                    {historico.sessao.nota !== null ? ` · Nota: ${historico.sessao.nota}` : ''}
                  </p>
                )}

                {!historico.mensagens || historico.mensagens.length === 0 ? (
                  <div data-ui="empty-state" className={cx(ui.emptyState)}>
                    <div data-ui="empty-icon" className={cx(ui.emptyIcon)}><IconCalendar /></div>
                    <h4>Sem conversa registrada</h4>
                    <p>Nenhuma mensagem do WhatsApp foi encontrada para este número.</p>
                  </div>
                ) : (
                  <div data-ui="chat-history" className={cx(ui.chatHistory)}>
                    {historico.truncado && (
                      <p data-ui="help-text" className={cx(ui.helpText)}>Exibindo apenas as mensagens mais recentes.</p>
                    )}
                    {historico.mensagens.map(m => (
                      <div key={m.id} data-direction={m.direction} data-ui="chat-bubble" className={cx(ui.chatBubble)}>
                        <span data-ui="chat-bubble-meta" className={cx(ui.chatBubbleMeta)}>
                          {m.direction === 'INBOUND' ? 'Cidadão' : 'Assistente Virtual'} · {formatarDataHora(m.timestamp)}
                          {m.etapa ? ` · ${m.etapa}` : ''}
                        </span>
                        <p>{m.messageText}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
