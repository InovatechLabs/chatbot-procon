import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { prisma, rootPrisma, inDatabaseTransaction } from '../../database/index.js';
import { canDebounce } from '../../controllers/webhook/messageInbox.js';
import type { IncomingMessage } from '../../controllers/webhook/conversation.js';
import { withMessageSender } from './outgoingContext.js';
import type { MetaPayload } from './outgoingContext.js';
import { deliverMetaPayload } from '../metaAPI.js';

const MAX_ATTEMPTS = 5;
const terminalReceipt = ['DONE', 'SKIPPED'];
export const retryDelay = (attempt: number) => Math.min(60_000, 2000 * 2 ** Math.max(0, attempt - 1));
const errorName = (error: unknown) => error instanceof Error ? error.name.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64) : 'UnknownError';
async function phoneLock(namespace: number, phoneLookup: string) {
  const rows = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${namespace}::integer, hashtext(${phoneLookup})) AS locked`;
  return rows[0]?.locked === true;
}

export async function persistIncoming(messages: IncomingMessage[]) {
  if (!messages.length) return;
  // Um lote só recebe ACK depois que todos os IDs novos foram persistidos.
  await rootPrisma.$transaction(async tx => {
    for (const message of messages) await tx.messageReceipt.upsert({ where: { metaMessageId: message.id }, update: { metaMessageId: message.id },
      create: { metaMessageId: message.id, phoneNumber: message.from, payload: JSON.stringify(message) } });
  });
}

export async function queueOutgoing(payload: MetaPayload, receiptId?: string) {
  const row = await prisma.outgoingMessage.create({ data: { phoneNumber: payload.to, payload: JSON.stringify(payload), ...(receiptId ? { receiptId } : {}) } });
  return { queued: true, id: row.id };
}

export interface DurableInboxOptions {
  handle: (message: IncomingMessage, hasNewerText: () => Promise<boolean>) => Promise<void>;
  canGroup: (message: IncomingMessage) => Promise<boolean>;
  debounceMs?: number;
}
export class DurableInbox {
  constructor(private options: DurableInboxOptions) {}

  async runOne(): Promise<boolean> {
    let selected: { id: string; phoneLookup: string } | undefined;
    try {
      return await inDatabaseTransaction(async () => {
        const candidates = await prisma.$queryRaw<{ id: string; phoneLookup: string }[]>`
          SELECT r."id", r."phoneLookup" FROM "MessageReceipt" r
          WHERE r."state" = 'PENDING' AND r."availableAt" <= NOW()
          AND NOT EXISTS (SELECT 1 FROM "MessageReceipt" old WHERE old."phoneLookup" = r."phoneLookup" AND old."sequence" < r."sequence" AND old."state" NOT IN ('DONE','SKIPPED'))
          ORDER BY r."sequence" FOR UPDATE OF r SKIP LOCKED LIMIT 1`;
        selected = candidates[0];
        if (!selected || !await phoneLock(19781117, selected.phoneLookup)) return false;
        const first = await prisma.messageReceipt.findUniqueOrThrow({ where: { id: selected.id } });
        if (!first.payload) throw new Error('MissingPayload');
        const message = JSON.parse(first.payload) as IncomingMessage;
        const batch = [first];
        if (canDebounce(message) && await this.options.canGroup(message)) {
          if (Date.now() < first.createdAt.getTime() + (this.options.debounceMs ?? 5000)) return false;
          const more = await prisma.messageReceipt.findMany({ where: { phoneNumber: first.phoneNumber, sequence: { gt: first.sequence }, state: { notIn: terminalReceipt } }, orderBy: { sequence: 'asc' }, take: 19 });
          for (const row of more) {
            if (row.state !== 'PENDING' || row.availableAt.getTime() > Date.now() || !row.payload) break;
            const next = JSON.parse(row.payload) as IncomingMessage;
            if (!canDebounce(next) || !await this.options.canGroup(next)) break;
            batch.push(row);
          }
        }
        const combined = batch.length === 1 ? message : { ...message, text: { body: batch.map(row => (JSON.parse(row.payload!) as IncomingMessage).text!.body).join('\n') } };
        await withMessageSender(payload => queueOutgoing(payload, first.id), () => this.options.handle(combined, async () => {
          // A conexão externa enxerga complementos recebidos durante a consulta ao modelo.
          const next = await rootPrisma.messageReceipt.findFirst({ where: { phoneNumber: first.phoneNumber, sequence: { gt: batch.at(-1)!.sequence }, state: 'PENDING' }, orderBy: { sequence: 'asc' } });
          if (!next?.payload) return false;
          const incoming = JSON.parse(next.payload) as IncomingMessage;
          return canDebounce(incoming) && await this.options.canGroup(incoming);
        }));
        await prisma.messageReceipt.updateMany({ where: { id: { in: batch.map(row => row.id) } }, data: { state: 'DONE', attempts: { increment: 1 }, payload: null, processedAt: new Date(), lastError: null } });
        return true;
      });
    } catch (error) {
      console.error('Falha na inbox persistente:', selected?.id ?? 'sem-item', errorName(error));
      if (selected) {
        const failed = selected;
        await inDatabaseTransaction(async () => {
          if (!await phoneLock(19781117, failed.phoneLookup)) return;
          const row = await prisma.messageReceipt.findUnique({ where: { id: failed.id } });
          if (row?.state !== 'PENDING') return;
          const attempts = row.attempts + 1;
          await prisma.messageReceipt.update({ where: { id: row.id }, data: { attempts, state: attempts >= MAX_ATTEMPTS ? 'DEAD' : 'PENDING', availableAt: new Date(Date.now() + retryDelay(attempts)), lastError: errorName(error) } });
        });
      }
      return false;
    }
  }
}

export function outgoingFailure(error: unknown, attempt: number): { state: string; reason: string } {
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    const code = error.response.data?.error?.code;
    const reason = `HTTP_${status}${Number.isSafeInteger(code) ? `_META_${code}` : ''}`;
    if (status === 429 || status >= 500 || error.response.data?.error?.is_transient === true) return { state: attempt >= MAX_ATTEMPTS ? 'DEAD' : 'PENDING', reason };
    return { state: 'DEAD', reason };
  }
  // Timeout/queda não prova que a Meta recusou o envio. Não reenviar cegamente.
  return { state: 'UNKNOWN', reason: axios.isAxiosError(error) && ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'].includes(error.code ?? '') ? error.code! : errorName(error) };
}

export class DurableOutbox {
  constructor(private send: (payload: MetaPayload) => Promise<any> = deliverMetaPayload) {}

  async runOne(): Promise<boolean> {
    // Se o processo caiu depois de enviar, a expiração não autoriza repetir a mensagem.
    await rootPrisma.outgoingMessage.updateMany({ where: { state: 'SENDING', leaseUntil: { lt: new Date() } }, data: { state: 'UNKNOWN', lastError: 'LeaseExpired' } });
    const item = await inDatabaseTransaction(async () => {
      const rows = await prisma.$queryRaw<{ id: string; phoneLookup: string }[]>`
        SELECT r."id", r."phoneLookup" FROM "OutgoingMessage" r
        WHERE r."state" = 'PENDING' AND r."availableAt" <= NOW()
        AND NOT EXISTS (SELECT 1 FROM "OutgoingMessage" old WHERE old."phoneLookup" = r."phoneLookup" AND old."sequence" < r."sequence" AND old."state" NOT IN ('SENT','SKIPPED'))
        ORDER BY r."sequence" FOR UPDATE OF r SKIP LOCKED LIMIT 1`;
      const candidate = rows[0];
      if (!candidate || !await phoneLock(19781118, candidate.phoneLookup)) return null;
      return prisma.outgoingMessage.update({ where: { id: candidate.id }, data: { state: 'SENDING', attempts: { increment: 1 }, leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + 45_000) } });
    });
    if (!item) return false;
    try {
      if (!item.payload) throw new Error('MissingPayload');
      const response = await this.send(JSON.parse(item.payload) as MetaPayload);
      const metaId = response?.messages?.[0]?.id;
      if (typeof metaId !== 'string' || !metaId) throw new Error('MissingMetaMessageId');
      await rootPrisma.outgoingMessage.updateMany({ where: { id: item.id, leaseToken: item.leaseToken }, data: { state: 'SENT', metaMessageId: metaId, payload: null, sentAt: new Date(), leaseToken: null, leaseUntil: null, lastError: null } });
    } catch (error) {
      const failure = outgoingFailure(error, item.attempts);
      await rootPrisma.outgoingMessage.updateMany({ where: { id: item.id, leaseToken: item.leaseToken, state: 'SENDING' }, data: { state: failure.state, lastError: failure.reason, availableAt: new Date(Date.now() + retryDelay(item.attempts)), leaseToken: null, leaseUntil: null } });
      console.error('Falha na outbox persistente:', item.id, failure.reason);
    }
    return true;
  }
}

export async function messageQueueStatus() {
  const [inbox, outbox] = await Promise.all([
    rootPrisma.messageReceipt.groupBy({ by: ['state'], _count: { _all: true } }),
    rootPrisma.outgoingMessage.groupBy({ by: ['state'], _count: { _all: true } }),
  ]);
  return { inbox, outbox };
}

export async function resolveQueuedMessage(queue: 'inbox' | 'outbox', id: string, action: 'retry' | 'skip') {
  return inDatabaseTransaction(async () => {
    if (queue === 'inbox') {
      await prisma.$queryRaw`SELECT "id" FROM "MessageReceipt" WHERE "id" = ${id} FOR UPDATE`;
      const row = await prisma.messageReceipt.findUniqueOrThrow({ where: { id } });
      if (row.state !== 'DEAD') throw new Error('Somente entrada DEAD pode ser revisada.');
      if (action === 'retry' && !row.payload) throw new Error('Mensagem sem conteúdo para repetir.');
      return prisma.messageReceipt.update({ where: { id }, data: { state: action === 'retry' ? 'PENDING' : 'SKIPPED', attempts: 0, availableAt: new Date(), lastError: null, ...(action === 'skip' ? { payload: null } : {}) }, select: { id: true, state: true } });
    }
    await prisma.$queryRaw`SELECT "id" FROM "OutgoingMessage" WHERE "id" = ${id} FOR UPDATE`;
    const row = await prisma.outgoingMessage.findUniqueOrThrow({ where: { id } });
    if (!['DEAD', 'UNKNOWN'].includes(row.state)) throw new Error('Somente saída DEAD/UNKNOWN pode ser revisada.');
    if (action === 'retry' && !row.payload) throw new Error('Mensagem sem conteúdo para repetir.');
    return prisma.outgoingMessage.update({ where: { id }, data: { state: action === 'retry' ? 'PENDING' : 'SKIPPED', attempts: 0, availableAt: new Date(), leaseToken: null, leaseUntil: null, lastError: null, ...(action === 'skip' ? { payload: null } : {}) }, select: { id: true, state: true } });
  });
}
