import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000,
});

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

export default api;