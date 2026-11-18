import type { PrismaClient, RetentionSettings } from '@prisma/client';
import { z } from 'zod';
import { AuthError } from '../auth/authService.js';
import { retentionInTransaction, type RetentionPolicy } from './retention.js';

const days = z.number().int().min(1).max(36500).nullable();
export const retentionSettingsSchema = z.object({
  sessionsDays: days, appointmentsDays: days, receiptsDays: days, outgoingDays: days,
  approved: z.boolean(),
}).strict().refine(value => !value.approved || [value.sessionsDays, value.appointmentsDays, value.receiptsDays, value.outgoingDays].some(day => day !== null), { message: 'Defina ao menos um prazo antes de autorizar a limpeza.' });
export const retentionMutationSchema = z.object({ version: z.number().int().min(1), value: retentionSettingsSchema }).strict();
export function parseRetention<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AuthError(400, result.error.issues.map(issue => issue.message).join(' '));
  return result.data;
}
function policy(settings: RetentionSettings): RetentionPolicy {
  return Object.fromEntries(['sessionsDays', 'appointmentsDays', 'receiptsDays', 'outgoingDays'].flatMap(key => {
    const value = settings[key as keyof RetentionPolicy];
    return value === null ? [] : [[key, value]];
  }));
}
export function createRetentionSettingsService(db: PrismaClient) {
  const get = () => db.retentionSettings.findUniqueOrThrow({ where: { id: 'main' } });
  const save = async (actorId: string, raw: unknown) => {
    const input = parseRetention(retentionMutationSchema, raw);
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(19781119, 1)::text`;
      const actor = await tx.panelUser.findUnique({ where: { id: actorId } });
      if (!actor?.active || actor.role !== 'ADMIN' || actor.mustChangePassword) throw new AuthError(403, 'Acesso restrito ao administrador.');
      const changed = await tx.retentionSettings.updateMany({ where: { id: 'main', version: input.version }, data: { ...input.value, version: { increment: 1 }, updatedBy: actorId } });
      if (!changed.count) throw new AuthError(409, 'A política foi alterada. Recarregue antes de salvar.');
      return tx.retentionSettings.findUniqueOrThrow({ where: { id: 'main' } });
    });
  };
  // Mesmo lock em edição e execução: uma política revogada não pode ser aplicada
  // depois de a revogação ter sido confirmada. Sem nested transaction.
  const execute = (automatic: boolean, now: Date) => db.$transaction(async tx => {
    if (automatic) {
      const locks = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(19781119, 1) AS locked`;
      if (!locks[0]?.locked) return null;
    } else await tx.$queryRaw`SELECT pg_advisory_xact_lock(19781119, 1)::text`;
    // Em SERIALIZABLE, esperar pelo advisory lock pode conservar um snapshot
    // anterior a uma revogação. FOR UPDATE força abortar se a política mudou.
    await tx.$queryRaw`SELECT "id" FROM "RetentionSettings" WHERE "id" = 'main' FOR UPDATE`;
    const settings = await tx.retentionSettings.findUniqueOrThrow({ where: { id: 'main' } });
    if (!settings.approved) {
      if (automatic) return null;
      throw new AuthError(403, 'A política de retenção está desativada no painel.');
    }
    // A cadência é durável: reinícios e múltiplas instâncias não a reiniciam.
    // Uma edição/ativação permite executar já na próxima verificação.
    if (automatic && settings.lastRunVersion === settings.version && settings.lastRunAt && now.getTime() - settings.lastRunAt.getTime() < 3600_000) return null;
    const result = await retentionInTransaction(tx, policy(settings), true, now);
    const counts = { sessions: result.sessions, appointments: result.appointments, receipts: result.receipts, outgoing: result.outgoing };
    await tx.retentionSettings.update({ where: { id: 'main' }, data: { lastRunAt: now, lastRunVersion: settings.version, lastRunCounts: counts, updatedAt: settings.updatedAt } });
    return { version: settings.version, evaluatedAt: now.toISOString(), ...result, note: 'Exclusão real concluída. Pendências, estados de revisão e vínculos protegidos foram preservados.' };
  }, { isolationLevel: 'Serializable', timeout: 15_000 });
  return { get, save, run: () => execute(false, new Date()), runDue: (now = new Date()) => execute(true, now) };
}
