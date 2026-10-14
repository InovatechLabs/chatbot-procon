import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 10000,
});

// ============================================
// TIPOS — AGENDA (contrato da tela)
// ============================================

export type StatusAgendamento = 'pendente' | 'concluido' | 'cancelado';

export interface Agendamento {
  id: string;
  data: string;        // YYYY-MM-DD (horário de Brasília)
  horario: string;     // HH:mm
  nomeCliente: string; // vazio quando o agendamento veio do WhatsApp e ninguém preencheu
  telefone: string;    // somente dígitos: é a chave que liga o agendamento à conversa do WhatsApp
  assunto: string;
  status: StatusAgendamento;
  origem: 'PANEL' | 'WHATSAPP';
}

export interface NovoAgendamentoDTO {
  data: string;
  horario: string;
  nomeCliente: string;
  telefone: string;
  assunto?: string;
}

export interface AtualizarAgendamentoDTO {
  data?: string;
  horario?: string;
  nomeCliente?: string;
  assunto?: string;
  status?: StatusAgendamento;
}

export interface MensagemHistorico {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND'; // INBOUND = cidadão, OUTBOUND = bot
  messageText: string;
  timestamp: string;
  etapa: string | null;              // título do Step do fluxo em que a mensagem ocorreu
}

export interface HistoricoAtendimento {
  agendamento: Agendamento;
  sessao: { status: string; nota: number | null; atualizadoEm: string; etapaAtual: string | null } | null;
  mensagens: MensagemHistorico[];
  truncado: boolean;
}

export const adminService = {
  getAnalytics: async () => {
    try {
      const response = await api.get('/analytics');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar analytics:', error);
      throw error;
    }
  },

  getArvore: async () => {
    try {
      const response = await api.get('/nodes');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar nós do fluxo:', error);
      throw error;
    }
  },

  getArvoreCompleta: async () => {
    try {
      const response = await api.get('/nodes');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar árvore completa:', error);
      throw error;
    }
  },

  criarNo: async (dados: { titulo: string; textoMensagem: string; isStart?: boolean }) => {
    const response = await api.post('/nodes', dados);
    return response.data;
  },

  atualizarNo: async (id: string, dados: { titulo: string; textoMensagem: string }) => {
    const response = await api.put(`/nodes/${id}`, dados);
    return response.data;
  },

  deletarNo: async (id: string) => {
    const response = await api.delete(`/nodes/${id}`);
    return response.data;
  },

  criarAlternativa: async (dados: { stepId: string; text: string; nextStepId?: string }) => {
    const response = await api.post('/nodes/options', dados);
    return response.data;
  },

  atualizarAlternativa: async (id: string, dados: { text?: string; nextStepId?: string }) => {
    const response = await api.put(`/nodes/options/${id}`, dados);
    return response.data;
  },

  deletarAlternativa: async (id: string) => {
    const response = await api.delete(`/nodes/options/${id}`);
    return response.data;
  },
};

// ============================================
// SERVIÇO — AGENDA / GESTÃO DE ATENDIMENTO
// Endpoints: /appointments (back-end). Aqui ficam os conversores entre o contrato da API
// (inglês, status em maiúsculas, data em UTC) e o contrato da tela (português, horário de Brasília).
// ============================================
const TZ_OFFSET = '-03:00';
const TZ_OFFSET_MIN = -180;

interface AppointmentApi {
  id: string;
  phoneNumber: string;
  citizenName: string | null;
  subject: string | null;
  scheduledAt: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  source: string;
}

const STATUS_API_PARA_UI = {
  PENDING: 'pendente',
  COMPLETED: 'concluido',
  CANCELLED: 'cancelado',
} as const;

const STATUS_UI_PARA_API = {
  pendente: 'PENDING',
  concluido: 'COMPLETED',
  cancelado: 'CANCELLED',
} as const;

const paraAgendamento = (a: AppointmentApi): Agendamento => {
  const local = new Date(new Date(a.scheduledAt).getTime() + TZ_OFFSET_MIN * 60_000).toISOString();
  return {
    id: a.id,
    data: local.slice(0, 10),
    horario: local.slice(11, 16),
    nomeCliente: a.citizenName ?? '',
    telefone: a.phoneNumber,
    assunto: a.subject ?? '',
    status: STATUS_API_PARA_UI[a.status],
    origem: a.source === 'WHATSAPP' ? 'WHATSAPP' : 'PANEL',
  };
};

const paraScheduledAt = (data: string, horario: string) => `${data}T${horario}:00${TZ_OFFSET}`;

export const agendaService = {
  // mes no formato 'YYYY-MM'
  getAgendamentos: async (params: { mes: string }): Promise<{ data: Agendamento[] }> => {
    try {
      const ano = Number(params.mes.slice(0, 4));
      const mes = Number(params.mes.slice(5, 7));
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const response = await api.get('/appointments', {
        params: { from: `${params.mes}-01`, to: `${params.mes}-${String(ultimoDia).padStart(2, '0')}` },
      });
      const lista: AppointmentApi[] = Array.isArray(response.data?.data) ? response.data.data : [];
      return { data: lista.map(paraAgendamento) };
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
      throw error;
    }
  },

  // Horários livres de um dia (YYYY-MM-DD), conforme a grade e a capacidade definidas no back-end
  getHorariosDisponiveis: async (data: string): Promise<{ data: string[] }> => {
    try {
      const response = await api.get('/appointments/availability', { params: { date: data } });
      const slots: { time: string; available: boolean }[] = Array.isArray(response.data?.data) ? response.data.data : [];
      return { data: slots.filter((s) => s.available).map((s) => s.time) };
    } catch (error) {
      console.error('Erro ao buscar horários disponíveis:', error);
      throw error;
    }
  },

  criarAgendamento: async (dados: NovoAgendamentoDTO) => {
    const response = await api.post('/appointments', {
      phoneNumber: dados.telefone,
      scheduledAt: paraScheduledAt(dados.data, dados.horario),
      citizenName: dados.nomeCliente,
      ...(dados.assunto ? { subject: dados.assunto } : {}),
    });
    return response.data;
  },

  // Edita dados, reagenda (data + horario) ou muda o status. O back-end ignora horário inalterado.
  atualizarAgendamento: async (id: string, dados: AtualizarAgendamentoDTO) => {
    const response = await api.patch(`/appointments/${id}`, {
      ...(dados.data && dados.horario ? { scheduledAt: paraScheduledAt(dados.data, dados.horario) } : {}),
      ...(dados.nomeCliente ? { citizenName: dados.nomeCliente } : {}),
      ...(dados.assunto ? { subject: dados.assunto } : {}),
      ...(dados.status ? { status: STATUS_UI_PARA_API[dados.status] } : {}),
    });
    return response.data;
  },

  cancelarAgendamento: async (id: string) => {
    const response = await api.delete(`/appointments/${id}`);
    return response.data;
  },

  // Conversa do WhatsApp do cidadão (para o atendente consultar antes/durante o atendimento)
 getHistorico: async (id: string): Promise<HistoricoAtendimento> => {
    try {
      const response = await api.get(`/appointments/${id}/history`);
      const d = response.data?.data ?? response.data;

      const rawSession = d.sessao ?? d.session;
      const rawMessages = d.mensagens ?? d.messages ?? [];
      const rawTruncated = d.truncado ?? d.truncated ?? false;
      const rawAppointment = d.appointment ?? d.agendamento;

      return {
        agendamento: rawAppointment ? paraAgendamento(rawAppointment) : d.agendamento,
        sessao: rawSession
          ? {
              status: rawSession.status,
              nota: rawSession.nota ?? rawSession.rating ?? null,
              atualizadoEm: rawSession.atualizadoEm ?? rawSession.updatedAt ?? '',
              etapaAtual: rawSession.etapaAtual ?? rawSession.currentStep?.title ?? null,
            }
          : null,
        mensagens: rawMessages.map((m: any) => ({
          id: m.id,
          direction: m.direction,
          messageText: m.messageText,
          timestamp: m.timestamp,
          etapa: m.etapa ?? m.step?.title ?? null,
        })),
        truncado: !!rawTruncated,
      };
    } catch (error) {
      console.error('Erro ao buscar histórico do atendimento:', error);
      throw error;
    }
  },
};

export default api;
