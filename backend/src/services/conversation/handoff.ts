import { lookupHash } from '../privacy/crypto.js';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const testPhone = () => process.env.HUMAN_HANDOFF_TEST_PHONE;
export const handoffInScope = (phone: string) => !testPhone() || testPhone() === phone;
export const handoffTestLookup = () => {
  const phone = testPhone();
  return phone ? lookupHash('phoneNumber', phone) : undefined;
};
export const CHAT_OPTION = { id: 'btn_confirm_human_chat', text: 'Falar por aqui' };
export const IN_PERSON_OPTION = { id: 'btn_confirm_in_person', text: 'Agendar presencial' };
export const LEAVE_QUEUE_OPTION = { id: 'btn_leave_handoff_queue', text: 'Sair da fila' };

async function lockOutbox(db: PrismaClient, phoneLookup: string) {
  const locks = await db.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(19781118, hashtext(${phoneLookup})) AS locked`;
  if (!locks[0]?.locked) throw new Error('HandoffOutboxBusy');
}

// Executado no mesmo turno durável que registra o novo menu.
export async function cancelWaitingHandoff(db: PrismaClient, phone: string) {
  const phoneLookup = lookupHash('phoneNumber', phone);
  await lockOutbox(db, phoneLookup);
  const changed = await db.humanHandoff.updateMany({ where: { phoneLookup, status: 'WAITING' },
    data: { status: 'BOT', assigneeId: null, version: { increment: 1 } },
  });
  if (!changed.count) return false;
  await db.outgoingMessage.updateMany({ where: { phoneLookup, state: 'PENDING', handoffVersion: { not: null } },
    data: { state: 'SKIPPED', payload: null, lastError: 'HandoffChanged' },
  });
  return true;
}

export function waitingForHuman(db: PrismaClient, phone: string) {
  return db.humanHandoff?.findFirst({ where: { phoneLookup: lookupHash('phoneNumber', phone), status: { in: ['WAITING', 'ACTIVE'] } } });
}

export async function queuePosition(db: PrismaClient, phone: string) {
  const phoneLookup = lookupHash('phoneNumber', phone);
  const pilot = handoffTestLookup();
  const ticket = await db.humanHandoff.findUnique({ where: { phoneLookup }, select: { id: true, status: true, requestedAt: true } });
  if (ticket?.status !== 'WAITING') return null;
  const ahead = await db.humanHandoff.count({ where: {
    status: 'WAITING', ...(pilot ? { phoneLookup: pilot } : {}),
    OR: [{ requestedAt: { lt: ticket.requestedAt } }, { requestedAt: ticket.requestedAt, id: { lt: ticket.id } }],
  } });
  return ahead + 1;
}

// Chamado no turno durável, sob o lock do inbox. Fila e confirmação vão no mesmo commit.
export async function requestHuman(db: PrismaClient, phone: string) {
  const phoneLookup = lookupHash('phoneNumber', phone);
  await lockOutbox(db, phoneLookup);
  // O cliente protegido rejeita índices fornecidos à camada de modelos. Aqui
  // o índice é calculado no servidor e inserido por SQL parametrizado.
  await db.$queryRaw`SELECT pg_advisory_xact_lock(19781119, 2)::text`;
  const inserted = await db.$executeRaw`INSERT INTO "HumanHandoff" ("phoneLookup", "id", "requestedAt") VALUES (${phoneLookup}, ${randomUUID()}, clock_timestamp())
    ON CONFLICT ("phoneLookup") DO UPDATE SET "status" = 'WAITING', "assigneeId" = NULL, "version" = "HumanHandoff"."version" + 1, "requestedAt" = EXCLUDED."requestedAt"
    WHERE "HumanHandoff"."status" IN ('BOT', 'CLOSED')`;
  if (!inserted) return false;
  // Um envio já iniciado será tratado antes de confirmar a tomada de controle.
  await db.outgoingMessage.updateMany({ where: { phoneLookup, state: 'PENDING' }, data: { state: 'SKIPPED', payload: null } });
  return true;
}
