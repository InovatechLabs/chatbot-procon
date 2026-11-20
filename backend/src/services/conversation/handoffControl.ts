import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { inDatabaseTransaction, prisma } from '../../database/index.js';
import { AuthError, type PanelIdentity } from '../auth/authService.js';
import { redactIdentifiers } from '../privacy/redact.js';
import { serviceWindowUntil } from '../whatsapp/serviceWindow.js';
import { initialSnapshot, persistable } from './state.js';
import { handoffTestLookup } from './handoff.js';
import { charLength } from '../whatsapp/messagePolicy.js';

const queueFields = { id: true, status: true, assigneeId: true, version: true, requestedAt: true } as const;
type Ticket = { id: string; phoneLookup: string; status: string; assigneeId: string | null; version: number };

async function ticket(id: string): Promise<Ticket> {
  const [row] = await prisma.$queryRaw<Ticket[]>`SELECT "id", "phoneLookup", "status", "assigneeId", "version" FROM "HumanHandoff" WHERE "id" = ${id}`;
  const testLookup = handoffTestLookup();
  if (!row || (testLookup && row.phoneLookup !== testLookup)) throw new AuthError(404, 'Atendimento não encontrado.');
  return row;
}

function requireOwner(row: Ticket, actor: PanelIdentity) {
  if (row.assigneeId !== actor.id) throw new AuthError(403, 'Ação reservada ao responsável pelo atendimento.');
}

const sessionFor = (row: Ticket) => prisma.userSession.findFirst({
  where: { phoneLookup: row.phoneLookup }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  select: { id: true, phoneNumber: true },
});

const testScope = (): Prisma.HumanHandoffWhereInput => {
  const phoneLookup = handoffTestLookup();
  return phoneLookup ? { phoneLookup } : {};
};
const visibleHandoffs = (actor: PanelIdentity): Prisma.HumanHandoffWhereInput => ({
  ...testScope(), ...(actor.role === 'ADMIN' ? {} : { OR: [{ status: 'WAITING' }, { assigneeId: actor.id }] }),
});
export type HandoffView = 'waiting' | 'active' | 'history';
const statusesByView = { waiting: ['WAITING'], active: ['ACTIVE'], history: ['BOT', 'CLOSED'] };

export async function listHandoffs(actor: PanelIdentity, cursor?: string, view?: HandoffView) {
  const where: Prisma.HumanHandoffWhereInput = { ...visibleHandoffs(actor), ...(view ? { status: { in: statusesByView[view] } } : {}) };
  if (cursor && !await prisma.humanHandoff.findFirst({ where: { AND: [where, { id: cursor }] }, select: { id: true } })) throw new AuthError(400, 'Cursor inválido.');
  const rows = await prisma.humanHandoff.findMany({ where, select: queueFields,
    orderBy: [{ requestedAt: view === 'waiting' ? 'asc' : 'desc' }, { id: view === 'waiting' ? 'asc' : 'desc' }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null };
}

const botVisibility = Prisma.sql`s."status" = 'OPEN' AND s."phoneLookup" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "HumanHandoff" h WHERE h."phoneLookup" = s."phoneLookup" AND h."status" IN ('WAITING','ACTIVE'))
  AND NOT EXISTS (SELECT 1 FROM "UserSession" newer WHERE newer."phoneLookup" = s."phoneLookup" AND newer."status" = 'OPEN'
    AND (newer."createdAt", newer."id") > (s."createdAt", s."id"))`;

function botScope() {
  const hash = handoffTestLookup();
  return hash ? Prisma.sql`AND s."phoneLookup" = ${hash}` : Prisma.empty;
}

export async function listBotConversations(cursor?: string) {
  const rows = await prisma.$queryRaw<{ id: string; updatedAt: Date }[]>`SELECT s."id", s."updatedAt" FROM "UserSession" s
    WHERE ${botVisibility} ${botScope()}
    ${cursor ? Prisma.sql`AND (s."updatedAt", s."id") < (SELECT "updatedAt", "id" FROM "UserSession" WHERE "id" = ${cursor})` : Prisma.empty}
    ORDER BY s."updatedAt" DESC, s."id" DESC LIMIT 51`;
  return { items: rows.slice(0, 50).map(row => ({ id: row.id, requestedAt: row.updatedAt, status: 'BOT_LIVE', version: 0, assigneeId: null })), nextCursor: rows.length > 50 ? rows[49]!.id : null };
}

async function botSession(id: string) {
  const [row] = await prisma.$queryRaw<{ id: string; phoneLookup: string }[]>`SELECT s."id", s."phoneLookup" FROM "UserSession" s
    WHERE s."id" = ${id} AND ${botVisibility} ${botScope()}`;
  return row;
}

export async function botConversationHistory(id: string, cursor?: string) {
  return inDatabaseTransaction(async () => {
    const existing = await botSession(id);
    if (!existing) throw new AuthError(404, 'Esta conversa mudou de fila ou foi finalizada.');
    const [lock] = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(19781117, hashtext(${existing.phoneLookup})) AS locked`;
    if (!lock?.locked) throw new AuthError(409, 'A conversa está sendo atualizada. Tente novamente.');
    if (!await botSession(id)) throw new AuthError(404, 'Esta conversa mudou de fila ou foi finalizada.');
    if (cursor && !await prisma.chatLog.findFirst({ where: { id: cursor, sessionId: id }, select: { id: true } })) throw new AuthError(400, 'Cursor inválido.');
    const rows = await prisma.chatLog.findMany({ where: { sessionId: id }, select: historyFields,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return { ticket: { id, status: 'BOT_LIVE', version: 0, assigneeId: null }, windowUntil: null,
      items: rows.slice(0, 50).map(log => ({ ...messageView(log), authorName: null, hasAudio: false })), nextCursor: rows.length > 50 ? rows[49]!.id : null };
  }, 5000);
}

export async function handoffStreamSnapshot(actor: PanelIdentity, selected?: string, selectedBot?: string, watchBot = false) {
  const visible = visibleHandoffs(actor);
  const scope = testScope();
  const [waiting, latestWaiting, queue, focus, botList, botFocus] = await Promise.all([
    prisma.humanHandoff.count({ where: { ...scope, status: 'WAITING' } }),
    prisma.humanHandoff.findFirst({ where: { ...scope, status: 'WAITING' }, orderBy: { requestedAt: 'desc' }, select: { requestedAt: true } }),
    prisma.humanHandoff.findMany({ where: { ...visible, status: { in: ['WAITING', 'ACTIVE'] } }, select: queueFields,
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], take: 100 }),
    selected ? prisma.$queryRaw<Ticket[]>`SELECT "id", "phoneLookup", "status", "assigneeId", "version" FROM "HumanHandoff"
      WHERE "id" = ${selected} AND (${actor.role === 'ADMIN'} OR "status" = 'WAITING' OR "assigneeId" = ${actor.id})` : [],
    watchBot ? listBotConversations() : null,
    selectedBot ? botSession(selectedBot) : null,
  ]);
  const row = !scope.phoneLookup || focus[0]?.phoneLookup === scope.phoneLookup ? focus[0] : undefined;
  const latest = row ? await Promise.all([
    prisma.chatLog.findMany({ where: { phoneLookup: row.phoneLookup }, take: 50, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      select: { id: true, outgoing: { select: { state: true, deliveryStatus: true, lastError: true } } } }),
    serviceWindowUntil(prisma, row.phoneLookup),
  ]) : null;
  const botLatest = botFocus ? await prisma.chatLog.findMany({ where: { sessionId: botFocus.id }, take: 50,
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], select: { id: true, outgoing: { select: { state: true, deliveryStatus: true } } },
  }) : null;
  // O hash serve só para comparar snapshots neste processo e nunca vai ao cliente.
  const revision = createHash('sha256').update(JSON.stringify([waiting, queue, row?.version, latest, botList, botLatest])).digest('hex');
  return { waiting, latestRequestedAt: latestWaiting?.requestedAt.getTime() ?? null, revision };
}

const historyFields = { id: true, direction: true, messageText: true, timestamp: true, authorId: true, audioMediaId: true,
  outgoing: { select: { state: true, deliveryStatus: true, lastError: true } },
} as const satisfies Prisma.ChatLogSelect;
const messageView = (log: Prisma.ChatLogGetPayload<{ select: typeof historyFields }>) => ({
  id: log.id, text: redactIdentifiers(log.messageText), at: log.timestamp,
  author: log.authorId ? 'ATTENDANT' : log.direction === 'INBOUND' ? 'CITIZEN' : 'BOT',
  authorId: log.authorId, delivery: log.outgoing, hasAudio: Boolean(log.audioMediaId),
});

async function lockReadableTicket(id: string, actor: PanelIdentity) {
  const row = await lockTicket(id);
  if (row.status !== 'WAITING' && actor.role !== 'ADMIN') requireOwner(row, actor);
  return row;
}

export function getHandoffAudio(id: string, messageId: string, actor: PanelIdentity) {
  return inDatabaseTransaction(async () => {
    const row = await lockReadableTicket(id, actor);
    const message = await prisma.chatLog.findFirst({ where: { id: messageId, phoneLookup: row.phoneLookup, direction: 'INBOUND' }, select: { audioMediaId: true } });
    if (!message?.audioMediaId) throw new AuthError(404, 'Áudio indisponível.');
    return message.audioMediaId;
  }, 5000);
}
const publicName = (name: string | null | undefined) => name ?? 'Atendente do PROCON';
const signature = (name: string | null | undefined) => `*${publicName(name)}*\n\n`;

export async function handoffHistory(id: string, actor: PanelIdentity, cursor?: string) {
  // A leitura revalida a propriedade no mesmo snapshot usado para carregar as mensagens.
  return inDatabaseTransaction(async () => {
    const row = await lockReadableTicket(id, actor);
    const phoneLookup = row.phoneLookup;
    if (cursor && !await prisma.chatLog.findFirst({ where: { id: cursor, phoneLookup }, select: { id: true } })) throw new AuthError(400, 'Cursor inválido.');
    const rows = await prisma.chatLog.findMany({ where: { phoneLookup }, select: historyFields,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const ids = [...new Set([actor.id, ...rows.flatMap(log => log.authorId ? [log.authorId] : [])])];
    const authors = await prisma.panelUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
    return {
      ticket: { id: row.id, status: row.status, assigneeId: row.assigneeId, version: row.version },
      windowUntil: await serviceWindowUntil(prisma, phoneLookup),
      replyLimit: 4096 - charLength(signature(authors.find(author => author.id === actor.id)?.displayName)),
      items: rows.slice(0, 50).map(log => ({ ...messageView(log), authorName: log.authorId ? publicName(authors.find(author => author.id === log.authorId)?.displayName) : null })),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  }, 5000);
}

async function lockTicket(id: string, includeOutbox = false) {
  const current = await ticket(id);
  // A ordem é inbox e depois outbox. Usar try evita segurar uma fila esperando a outra.
  for (const namespace of includeOutbox ? [19781117, 19781118] : [19781117]) {
    const [lock] = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${namespace}::integer, hashtext(${current.phoneLookup})) AS locked`;
    if (!lock?.locked) throw new AuthError(409, 'A conversa está sendo atualizada. Tente novamente.');
  }
  return ticket(id);
}

async function checkActor(actor: PanelIdentity) {
  const [account] = await prisma.$queryRaw<{ active: boolean; role: string; mustChangePassword: boolean; displayName: string | null }[]>`
    SELECT "active", "role", "mustChangePassword", "displayName" FROM "PanelUser" WHERE "id" = ${actor.id} FOR SHARE`;
  if (!account?.active || account.mustChangePassword || !['ADMIN', 'ATTENDANT'].includes(account.role)) throw new AuthError(403, 'Conta sem acesso ao atendimento.');
  return account;
}

async function queueHandoffText(session: { id: string; phoneNumber: string }, version: number, text: string,
  human?: { authorId: string; requestKey: string; wireText: string }) {
  const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: session.phoneNumber, type: 'text', text: { body: human?.wireText ?? text } };
  const outgoing = await prisma.outgoingMessage.create({ data: { phoneNumber: session.phoneNumber, payload: JSON.stringify(payload), humanAuthored: !!human, handoffVersion: version }, select: { id: true } });
  return prisma.chatLog.create({ data: { sessionId: session.id, phoneNumber: session.phoneNumber, direction: 'OUTBOUND', messageText: text, outgoingId: outgoing.id,
    ...(human ? { authorId: human.authorId, requestKey: human.requestKey } : {}),
  }, select: historyFields });
}

type Change = 'claim' | 'close' | 'return';
export function changeHandoff(id: string, actor: PanelIdentity, version: number, change: Change) {
  return inDatabaseTransaction(async () => {
    const account = await checkActor(actor);
    const row = await lockTicket(id, true);
    if (row.version !== version) throw new AuthError(409, 'O atendimento mudou. Atualize a conversa.');
    if (change === 'claim') {
      if (row.status !== 'WAITING') throw new AuthError(409, 'O atendimento não está aguardando.');
    } else {
      if (!['WAITING', 'ACTIVE'].includes(row.status)) throw new AuthError(409, 'O atendimento já foi finalizado.');
      if (account.role !== 'ADMIN') requireOwner(row, actor);
    }
    const blocking = await prisma.outgoingMessage.findFirst({ where: { phoneLookup: row.phoneLookup, OR: [
      { state: 'SENDING' }, { state: 'PENDING', humanAuthored: true },
    ] }, select: { id: true } });
    if (blocking) throw new AuthError(409, 'Há um envio em andamento. Aguarde antes de mudar o controle da conversa.');
    await prisma.outgoingMessage.updateMany({ where: { phoneLookup: row.phoneLookup, state: 'PENDING', humanAuthored: false }, data: { state: 'SKIPPED', payload: null, lastError: 'HandoffChanged' } });
    if (change !== 'claim') {
      await prisma.userSession.updateMany({ where: { phoneLookup: row.phoneLookup, status: 'OPEN' }, data: persistable({ ...initialSnapshot(), state: { kind: 'FINISHED' } }) });
    }
    const updated = await prisma.humanHandoff.update({ where: { id }, data: {
      status: change === 'claim' ? 'ACTIVE' : change === 'close' ? 'CLOSED' : 'BOT',
      assigneeId: change === 'claim' ? actor.id : row.assigneeId, version: { increment: 1 },
    }, select: queueFields });
    let noticeQueued = false;
    if (change !== 'close') {
      const session = await sessionFor(row);
      const windowUntil = await serviceWindowUntil(prisma, row.phoneLookup);
      if (session && windowUntil && windowUntil.getTime() > Date.now()) {
        const notice = change === 'claim'
          ? `*${publicName(account.displayName)}* assumiu a conversa. A partir de agora, você está falando com uma pessoa da equipe do PROCON.`
          : 'O atendimento humano terminou e você voltou a conversar com o assistente virtual do PROCON. Para ver as opções, digite *menu*.';
        await queueHandoffText(session, updated.version, notice);
        noticeQueued = true;
      }
    }
    return { ...updated, noticeQueued };
  }, 5000);
}

export function sendHandoffMessage(id: string, actor: PanelIdentity, input: { version: number; requestId: string; text: string }) {
  return inDatabaseTransaction(async () => {
    const account = await checkActor(actor);
    const row = await lockTicket(id, true);
    requireOwner(row, actor);
    if (row.status !== 'ACTIVE' || row.version !== input.version) throw new AuthError(409, 'O atendimento mudou. Atualize a conversa.');
    const requestKey = `${row.id}:${row.version}:${input.requestId}`;
    const previous = await prisma.chatLog.findUnique({ where: { requestKey }, select: historyFields });
    if (previous) {
      if (previous.messageText !== input.text) throw new AuthError(409, 'Identificador já usado com outro texto.');
      return messageView(previous);
    }
    const windowUntil = await serviceWindowUntil(prisma, row.phoneLookup);
    if (!windowUntil || windowUntil.getTime() <= Date.now()) throw new AuthError(409, 'Janela de atendimento encerrada. Aguarde uma nova mensagem do consumidor.');
    const session = await sessionFor(row);
    if (!session) throw new AuthError(409, 'Histórico do contato indisponível.');
    const prefix = signature(account.displayName);
    if (charLength(prefix + input.text) > 4096) throw new AuthError(400, `A resposta pode ter até ${4096 - charLength(prefix)} caracteres com a assinatura atual.`);
    const log = await queueHandoffText(session, row.version, input.text, { authorId: actor.id, requestKey, wireText: prefix + input.text });
    return messageView(log);
  }, 5000);
}
