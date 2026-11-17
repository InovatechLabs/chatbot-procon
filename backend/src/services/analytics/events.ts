import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { categorySchema, stateSchema } from '../conversation/state.js';

export const eventKinds = ['CONVERSATION_STARTED', 'TURN_RECEIVED', 'CATEGORY_SELECTED', 'QUESTION_SELECTED', 'ANSWER_PREPARED', 'USER_CONFIRMED_RESOLUTION', 'USER_REJECTED_RESOLUTION', 'SCHEDULE_OFFERED', 'APPOINTMENT_CREATED', 'CONVERSATION_ABANDONED', 'CONVERSATION_ENDED', 'HANDOFF_REQUESTED', 'RATING_SUBMITTED'] as const;
const identifier = z.string().min(1).max(256).nullable().default(null);
const stages = stateSchema.options.map(option => option.shape.kind.value);
export const eventSchema = z.object({
  kind: z.enum(eventKinds), sessionId: identifier, stepId: identifier, optionId: identifier,
  categoryKey: categorySchema.nullable().default(null),
  stage: z.enum(stages).nullable().default(null),
  answerKind: z.enum(['MENU', 'clarificacao', 'orientacao_final', 'redirecionamento', 'fixa']).nullable().default(null),
  rating: z.union([z.literal(1), z.literal(3), z.literal(5)]).nullable().default(null),
  source: z.enum(['WHATSAPP', 'PANEL']).default('WHATSAPP'),
}).strict();
export type EventInput = z.input<typeof eventSchema>;
// Não aceita texto livre, telefone, CPF ou JSON arbitrário de metadados.
export async function recordEvent(db: Pick<Prisma.TransactionClient, 'conversationEvent'>, input: EventInput, onceKey?: string) {
  const data = eventSchema.parse(input);
  await db.conversationEvent.createMany({ data: [{ ...data, dedupKey: onceKey ?? randomUUID(), occurredAt: new Date() }], skipDuplicates: true });
}
