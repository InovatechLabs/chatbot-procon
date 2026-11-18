import api from './api';
export interface RetentionValue { sessionsDays: number | null; appointmentsDays: number | null; receiptsDays: number | null; outgoingDays: number | null; approved: boolean }
export interface RetentionSettings extends RetentionValue { version: number; updatedAt: string; lastRunAt: string | null; lastRunVersion: number | null; lastRunCounts: { sessions: number; appointments: number; receipts: number; outgoing: number } | null }
export const retentionApi = {
  get: async (): Promise<RetentionSettings> => (await api.get('/retention')).data,
  save: async (version: number, value: RetentionValue): Promise<RetentionSettings> => (await api.put('/retention', { version, value })).data,
};
