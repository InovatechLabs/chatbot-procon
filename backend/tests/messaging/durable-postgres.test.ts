import test from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError } from 'axios';

test('mensagens duráveis: deduplicação, rollback, retomada, ordenação e falhas de envio', { skip: !process.env.MESSAGING_TEST_DB_NAME }, async t => {
  const name = process.env.MESSAGING_TEST_DB_NAME!;
  assert.match(name, /^procon_messaging_test_[a-z0-9_]+$/);
  const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${name}`; process.env.DATABASE_URL = url.toString();
  const { prisma, rootPrisma } = await import('../../src/database/index.js');
  const { DurableInbox, DurableOutbox, persistIncoming, queueOutgoing, resolveQueuedMessage } = await import('../../src/services/whatsapp/durableMessages.js');
  const { createConversationHandler } = await import('../../src/controllers/webhook/conversation.js');
  const { sendTextMessage } = await import('../../src/services/metaAPI.js');
  const { decodeSession, initialSnapshot, persistable } = await import('../../src/services/conversation/state.js');
  const { createAppointment } = await import('../../src/services/appointments/appointmentService.js');
  const message = (id: string, body: string, phone = '5511999999900') => ({ id, from: phone, type: 'text', text: { body } });
  const clear = async () => {
    await prisma.outgoingMessage.deleteMany(); await prisma.messageReceipt.deleteMany();
    await prisma.sessionFeedback.deleteMany(); await prisma.appointment.deleteMany();
    await prisma.chatLog.deleteMany(); await prisma.userSession.deleteMany();
  };
  try {
    await t.test('duas instâncias e reentregas não repetem o turno; estado e outbox são atômicos', async () => {
      await clear();
      let turns = 0;
      const handler = createConversationHandler({ answer: async () => { turns++; return { tipoResposta: 'orientacao_final', artigo: null, texto: 'Orientação fictícia' }; } });
      await Promise.all([persistIncoming([message('same', 'Minha loja não entregou')]), persistIncoming([message('same', 'Minha loja não entregou')])]);
      assert.equal(await prisma.messageReceipt.count(), 1);
      const options = { handle: handler, canGroup: async () => true, debounceMs: 0 };
      await Promise.all([new DurableInbox(options).runOne(), new DurableInbox(options).runOne()]);
      assert.equal(turns, 1);
      const receipt = await prisma.messageReceipt.findUniqueOrThrow({ where: { metaMessageId: 'same' } });
      assert.equal(receipt.state, 'DONE'); assert.equal(receipt.payload, null);
      const state = await prisma.userSession.findFirstOrThrow();
      assert.equal(decodeSession(state).snapshot.state.kind, 'POST_ANSWER');
      assert.equal(await prisma.outgoingMessage.count(), 2, 'aviso inicial e resposta gravados, sem envio de rede');
      await persistIncoming([message('same', 'Minha loja não entregou')]);
      assert.equal(await new DurableInbox(options).runOne(), false); assert.equal(turns, 1);
      const raw = await prisma.$queryRaw<{ phoneNumber: string; payload: string }[]>`SELECT "phoneNumber", "payload" FROM "OutgoingMessage" LIMIT 1`;
      assert.ok(raw[0]!.phoneNumber.startsWith('enc:v1:')); assert.ok(raw[0]!.payload.startsWith('enc:v1:'));
      let sent = 0;
      const sender = async () => { sent++; return { messages: [{ id: `sent-${sent}` }] }; };
      await Promise.all([new DurableOutbox(sender).runOne(), new DurableOutbox(sender).runOne()]);
      // A segunda só pode ser enviada depois da confirmação da primeira.
      await new DurableOutbox(sender).runOne();
      assert.equal(sent, 2);
      const delivered = await prisma.outgoingMessage.findMany({ where: { state: 'SENT' }, select: { payload: true } });
      assert.equal(delivered.length, 2); assert.ok(delivered.every(row => row.payload === null));
    });

    await t.test('falha após reserva reverte reserva, sessão e saída; nova instância retoma uma vez', async () => {
      await clear();
      await prisma.scheduleSettings.update({ where: { id: 'main' }, data: { minLeadMinutes: 0, workDays: [0, 1, 2, 3, 4, 5, 6] } });
      const date = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
      const at = new Date(`${date}T09:00:00-03:00`);
      const session = await prisma.userSession.create({ data: { phoneNumber: '5511999999900', ...persistable({ ...initialSnapshot(), state: { kind: 'SCHEDULE_SLOT', category: 'GERAL', date, page: 0 } }) } });
      await persistIncoming([message('book', 'confirmar')]);
      let crash = true;
      const options = { canGroup: async () => false, handle: async () => {
        await createAppointment({ phoneNumber: session.phoneNumber, scheduledAt: at, sessionId: session.id, source: 'WHATSAPP', citizenName: 'Pessoa fictícia' });
        await sendTextMessage(session.phoneNumber, 'Reserva fictícia confirmada');
        assert.equal(await rootPrisma.outgoingMessage.count(), 0, 'outra conexão não vê saída antes do commit');
        if (crash) throw new Error('SimulatedCrash');
      } };
      assert.equal(await new DurableInbox(options).runOne(), false);
      assert.equal(await prisma.appointment.count(), 0); assert.equal(await prisma.outgoingMessage.count(), 0);
      assert.equal((await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } })).stepState, session.stepState);
      const failed = await prisma.messageReceipt.findUniqueOrThrow({ where: { metaMessageId: 'book' } });
      assert.equal(failed.attempts, 1); assert.equal(failed.state, 'PENDING');
      crash = false;
      await prisma.messageReceipt.update({ where: { id: failed.id }, data: { availableAt: new Date(0) } });
      assert.equal(await new DurableInbox(options).runOne(), true);
      assert.equal(await prisma.appointment.count(), 1); assert.equal(await prisma.outgoingMessage.count(), 1);
      assert.equal(decodeSession(await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } })).snapshot.state.kind, 'READY');
      await persistIncoming([message('book', 'confirmar')]);
      assert.equal(await new DurableInbox(options).runOne(), false); assert.equal(await prisma.appointment.count(), 1);
    });

    await t.test('agrupamento mantém comandos como barreiras e detecta complementos durante a IA', async () => {
      await clear();
      await persistIncoming([message('part1', 'Comprei um produto'), message('part2', 'não funciona'), message('menu', 'menu'), message('part3', 'Outro assunto')]);
      const received: string[] = [];
      const options = { debounceMs: 0, canGroup: async () => true, handle: async (incoming: { text?: { body: string } }, newer: () => Promise<boolean>) => {
        received.push(incoming.text!.body);
        if (received.length === 1) assert.equal(await newer(), false, 'menu não suprime a resposta');
      } };
      await new DurableInbox(options).runOne(); await new DurableInbox(options).runOne(); await new DurableInbox(options).runOne();
      assert.deepEqual(received, ['Comprei um produto\nnão funciona', 'menu', 'Outro assunto']);
      await clear(); await persistIncoming([message('slow', 'Relato inicial')]);
      await new DurableInbox({ canGroup: async () => true, debounceMs: 0, handle: async (_incoming, newer) => {
        await persistIncoming([message('newer', 'Complemento novo')]);
        assert.equal(await newer(), true);
      } }).runOne();
    });

    await t.test('429 preserva a ordem; timeout fica incerto sem travar a próxima saída', async () => {
      await clear();
      const first = await queueOutgoing({ to: '5511999999900', type: 'text', text: { body: 'Primeira' } });
      await queueOutgoing({ to: '5511999999900', type: 'text', text: { body: '❤️❤️❤️' } });
      let attempts = 0;
      const sender = async () => {
        if (++attempts === 1) throw new AxiosError('limited', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 429 } as any);
        return { messages: [{ id: `retry-${attempts}` }] };
      };
      await new DurableOutbox(sender).runOne();
      const pending = await prisma.outgoingMessage.findUniqueOrThrow({ where: { id: first.id } });
      assert.equal(pending.state, 'PENDING'); assert.equal(pending.attempts, 1);
      assert.equal(await new DurableOutbox(sender).runOne(), false, 'segunda aguarda primeira');
      await prisma.outgoingMessage.update({ where: { id: first.id }, data: { availableAt: new Date(0) } });
      await new DurableOutbox(sender).runOne(); assert.equal(attempts, 2);
      const timeout = new DurableOutbox(async payload => {
        assert.deepEqual(payload.text, { body: '❤️❤️❤️' });
        throw new AxiosError('timeout', 'ECONNABORTED');
      });
      await timeout.runOne();
      const uncertain = await prisma.outgoingMessage.findFirstOrThrow({ where: { state: 'UNKNOWN' } });
      assert.equal(uncertain.lastError, 'ECONNABORTED');
      const third = await queueOutgoing({ to: '5511999999900', type: 'text', text: { body: 'Terceira' } });
      assert.equal(await new DurableOutbox(sender).runOne(), true);
      assert.equal((await prisma.outgoingMessage.findUniqueOrThrow({ where: { id: third.id } })).state, 'SENT');
      assert.equal((await prisma.outgoingMessage.findUniqueOrThrow({ where: { id: uncertain.id } })).attempts, 1);
      await resolveQueuedMessage('outbox', uncertain.id, 'skip');
      assert.equal((await prisma.outgoingMessage.findUniqueOrThrow({ where: { id: uncertain.id } })).payload, null);
    });

    await t.test('queda com lease ativo não provoca reenvio automático; DEAD de entrada pode ser revisado', async () => {
      await clear();
      const item = await queueOutgoing({ to: '5511999999900', type: 'text' });
      await prisma.outgoingMessage.update({ where: { id: item.id }, data: { state: 'SENDING', leaseUntil: new Date(0), leaseToken: 'processo-interrompido' } });
      const worker = new DurableOutbox(async () => { assert.fail('envio incerto não pode repetir'); });
      assert.equal(await worker.runOne(), false);
      assert.equal((await prisma.outgoingMessage.findUniqueOrThrow({ where: { id: item.id } })).state, 'UNKNOWN');
      await resolveQueuedMessage('outbox', item.id, 'retry');
      assert.equal((await prisma.outgoingMessage.findUniqueOrThrow({ where: { id: item.id } })).state, 'PENDING');
      await persistIncoming([message('broken', 'Relato')]);
      const record = await prisma.messageReceipt.findUniqueOrThrow({ where: { metaMessageId: 'broken' } });
      await prisma.messageReceipt.update({ where: { id: record.id }, data: { attempts: 4 } });
      await new DurableInbox({ canGroup: async () => false, handle: async () => { throw new Error('SimulatedCrash'); } }).runOne();
      assert.equal((await prisma.messageReceipt.findUniqueOrThrow({ where: { id: record.id } })).state, 'DEAD');
      await resolveQueuedMessage('inbox', record.id, 'retry');
      assert.equal((await prisma.messageReceipt.findUniqueOrThrow({ where: { id: record.id } })).state, 'PENDING');
    });
  } finally { await clear(); await rootPrisma.$disconnect(); }
});
