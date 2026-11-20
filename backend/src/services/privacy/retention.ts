import { Prisma, type PrismaClient } from '@prisma/client';
export interface RetentionPolicy { sessionsDays?: number; appointmentsDays?: number; receiptsDays?: number; outgoingDays?: number }
function cutoff(days: number | undefined, now: Date) {
  if (days === undefined) return undefined;
  if (!Number.isInteger(days) || days < 1 || days > 36500) throw new Error('Retenção deve ser um número inteiro de dias entre 1 e 36500.');
  return new Date(now.getTime() - days * 86400_000);
}
export async function retentionPlan(db: PrismaClient, policy: RetentionPolicy, apply = false, now = new Date()) {
  return db.$transaction(tx => retentionInTransaction(tx, policy, apply, now), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
}
export async function retentionInTransaction(tx: Prisma.TransactionClient, policy: RetentionPolicy, apply: boolean, now: Date) {
  const sessionsBefore = cutoff(policy.sessionsDays, now);
  const appointmentsBefore = cutoff(policy.appointmentsDays, now);
  const receiptsBefore = cutoff(policy.receiptsDays, now);
  const outgoingBefore = cutoff(policy.outgoingDays, now);
  const appointments: Prisma.AppointmentWhereInput | null = appointmentsBefore ? { scheduledAt: { lt: appointmentsBefore }, status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } } : null;
  const outgoing: Prisma.OutgoingMessageWhereInput | null = outgoingBefore ? { state: 'SENT', sentAt: { lt: outgoingBefore }, leaseToken: null, leaseUntil: null } : null;
  // Preservar o vínculo de qualquer saída ainda retida, mesmo que já enviada.
  const receipts: Prisma.MessageReceiptWhereInput | null = receiptsBefore ? { state: { in: ['DONE', 'SKIPPED'] }, processedAt: { lt: receiptsBefore }, leaseToken: null, leaseUntil: null, outgoing: { none: {} } } : null;
    const appointmentsCount = appointments ? (apply ? (await tx.appointment.deleteMany({ where: appointments })).count : await tx.appointment.count({ where: appointments })) : 0;
    const outgoingCount = outgoing ? (apply ? (await tx.outgoingMessage.deleteMany({ where: outgoing })).count : await tx.outgoingMessage.count({ where: outgoing })) : 0;
    const receiptsCount = receipts ? (apply ? (await tx.messageReceipt.deleteMany({ where: receipts })).count : await tx.messageReceipt.count({ where: receipts })) : 0;
    let sessionsCount = 0;
    if (sessionsBefore) {
      // SQL usa somente índices HMAC, sem descriptografar nem registrar telefones.
      // Sem índice, não é possível confirmar ausência de trabalho: preservar.
      const candidates = await tx.$queryRaw<{ id: string; phoneLookup: string }[]>`
        SELECT s."id", s."phoneLookup" FROM "UserSession" s
        WHERE s."updatedAt" < ${sessionsBefore} AND s."phoneLookup" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "Appointment" a WHERE a."sessionId" = s."id")
        AND NOT EXISTS (SELECT 1 FROM "HumanHandoff" h WHERE h."phoneLookup" = s."phoneLookup" AND h."status" IN ('WAITING','ACTIVE'))
        AND NOT EXISTS (SELECT 1 FROM "MessageReceipt" r WHERE r."phoneLookup" = s."phoneLookup" AND r."state" NOT IN ('DONE','SKIPPED'))
        AND NOT EXISTS (SELECT 1 FROM "OutgoingMessage" o WHERE o."phoneLookup" = s."phoneLookup" AND o."state" NOT IN ('SENT','SKIPPED'))
        ORDER BY s."id" FOR UPDATE OF s SKIP LOCKED`;
      for (const session of candidates) {
        const locks = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(19781117, hashtext(${session.phoneLookup})) AS locked`;
        if (!locks[0]?.locked) continue;
        // Revalidar após adquirir o mesmo lock usado na finalização do inbox.
        const pending = await tx.messageReceipt.count({ where: { phoneLookup: session.phoneLookup, state: { notIn: ['DONE', 'SKIPPED'] } } });
        const sending = await tx.outgoingMessage.count({ where: { phoneLookup: session.phoneLookup, state: { notIn: ['SENT', 'SKIPPED'] } } });
        if (pending || sending || await tx.humanHandoff.count({ where: { phoneLookup: session.phoneLookup, status: { in: ['WAITING', 'ACTIVE'] } } })) continue;
        sessionsCount += apply ? (await tx.userSession.deleteMany({ where: { id: session.id, updatedAt: { lt: sessionsBefore }, appointments: { none: {} } } })).count : 1;
      }
    }
    if (apply && sessionsBefore) await tx.$executeRaw`
      DELETE FROM "HumanHandoff" h WHERE h."status" IN ('BOT','CLOSED') AND h."requestedAt" < ${sessionsBefore}
      AND NOT EXISTS (SELECT 1 FROM "UserSession" s WHERE s."phoneLookup" = h."phoneLookup")`;
    return { applied: apply, appointments: appointmentsCount, sessions: sessionsCount, receipts: receiptsCount, outgoing: outgoingCount, note: 'Contagens agregadas, sem dados pessoais. Pendências e estados não resolvidos são preservados. Sem prazo não há limpeza. A simulação preserva vínculos ainda existentes; reaplicar a simulação após limpar dependências pode revelar novos candidatos.' };
}
