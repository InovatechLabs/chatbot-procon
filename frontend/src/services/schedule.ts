import api from './api';
export interface ScheduleSettings { capacity: number; startMinute: number; endMinute: number; slotMinutes: number; minLeadMinutes: number; workDays: number[] }
export interface CapacityRule { id: string; date: string; minute: number; capacity: number }
export interface BlockRule { id: string; startDate: string | null; endDate: string | null; weekDays: number[]; startMinute: number | null; endMinute: number | null; note: string | null }
export interface ScheduleView { settings: ScheduleSettings & { version: number }; capacities: CapacityRule[]; blocks: BlockRule[]; conflicts: { id: string; scheduledAt: string; reasons: string[] }[] }
export interface ScheduleSlot { time: string; scheduledAt: string; capacity: number; taken: number; remaining: number; blocked: boolean; available: boolean }
export const scheduleApi = {
  get: async (): Promise<ScheduleView> => (await api.get('/schedule')).data,
  preview: async (date: string): Promise<ScheduleSlot[]> => (await api.get('/schedule/preview', { params: { date } })).data.slots,
  settings: async (version: number, value: ScheduleSettings): Promise<ScheduleView> => (await api.put('/schedule/settings', { version, value })).data,
  capacity: async (version: number, value: Omit<CapacityRule, 'id'>, id?: string): Promise<ScheduleView> => (await api.request({ method: id ? 'PUT' : 'POST', url: `/schedule/capacities${id ? `/${id}` : ''}`, data: { version, value } })).data,
  block: async (version: number, value: Omit<BlockRule, 'id'>, id?: string): Promise<ScheduleView> => (await api.request({ method: id ? 'PUT' : 'POST', url: `/schedule/blocks${id ? `/${id}` : ''}`, data: { version, value } })).data,
  remove: async (kind: 'capacities' | 'blocks', id: string, version: number): Promise<ScheduleView> => (await api.delete(`/schedule/${kind}/${id}`, { data: { version } })).data,
};
