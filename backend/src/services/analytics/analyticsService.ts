import { rootPrisma } from '../../database/index.js';
import { z } from 'zod';

export const analyticsQuery = z.object({ days: z.enum(['7', '30', '90']).default('30') }).strict();
export function analyticsWindow(days: number, now = new Date()) {
  if (![7, 30, 90].includes(days)) throw new Error('Período inválido.');
  const today = new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const end = new Date(new Date(`${today}T00:00:00-03:00`).getTime() + 86400_000);
  return { from: new Date(end.getTime() - days * 86400_000), to: end };
}
export const percentage = (part: number, total: number) => total ? Math.round(part * 1000 / total) / 10 : null;
type Counts = { sessions: number; started: number; turns: number; answers: number; clarifications: number; humanRequests: number; appointments: number; offers: number; scheduled: number; positive: number; negative: number; ratings: number; satisfied: number; averageRating: number | null; expired: number };

export async function getFunctionalAnalytics(days: number, now = new Date()) {
  const { from, to } = analyticsWindow(days, now);
  return rootPrisma.$transaction(async tx => {
    const [counts] = await tx.$queryRaw<Counts[]>`
      WITH events AS (SELECT * FROM "ConversationEvent" WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to})
      SELECT
      COUNT(DISTINCT "sessionId") FILTER (WHERE "source" = 'WHATSAPP')::int AS sessions,
      COUNT(*) FILTER (WHERE "kind" = 'CONVERSATION_STARTED')::int AS started,
      COUNT(*) FILTER (WHERE "kind" = 'TURN_RECEIVED')::int AS turns,
      COUNT(*) FILTER (WHERE "kind" = 'ANSWER_PREPARED')::int AS answers,
      COUNT(*) FILTER (WHERE "kind" = 'ANSWER_PREPARED' AND "answerKind" = 'clarificacao')::int AS clarifications,
      COUNT(DISTINCT "sessionId") FILTER (WHERE "kind" = 'HANDOFF_REQUESTED')::int AS "humanRequests",
      COUNT(*) FILTER (WHERE "kind" = 'APPOINTMENT_CREATED')::int AS appointments,
      COUNT(DISTINCT "sessionId") FILTER (WHERE "kind" = 'SCHEDULE_OFFERED')::int AS offers,
      COUNT(DISTINCT "sessionId") FILTER (WHERE "kind" = 'APPOINTMENT_CREATED' AND "source" = 'WHATSAPP' AND "sessionId" IN (SELECT "sessionId" FROM events WHERE "kind" = 'SCHEDULE_OFFERED'))::int AS scheduled,
      COUNT(*) FILTER (WHERE "kind" = 'USER_CONFIRMED_RESOLUTION')::int AS positive,
      COUNT(*) FILTER (WHERE "kind" = 'USER_REJECTED_RESOLUTION')::int AS negative,
      COUNT(*) FILTER (WHERE "kind" = 'RATING_SUBMITTED')::int AS ratings,
      COUNT(*) FILTER (WHERE "kind" = 'RATING_SUBMITTED' AND "rating" = 5)::int AS satisfied,
      AVG("rating") FILTER (WHERE "kind" = 'RATING_SUBMITTED')::double precision AS "averageRating",
      COUNT(*) FILTER (WHERE "kind" = 'CONVERSATION_ABANDONED')::int AS expired FROM events`;
    const daily = await tx.$queryRaw<{ date: string; sessions: number; answers: number; appointments: number; expired: number }[]>`
      SELECT to_char("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS date,
      COUNT(DISTINCT "sessionId") FILTER (WHERE "source" = 'WHATSAPP')::int AS sessions,
      COUNT(*) FILTER (WHERE "kind" = 'ANSWER_PREPARED')::int AS answers,
      COUNT(*) FILTER (WHERE "kind" = 'APPOINTMENT_CREATED')::int AS appointments,
      COUNT(*) FILTER (WHERE "kind" = 'CONVERSATION_ABANDONED')::int AS expired
      FROM "ConversationEvent" WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to} GROUP BY 1 ORDER BY 1`;
    const menus = await tx.$queryRaw<{ kind: string; label: string; count: number }[]>`
      WITH ranked AS (SELECT e."kind", COALESCE(s."title", 'Item removido do menu') AS label, COUNT(*)::int AS count,
      ROW_NUMBER() OVER (PARTITION BY e."kind" ORDER BY COUNT(*) DESC, COALESCE(s."title", 'Item removido do menu'), e."stepId") AS rank
      FROM "ConversationEvent" e LEFT JOIN "Step" s ON s."id" = e."stepId"
      WHERE e."occurredAt" >= ${from} AND e."occurredAt" < ${to} AND e."kind" IN ('CATEGORY_SELECTED','QUESTION_SELECTED') AND e."stepId" IS NOT NULL
      GROUP BY e."kind", e."stepId", s."title") SELECT kind, label, count FROM ranked WHERE rank <= 10 ORDER BY kind, count DESC, label`;
    const expiredByStage = await tx.conversationEvent.groupBy({ by: ['stage'], where: { occurredAt: { gte: from, lt: to }, kind: 'CONVERSATION_ABANDONED' }, _count: { _all: true }, orderBy: { _count: { id: 'desc' } } });
    const coverage = await tx.conversationEvent.aggregate({ _min: { occurredAt: true } });
    const distribution = await tx.conversationEvent.groupBy({ by: ['answerKind'], where: { occurredAt: { gte: from, lt: to }, kind: 'ANSWER_PREPARED' }, _count: { _all: true } });
    const metrics = counts!;
    const calendar = Array.from({ length: days }, (_, offset) => {
      const date = new Date(from.getTime() + offset * 86400_000 - 3 * 3600_000).toISOString().slice(0, 10);
      return daily.find(row => row.date === date) ?? { date, sessions: 0, answers: 0, appointments: 0, expired: 0 };
    });
    return { period: { days, from: from.toISOString(), to: to.toISOString(), timeZone: 'America/Sao_Paulo' }, trackingSince: coverage._min.occurredAt,
      metrics: { ...metrics, schedulingRate: percentage(metrics.scheduled, metrics.offers), resolutionRate: percentage(metrics.positive, metrics.positive + metrics.negative), csat: percentage(metrics.satisfied, metrics.ratings) },
      daily: calendar, topMenus: menus.filter(row => row.kind === 'CATEGORY_SELECTED').slice(0, 10), topQuestions: menus.filter(row => row.kind === 'QUESTION_SELECTED').slice(0, 10),
      expiredByStage: expiredByStage.map(row => ({ stage: row.stage, count: row._count._all })),
      answerTypes: distribution.map(row => ({ kind: row.answerKind, count: row._count._all })),
    };
  }, { isolationLevel: 'RepeatableRead' });
}
