import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { defaultInstitution } from '../institution/settings.js';

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const period = z.object({
  weekday: z.number().int().min(1).max(7),
  start: time,
  end: z.union([time, z.literal('24:00')]),
}).strict().refine(value => value.start < value.end, { message: 'O fim deve ser posterior ao início.' });
const periods = z.array(period).min(1).max(28).superRefine((values, ctx) => {
  const sorted = [...values].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  if (sorted.some((item, i) => {
    const next = sorted[i + 1];
    return next?.weekday === item.weekday && next.start < item.end;
  })) ctx.addIssue({ code: 'custom', message: 'Há intervalos sobrepostos no mesmo dia.' });
}).nullable();
const message = z.string().trim().min(1).max(600);
export const handoffMutation = z.object({
  version: z.number().int().min(0).max(2_147_483_646),
  value: z.object({ enabled: z.boolean(), periods, queueMessage: message, closedMessage: message }).strict(),
}).strict();
export type HandoffSettings = z.infer<typeof handoffMutation>['value'];

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function isHandoffOpen(settings: HandoffSettings, now = new Date()): boolean {
  if (!settings.enabled) return false;
  if (settings.periods === null) return true;
  const parts = clock.formatToParts(now);
  const weekday = weekdays.indexOf(parts.find(part => part.type === 'weekday')!.value) + 1;
  const localTime = `${parts.find(part => part.type === 'hour')!.value}:${parts.find(part => part.type === 'minute')!.value}`;
  return settings.periods.some(period => period.weekday === weekday && period.start <= localTime && localTime < period.end);
}

export async function readHandoffSettings(db: Pick<PrismaClient, 'handoffSettings'>, initialQueue = defaultInstitution().queueMessage) {
  const row = await db.handoffSettings?.findUnique({ where: { id: 'main' } });
  if (row) {
    // Array vazio representa expediente irrestrito no armazenamento.
    const stored = Array.isArray(row.periods) && row.periods.length === 0 ? null : row.periods;
    return { ...row, periods: periods.parse(stored) };
  }
  return {
    enabled: process.env.HUMAN_HANDOFF_ENABLED === 'true',
    periods: null,
    queueMessage: initialQueue,
    closedMessage: 'A equipe está fora do expediente de atendimento por chat. Você pode voltar ao menu ou agendar um atendimento presencial.',
    version: 0,
    updatedAt: null,
  };
}
