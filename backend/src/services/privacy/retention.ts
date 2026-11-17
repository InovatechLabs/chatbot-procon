import type { PrismaClient } from '@prisma/client';
export interface RetentionPolicy { sessionsDays?: number; appointmentsDays?: number }
function cutoff(days: number | undefined, now: Date) {
  if (days === undefined) return undefined;
  if (!Number.isInteger(days) || days < 1 || days > 36500) throw new Error('Retenção deve ser um número inteiro de dias entre 1 e 36500.');
  return new Date(now.getTime() - days * 86400_000);
}
export async function retentionPlan(db: PrismaClient, policy: RetentionPolicy, apply = false, now = new Date()) {
  const sessionsBefore = cutoff(policy.sessionsDays, now);
  const appointmentsBefore = cutoff(policy.appointmentsDays, now);
  const appointments = appointmentsBefore ? { scheduledAt: { lt: appointmentsBefore }, status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as any } } : null;
  // Não apagar conversas com agendamento ainda preservado ou sessão recente.
  const sessions = sessionsBefore ? { updatedAt: { lt: sessionsBefore }, appointments: { none: {} } } : null;
  return db.$transaction(async tx => {
    const appointmentsCount = appointments ? await tx.appointment.count({ where: appointments }) : 0;
    if (apply && appointments) await tx.appointment.deleteMany({ where: appointments });
    const sessionsCount = sessions ? await tx.userSession.count({ where: sessions }) : 0;
    if (apply && sessions) await tx.userSession.deleteMany({ where: sessions });
    return { applied: apply, appointments: appointmentsCount, sessions: sessionsCount, note: 'Sessões removidas incluem suas mensagens e avaliações; agendamentos pendentes são preservados. Na simulação, sessões com agendamento elegível ainda não removido não entram na contagem.' };
  });
}
