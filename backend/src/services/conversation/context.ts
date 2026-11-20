import type { Institution } from '../institution/settings.js';
import type { UserSession, Prisma } from '@prisma/client';
import type { ConversationDependencies } from '../../controllers/webhook/conversation.js';
import type { MenuOption } from '../whatsapp/messagePolicy.js';
import type { ConversationState, FlowSnapshot } from './state.js';
import type { EventInput } from '../analytics/events.js';
export type SessionChanges = Partial<Pick<UserSession, 'userName' | 'userCpf' | 'currentStepId' | 'isChat'>>;
export interface ConversationContext {
  snapshot(): FlowSnapshot;
  session(): UserSession;
  phone: string;
  institution: Institution;
  d: ConversationDependencies;
  update(state: ConversationState, changes?: SessionChanges, keepChoices?: boolean): Promise<void>;
  atomicUpdate(state: ConversationState, work: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void>;
  choices(options: MenuOption[]): Promise<void>;
  say(text: string, options?: MenuOption[]): Promise<void>;
  showMenu(newContext?: boolean): Promise<void>;
  pendingNotice(): Promise<boolean>;
  refresh(): Promise<void>;
  event(input: Omit<EventInput, 'sessionId'>): Promise<void>;
}
