import 'dotenv/config';
import { rootPrisma } from '../src/database/index.js';
import { messageQueueStatus, resolveQueuedMessage } from '../src/services/whatsapp/durableMessages.js';

try {
  const [command = 'status', queue, id, consent] = process.argv.slice(2);
  if (command === 'status') {
    console.log(JSON.stringify(await messageQueueStatus(), null, 2));
    const [inbox, outbox] = await Promise.all([
      rootPrisma.messageReceipt.findMany({ where: { state: 'DEAD' }, select: { id: true, state: true, attempts: true, createdAt: true, lastError: true }, orderBy: { sequence: 'asc' }, take: 100 }),
      rootPrisma.outgoingMessage.findMany({ where: { state: { in: ['DEAD', 'UNKNOWN'] } }, select: { id: true, state: true, attempts: true, createdAt: true, lastError: true }, orderBy: { sequence: 'asc' }, take: 100 }),
    ]);
    console.log(JSON.stringify({ inbox, outbox }, null, 2));
  } else {
    if (!['retry', 'skip'].includes(command) || !['inbox', 'outbox'].includes(queue ?? '') || !id || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Uso: status | retry|skip inbox|outbox UUID --confirm');
    if (consent !== '--confirm') throw new Error('Revise o ID. Retry de saída UNKNOWN pode duplicar mensagem; skip descarta a entrega. Repita com --confirm para executar.');
    console.log(JSON.stringify(await resolveQueuedMessage(queue as 'inbox' | 'outbox', id, command as 'retry' | 'skip')));
  }
} catch (error) {
  const known = error instanceof Error && ['Uso:', 'Revise o ID.', 'Somente entrada', 'Somente saída', 'Mensagem sem conteúdo'].some(prefix => error.message.startsWith(prefix));
  console.error(known ? (error as Error).message : 'Não foi possível consultar/alterar a fila. Verifique banco e migrações.');
  process.exitCode = 1;
} finally { await rootPrisma.$disconnect(); }
