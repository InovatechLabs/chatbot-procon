import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000',
});

export const adminService = {
  getAnalytics: () => api.get('/admin/analytics'),
  getArvoreCompleta: () => api.get('/admin/fluxo/arvore'),
  
  criarNo: (data: { titulo: string; textoMensagem: string; tipo?: string; noPaiId?: string }) => 
    api.post('/admin/fluxo/no', data),
    
  atualizarNo: (id: string, data: { titulo?: string; textoMensagem?: string; tipo?: string }) => 
    api.put(`/admin/fluxo/no/${id}`, data),
    
  deletarNo: (id: string) => 
    api.delete(`/admin/fluxo/no/${id}`),

  criarAlternativa: (data: { text: string; stepId: string; nextStepId: string }) => 
    api.post('/admin/fluxo/alternativa', data),
    
  atualizarAlternativa: (id: string, data: { text?: string; nextStepId?: string }) => 
    api.put(`/admin/fluxo/alternativa/${id}`, data),
    
  deletarAlternativa: (id: string) => 
    api.delete(`/admin/fluxo/alternativa/${id}`),
};