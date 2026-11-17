import { z } from 'zod';

export const CATEGORY_KEYS = ['CARTAO_SEGURO', 'EMPRESTIMO_FOLHA', 'INSS_RMC_RCC', 'CONTRATO_CANCELAMENTO', 'GARANTIA_VICIO', 'GERAL'] as const;
export const categorySchema = z.enum(CATEGORY_KEYS);
export type ScheduleCategory = z.infer<typeof categorySchema>;
const category = { category: categorySchema };
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
export const stateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('READY') }).strict(),
  z.object({ kind: z.literal('MENU') }).strict(),
  z.object({ kind: z.literal('FREE_CHAT'), clarifications: z.number().int().min(0).max(2) }).strict(),
  z.object({ kind: z.literal('POST_ANSWER') }).strict(),
  z.object({ kind: z.literal('SCHEDULE_OFFER') }).strict(),
  z.object({ kind: z.literal('SCHEDULE_CATEGORY') }).strict(),
  z.object({ kind: z.literal('SCHEDULE_NAME'), ...category }).strict(),
  z.object({ kind: z.literal('SCHEDULE_NAME_CONFIRM'), ...category }).strict(),
  z.object({ kind: z.literal('SCHEDULE_CPF'), ...category }).strict(),
  z.object({ kind: z.literal('SCHEDULE_DATE'), ...category }).strict(),
  z.object({ kind: z.literal('SCHEDULE_SLOT'), ...category, date, page: z.number().int().min(0).max(1000) }).strict(),
  z.object({ kind: z.literal('DOCUMENT_CATEGORY') }).strict(),
  z.object({ kind: z.literal('RATING') }).strict(),
  z.object({ kind: z.literal('FEEDBACK_COMMENT') }).strict(),
  z.object({ kind: z.literal('FINISHED') }).strict(),
]);
export type ConversationState = z.infer<typeof stateSchema>;
export type StateKind = ConversationState['kind'];
const snapshotSchema = z.object({
  version: z.literal(1), state: stateSchema,
  context: z.object({ currentStepId: z.string().min(1).nullable(), isChat: z.boolean() }).strict(),
  choices: z.array(z.object({ id: z.string().min(1).max(256), text: z.string().min(1).max(200) }).strict()).max(100),
}).strict().superRefine((snapshot, ctx) => {
  if ((isScheduling(snapshot.state) || snapshot.state.kind === 'FINISHED') && (snapshot.context.isChat || snapshot.context.currentStepId !== null)) ctx.addIssue({ code: 'custom', message: 'Contexto incompatível com a etapa.' });
  if (snapshot.state.kind === 'FREE_CHAT' && (!snapshot.context.isChat || snapshot.context.currentStepId !== null)) ctx.addIssue({ code: 'custom', message: 'Contexto de conversa livre inválido.' });
  if (snapshot.state.kind === 'MENU' && snapshot.context.isChat) ctx.addIssue({ code: 'custom', message: 'Contexto de menu inválido.' });
});
export type FlowSnapshot = z.infer<typeof snapshotSchema>;
export type SessionFields = { stepState?: string | null; currentStepId?: string | null; isChat?: boolean; status?: string };
export const isScheduling = (state: ConversationState) => ['SCHEDULE_CATEGORY', 'SCHEDULE_NAME', 'SCHEDULE_NAME_CONFIRM', 'SCHEDULE_CPF', 'SCHEDULE_DATE', 'SCHEDULE_SLOT'].includes(state.kind);
export const canGroupText = (state: ConversationState) => !isScheduling(state) && !['RATING', 'FEEDBACK_COMMENT', 'FINISHED'].includes(state.kind);
export const clarificationRounds = (state: ConversationState) => state.kind === 'FREE_CHAT' ? state.clarifications : 0;

export function initialSnapshot(context: FlowSnapshot['context'] = { currentStepId: null, isChat: false }): FlowSnapshot {
  if (context.currentStepId) return { version: 1, state: { kind: 'MENU' }, context: { ...context, isChat: false }, choices: [] };
  return { version: 1, state: context.isChat ? { kind: 'FREE_CHAT', clarifications: 0 } : { kind: 'READY' }, context, choices: [] };
}
export function decodeSession(session: SessionFields): { snapshot: FlowSnapshot; legacy: boolean; invalid: boolean } {
  const context = { currentStepId: session.currentStepId ?? null, isChat: session.isChat ?? false };
  const base = initialSnapshot(context);
  const raw = session.stepState;
  const invalid = () => ({ snapshot: initialSnapshot(), legacy: false, invalid: true });
  if (raw?.trim().startsWith('{')) {
    try {
      const parsed = snapshotSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return invalid();
      return { snapshot: parsed.data, legacy: false, invalid: false };
    } catch { return invalid(); }
  }
  if (session.status && session.status !== 'OPEN') base.state = { kind: 'FINISHED' };
  else if (raw) {
    const simple: Record<string, StateKind> = { POST_ANSWER: 'POST_ANSWER', AWAIT_AGENDAR: 'SCHEDULE_OFFER', SCH_STEP_CAT_SELECT: 'SCHEDULE_CATEGORY', DOC_SELECT: 'DOCUMENT_CATEGORY', AWAIT_RATING: 'RATING', FEEDBACK_COMMENT: 'FEEDBACK_COMMENT' };
    if (simple[raw]) {
      const parsed = stateSchema.safeParse({ kind: simple[raw] });
      if (!parsed.success) return invalid();
      base.state = parsed.data;
    }
    else if (/^AI_CLARIFY:[12]$/.test(raw)) base.state = { kind: 'FREE_CHAT', clarifications: Number(raw.slice(-1)) };
    else {
      const parts = raw.split(':');
      const kinds: Record<string, string> = { SCH_STEP_NAME: 'SCHEDULE_NAME', SCH_STEP_NAME_CONFIRM: 'SCHEDULE_NAME_CONFIRM', SCH_STEP_CPF: 'SCHEDULE_CPF', SCH_STEP_DATE: 'SCHEDULE_DATE', SCH_STEP_SLOT: 'SCHEDULE_SLOT' };
      const kind = kinds[parts[0]!];
      const parsed = stateSchema.safeParse({ kind, category: parts[1], ...(kind === 'SCHEDULE_SLOT' ? { date: parts[2], page: parts[3] === undefined ? 0 : Number(parts[3]) } : {}) });
      if (!parsed.success || parts.length !== (kind === 'SCHEDULE_SLOT' ? (parts[3] === undefined ? 3 : 4) : 2)) return invalid();
      base.state = parsed.data;
    }
  }
  if (isScheduling(base.state) || base.state.kind === 'FINISHED') base.context = { currentStepId: null, isChat: false };
  if (base.state.kind === 'FREE_CHAT') base.context = { currentStepId: null, isChat: true };
  return { snapshot: base, legacy: true, invalid: false };
}

const normal: StateKind[] = ['READY', 'MENU', 'FREE_CHAT', 'POST_ANSWER', 'SCHEDULE_OFFER', 'DOCUMENT_CATEGORY', 'RATING', 'FEEDBACK_COMMENT'];
export const transitions: Record<StateKind, readonly StateKind[]> = {
  READY: normal, MENU: normal, FREE_CHAT: normal, POST_ANSWER: normal,
  SCHEDULE_OFFER: normal,
  DOCUMENT_CATEGORY: normal, RATING: normal, FEEDBACK_COMMENT: normal,
  SCHEDULE_CATEGORY: ['SCHEDULE_NAME'],
  SCHEDULE_NAME: ['SCHEDULE_NAME_CONFIRM'],
  SCHEDULE_NAME_CONFIRM: ['SCHEDULE_NAME', 'SCHEDULE_CPF'],
  SCHEDULE_CPF: ['SCHEDULE_DATE'],
  SCHEDULE_DATE: ['SCHEDULE_SLOT'],
  SCHEDULE_SLOT: ['SCHEDULE_DATE', 'SCHEDULE_SLOT'],
  FINISHED: [],
};
/** Interrupções globais explícitas; a origem dos botões ainda é validada pelos handlers. */
const globalTargets: StateKind[] = ['MENU', 'READY', 'FINISHED', 'SCHEDULE_CATEGORY', 'SCHEDULE_OFFER', 'RATING'];
export function transition(current: FlowSnapshot, next: ConversationState, context: FlowSnapshot['context'] = current.context): FlowSnapshot {
  stateSchema.parse(next);
  if (current.state.kind === 'FINISHED' || (!globalTargets.includes(next.kind) && next.kind !== current.state.kind && !transitions[current.state.kind].includes(next.kind))) throw new Error('Transição de conversa não permitida.');
  if ('category' in current.state && 'category' in next && current.state.category !== next.category) throw new Error('Mudança de categoria requer reiniciar o agendamento.');
  if (current.state.kind === 'SCHEDULE_SLOT' && next.kind === 'SCHEDULE_SLOT' && current.state.date !== next.date) throw new Error('Mudança de data requer voltar à escolha do dia.');
  if (isScheduling(next)) context = { currentStepId: null, isChat: false };
  if (next.kind === 'FREE_CHAT') context = { currentStepId: null, isChat: true };
  if (next.kind === 'MENU') context = { ...context, isChat: false };
  if (next.kind === 'FINISHED') context = { currentStepId: null, isChat: false };
  return snapshotSchema.parse({ version: 1, state: next, context, choices: [] });
}
export function persistable(snapshot: FlowSnapshot) {
  const valid = snapshotSchema.parse(snapshot);
  return { stepState: JSON.stringify(valid), ...valid.context, status: valid.state.kind === 'FINISHED' ? 'RESOLVED' : 'OPEN' };
}
export function withChoices(snapshot: FlowSnapshot, choices: FlowSnapshot['choices']): FlowSnapshot {
  return snapshotSchema.parse({ ...snapshot, choices: choices.map(({ id, text }) => ({ id, text })) });
}
