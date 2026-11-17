import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/index.js';
import { AuthError } from '../auth/authService.js';
import { availabilityForDate, blockingRules, civilTime, loadPolicy, localParts, overlap, scheduleTransaction, slotsForDate } from './schedulePolicy.js';
import type { SchedulePolicy } from './schedulePolicy.js';
import type { z } from 'zod';
import type { settingsSchema, capacitySchema, blockSchema } from './scheduleSchemas.js';

export async function scheduleConflicts(tx: Prisma.TransactionClient, policy: SchedulePolicy) {
  const rows = await tx.appointment.findMany({ where: { scheduledAt: { gte: civilTime(localParts(new Date()).date, 0) }, status: { not: 'CANCELLED' } }, select: { id: true, scheduledAt: true, durationMin: true, attendantId: true, status: true }, orderBy: { scheduledAt: 'asc' } });
  const byDate = new Map<string, ReturnType<typeof availabilityForDate>>();
  const conflicts: { id: string; scheduledAt: Date; reasons: string[] }[] = [];
  for (const row of rows.filter(row => row.status === 'PENDING')) {
    const { date } = localParts(row.scheduledAt);
    const end = new Date(row.scheduledAt.getTime() + row.durationMin * 60_000);
    const reasons: string[] = [];
    if (!slotsForDate(date, policy.settings).some(slot => slot.at.getTime() === row.scheduledAt.getTime()) || end > civilTime(date, policy.settings.endMinute)) reasons.push('Fora do expediente ou da grade atual');
    if (blockingRules(date, row.scheduledAt, end, policy).length) reasons.push('Bloqueio vigente');
    let availability = byDate.get(date);
    if (!availability) { availability = availabilityForDate(date, policy, rows); byDate.set(date, availability); }
    if (availability.some(slot => slot.taken > slot.capacity && overlap(row.scheduledAt.getTime(), end.getTime(), new Date(slot.scheduledAt).getTime(), new Date(slot.scheduledAt).getTime() + policy.settings.slotMinutes * 60_000))) reasons.push('Ocupação maior que a capacidade atual');
    if (reasons.length) conflicts.push({ id: row.id, scheduledAt: row.scheduledAt, reasons });
  }
  return conflicts;
}
async function view(tx: Prisma.TransactionClient) {
  const policy = await loadPolicy(tx);
  return { ...policy, conflicts: await scheduleConflicts(tx, policy) };
}
export async function getScheduleAdmin() { return prisma.$transaction(view, { isolationLevel: 'RepeatableRead' }); }
export async function previewSchedule(date: string) {
  return prisma.$transaction(async tx => {
    const { busyBetween } = await import('./schedulePolicy.js');
    const policy = await loadPolicy(tx);
    return availabilityForDate(date, policy, await busyBetween(tx, civilTime(date, 0), civilTime(date, 1440)));
  }, { isolationLevel: 'RepeatableRead' });
}
type SettingsInput = z.infer<typeof settingsSchema>;
type CapacityInput = z.infer<typeof capacitySchema>;
type BlockInput = z.infer<typeof blockSchema>;
type Mutation = { kind: 'settings'; value: SettingsInput }
  | { kind: 'capacity'; value: CapacityInput; id?: string | undefined }
  | { kind: 'block'; value: BlockInput; id?: string | undefined }
  | { kind: 'deleteCapacity' | 'deleteBlock'; id: string };
export async function mutateSchedule(actorId: string, version: number, mutation: Mutation) {
  return scheduleTransaction(prisma, async tx => {
    const actor = await tx.panelUser.findUnique({ where: { id: actorId } });
    if (!actor?.active || actor.role !== 'ADMIN' || actor.mustChangePassword) throw new AuthError(403, 'Acesso restrito ao administrador.');
    const current = await tx.scheduleSettings.findUniqueOrThrow({ where: { id: 'main' } });
    if (current.version !== version) throw new AuthError(409, 'A agenda foi alterada por outra operação. Recarregue antes de salvar.');
    try {
      switch (mutation.kind) {
        case 'settings': await tx.scheduleSettings.update({ where: { id: 'main' }, data: mutation.value }); break;
        case 'capacity':
          if (mutation.id) await tx.scheduleCapacity.update({ where: { id: mutation.id }, data: mutation.value });
          else await tx.scheduleCapacity.upsert({ where: { date_minute: { date: mutation.value.date, minute: mutation.value.minute } }, create: mutation.value, update: mutation.value });
          break;
        case 'block':
          if (mutation.id) await tx.scheduleBlock.update({ where: { id: mutation.id }, data: mutation.value });
          else await tx.scheduleBlock.create({ data: mutation.value });
          break;
        case 'deleteCapacity': await tx.scheduleCapacity.delete({ where: { id: mutation.id } }); break;
        case 'deleteBlock': await tx.scheduleBlock.delete({ where: { id: mutation.id } }); break;
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'P2025') throw new AuthError(404, 'Regra não encontrada. Recarregue a agenda.');
        if (error.code === 'P2002') throw new AuthError(409, 'Já existe uma exceção para esse dia e horário.');
      }
      throw error;
    }
    await tx.scheduleSettings.update({ where: { id: 'main' }, data: { version: { increment: 1 } } });
    return view(tx);
  });
}
