import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000,
});

// ============================================
// TIPOS — AGENDA
// ============================================
export interface Agendamento {
  id: string;
  data: string;        // formato YYYY-MM-DD
  horario: string;      // formato HH:mm
  nomeCliente: string;
  telefone: string;
  assunto: string;
  status: 'confirmado' | 'pendente' | 'cancelado';
}

export interface NovoAgendamentoDTO {
  data: string;
  horario: string;
  nomeCliente: string;
  telefone: string;
  assunto?: string;
}

export interface AtualizarAgendamentoDTO {
  nomeCliente?: string;
  telefone?: string;
  assunto?: string;
  horario?: string;
  status?: 'confirmado' | 'pendente' | 'cancelado';
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
// SERVIÇO — AGENDA / CALENDÁRIO
// ============================================
export const agendaService = {
  // Lista agendamentos de um mês (params.mes no formato 'YYYY-MM')
  getAgendamentos: async (params?: { mes?: string }) => {
    try {
      const response = await api.get('/agenda', { params });
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
      throw error;
    }
  },

  // Retorna os horários livres para uma data específica (YYYY-MM-DD),
  // considerando as regras de disponibilidade definidas no chatbot.
  getHorariosDisponiveis: async (data: string) => {
    try {
      const response = await api.get(`/agenda/horarios/${data}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar horários disponíveis:', error);
      throw error;
    }
  },

  criarAgendamento: async (dados: NovoAgendamentoDTO) => {
    const response = await api.post('/agenda', dados);
    return response.data;
  },

  atualizarAgendamento: async (id: string, dados: AtualizarAgendamentoDTO) => {
    const response = await api.put(`/agenda/${id}`, dados);
    return response.data;
  },

  // Reagendamento: atualiza data/horário de um agendamento existente
  reagendar: async (id: string, dados: { data: string; horario: string }) => {
    const response = await api.put(`/agenda/${id}/reagendar`, dados);
    return response.data;
  },

  cancelarAgendamento: async (id: string) => {
    const response = await api.delete(`/agenda/${id}`);
    return response.data;
  },
};

export default api;
