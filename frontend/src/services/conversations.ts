import api from './api';

export type ConversationStatus = 'WAITING' | 'ACTIVE' | 'CLOSED' | 'BOT' | 'BOT_LIVE';
export type ConversationView = 'waiting' | 'active' | 'history' | 'bot';
export type Ticket = { id: string; status: ConversationStatus; version: number; assigneeId: string | null; requestedAt: string };
export type Message = { id: string; at: string; text: string; author: 'CITIZEN' | 'BOT' | 'ATTENDANT'; authorName: string | null; hasAudio?: boolean;
  delivery: { state: string; deliveryStatus: string | null; lastError: string | null } | null };
export type History = { ticket: Omit<Ticket, 'requestedAt'>; windowUntil: string | null; replyLimit?: number; items: Message[]; nextCursor: string | null };
export type QueuePage = { items: Ticket[]; nextCursor: string | null };

export const conversationsApi = {
  list: async (view: ConversationView, cursor?: string, signal?: AbortSignal): Promise<QueuePage> => (await api.get(view === 'bot' ? '/conversations/bot' : '/conversations', { params: { view, cursor }, signal })).data,
  history: async (id: string, bot: boolean, cursor?: string, signal?: AbortSignal): Promise<History> => (await api.get(`/conversations/${bot ? 'bot/' : ''}${id}/messages`, { params: { cursor }, signal })).data,
  change: async (id: string, action: 'claim' | 'close' | 'return', version: number): Promise<Ticket & { noticeQueued: boolean }> => (await api.post(`/conversations/${id}/${action}`, { version })).data,
  send: async (id: string, body: { version: number; requestId: string; text: string }): Promise<Message> => (await api.post(`/conversations/${id}/messages`, body)).data,
  audio: async (id: string, messageId: string, signal: AbortSignal): Promise<Blob> => (await api.get(`/conversations/${id}/messages/${messageId}/audio`, { responseType: 'blob', timeout: 35000, signal })).data,
};
