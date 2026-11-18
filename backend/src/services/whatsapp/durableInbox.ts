import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { prisma, rootPrisma, inDatabaseTransaction } from '../../database/index.js';
import { canDebounce } from '../../controllers/webhook/messageInbox.js';
import type { IncomingMessage } from '../../controllers/webhook/conversation.js';
import { withMessageSender } from './outgoingContext.js';
import { queueOutgoing, retryDelay } from './durableMessages.js';
import { ExternalWorkRequired, withExternalWorkCache } from './externalWork.js';
import type { ExternalWorkCache } from './externalWork.js';

const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 5;
const TURN_BUDGET_MS = 300_000;
class LeaseLost extends Error { constructor() { super('LeaseLost'); this.name = 'LeaseLost'; } }
class SessionConflict extends Error { constructor() { super('SessionConflict'); this.name = 'SessionConflict'; } }
class InboxWorkError extends Error { constructor(name: string) { super(name); this.name = name; } }
function decodeMessage(payload: string): IncomingMessage | null {
  try { return JSON.parse(payload) as IncomingMessage; } catch { return null; }
}
const activeSession = (phone: string) => prisma.userSession.findFirst({ where: { phoneNumber: phone, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
async function phoneLock(phoneLookup: string) {
  const rows = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(19781117, hashtext(${phoneLookup})) AS locked`;
  return rows[0]?.locked === true;
}
export interface DurableInboxOptions {
  handle: (message: IncomingMessage, hasNewerText: () => Promise<boolean>) => Promise<void>;
  canGroup: (message: IncomingMessage) => Promise<boolean>;
  debounceMs?: number;
}
export class DurableInbox {
  constructor(private options: DurableInboxOptions) {}

  private async claim() {
    return inDatabaseTransaction(async () => {
      const candidates = await prisma.$queryRaw<{ id: string; phoneLookup: string }[]>`
        SELECT r."id", r."phoneLookup" FROM "MessageReceipt" r
        WHERE ((r."state" = 'PENDING' AND r."availableAt" <= NOW())
          OR (r."state" = 'PROCESSING' AND r."leaseUntil" <= NOW()))
        AND NOT EXISTS (SELECT 1 FROM "MessageReceipt" old WHERE old."phoneLookup" = r."phoneLookup" AND old."sequence" < r."sequence" AND old."state" NOT IN ('DONE','SKIPPED'))
        ORDER BY r."sequence" FOR UPDATE OF r SKIP LOCKED LIMIT 1`;
      const selected = candidates[0];
      if (!selected || !await phoneLock(selected.phoneLookup)) return null;
      const first = await prisma.messageReceipt.findUniqueOrThrow({ where: { id: selected.id } });
      const batch = [first];
      if (first.state === 'PROCESSING') {
        // Recupera exatamente o lote abandonado, usando um novo token (fencing).
        batch.push(...await prisma.messageReceipt.findMany({ where: { leaseToken: first.leaseToken, id: { not: first.id }, state: 'PROCESSING' }, orderBy: { sequence: 'asc' } }));
        if (first.attempts >= MAX_ATTEMPTS) {
          await prisma.messageReceipt.updateMany({ where: { id: { in: batch.map(row => row.id) } }, data: { state: 'DEAD', leaseToken: null, leaseUntil: null, lastError: 'LeaseExpired' } });
          return null;
        }
      } else if (first.payload) {
        const message = decodeMessage(first.payload);
        if (message && canDebounce(message) && await this.options.canGroup(message)) {
          if (Date.now() < first.createdAt.getTime() + (this.options.debounceMs ?? 5000)) return null;
          const more = await prisma.messageReceipt.findMany({ where: { phoneNumber: first.phoneNumber, sequence: { gt: first.sequence }, state: { notIn: ['DONE', 'SKIPPED'] } }, orderBy: { sequence: 'asc' }, take: 19 });
          for (const row of more) {
            if (row.state !== 'PENDING' || row.availableAt.getTime() > Date.now() || !row.payload) break;
            const next = decodeMessage(row.payload);
            if (!next || !canDebounce(next) || !await this.options.canGroup(next)) break;
            batch.push(row);
          }
        }
      }
      const token = randomUUID();
      const ids = batch.map(row => row.id);
      await prisma.messageReceipt.updateMany({ where: { id: { in: ids } }, data: { state: 'PROCESSING', attempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(Date.now() + LEASE_MS), lastError: null } });
      return { first, batch, ids, token, phoneLookup: selected.phoneLookup, session: await activeSession(first.phoneNumber) };
    });
  }

  async runOne(): Promise<boolean> {
    const claim = await this.claim();
    if (!claim) return false;
    let lost = false;
    let renewing = false;
    const heartbeat = setInterval(async () => {
      if (renewing || lost) return;
      renewing = true;
      try {
        const renewed = await rootPrisma.messageReceipt.updateMany({ where: { id: { in: claim.ids }, state: 'PROCESSING', leaseToken: claim.token, leaseUntil: { gt: new Date() } }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } });
        if (renewed.count !== claim.ids.length) lost = true;
      } catch { lost = true; }
      finally { renewing = false; }
    }, LEASE_MS / 3);
    heartbeat.unref();
    const cache: ExternalWorkCache = new Map();
    const deadline = Date.now() + TURN_BUDGET_MS;
    try {
      if (!claim.first.payload || claim.batch.some(row => !row.payload)) throw new InboxWorkError('MissingPayload');
      const message = JSON.parse(claim.first.payload) as IncomingMessage;
      const combined = claim.batch.length === 1 ? message : { ...message, text: { body: claim.batch.map(row => (JSON.parse(row.payload!) as IncomingMessage).text!.body).join('\n') } };
      // Cada passagem contém somente SQL/cálculo local. Ao encontrar I/O externo,
      // desfaz a preparação, executa fora da transação e reutiliza o resultado.
      // Somente a passagem final persiste estado, eventos, histórico e outbox.
      for (let pass = 0; pass < 16; pass++) {
        if (lost) throw new LeaseLost();
        if (Date.now() >= deadline) throw new InboxWorkError('InboxTurnTimeout');
        try {
          return await inDatabaseTransaction(async () => {
            const owned = await prisma.$queryRaw<{ id: string }[]>`
              SELECT "id" FROM "MessageReceipt" WHERE "leaseToken" = ${claim.token}
              AND "state" = 'PROCESSING' AND "leaseUntil" > NOW() ORDER BY "sequence" FOR UPDATE`;
            if (owned.length !== claim.ids.length || !await phoneLock(claim.phoneLookup)) throw new LeaseLost();
            // Lock de linha protege o intervalo entre a comparação e o commit.
            await prisma.$queryRaw`SELECT "id" FROM "UserSession" WHERE "phoneLookup" = ${claim.phoneLookup} FOR UPDATE`;
            if (!isDeepStrictEqual(await activeSession(claim.first.phoneNumber), claim.session)) throw new SessionConflict();
            await withExternalWorkCache(cache, () => withMessageSender(payload => queueOutgoing(payload, claim.first.id), () => this.options.handle(combined, async () => {
              const next = await rootPrisma.messageReceipt.findFirst({ where: { phoneNumber: claim.first.phoneNumber, sequence: { gt: claim.batch.at(-1)!.sequence }, state: 'PENDING' }, orderBy: { sequence: 'asc' } });
              if (!next?.payload) return false;
              const incoming = JSON.parse(next.payload) as IncomingMessage;
              return canDebounce(incoming) && await this.options.canGroup(incoming);
            })));
            const finished = await prisma.messageReceipt.updateMany({ where: { id: { in: claim.ids }, state: 'PROCESSING', leaseToken: claim.token, leaseUntil: { gt: new Date() } }, data: { state: 'DONE', payload: null, processedAt: new Date(), lastError: null, leaseToken: null, leaseUntil: null } });
            if (finished.count !== claim.ids.length) throw new LeaseLost();
            return true;
          });
        } catch (error) {
          if (!(error instanceof ExternalWorkRequired)) throw error;
          // A transação anterior já sofreu rollback; espera sem conexão reservada.
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([error.resolve(cache), new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new InboxWorkError('InboxTurnTimeout')), Math.max(1, deadline - Date.now()));
              timer.unref();
            })]);
          } finally { if (timer) clearTimeout(timer); }
        }
      }
      throw new InboxWorkError('ExternalWorkPassLimit');
    } catch (error) {
      const reason = error instanceof Error ? error.name.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64) : 'UnknownError';
      console.error('Falha na inbox persistente:', claim.first.id, reason);
      // Token e validade impedem que o worker antigo altere até o erro do sucessor.
      await rootPrisma.messageReceipt.updateMany({ where: { id: { in: claim.ids }, state: 'PROCESSING', leaseToken: claim.token, leaseUntil: { gt: new Date() } }, data: {
        state: claim.first.attempts + 1 >= MAX_ATTEMPTS ? 'DEAD' : 'PENDING', availableAt: new Date(Date.now() + retryDelay(claim.first.attempts + 1)), lastError: reason, leaseToken: null, leaseUntil: null,
      } });
      return false;
    } finally { clearInterval(heartbeat); cache.clear(); }
  }
}
