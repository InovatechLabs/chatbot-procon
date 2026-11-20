import test from 'node:test';
import assert from 'node:assert/strict';

test('inbox durável confirma o canal, abre fila uma vez e pausa o bot', { skip: !process.env.PRIVACY_TEST_DB_NAME }, async () => {
  const name = process.env.PRIVACY_TEST_DB_NAME!;
  assert.match(name, /^procon_privacy_test_[a-z0-9_]+$/);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  const { prisma } = await import('../../src/database/index.js');
  const { createConversationHandler } = await import('../../src/controllers/webhook/conversation.js');
  const { DurableInbox, persistIncoming } = await import('../../src/services/whatsapp/durableMessages.js');
  const { CHAT_OPTION, IN_PERSON_OPTION, waitingForHuman } = await import('../../src/services/conversation/handoff.js');
  const { lookupHash } = await import('../../src/services/privacy/crypto.js');
  const { retentionPlan } = await import('../../src/services/privacy/retention.js');
  const phone = '5511999976510', other = '5511999976511', semantic = '5511999976512', direct = '5511999976513';
  const hashes = [phone, other, semantic, direct].map(value => lookupHash('phoneNumber', value));
  let classifications = 0;
  const handler = createConversationHandler({ handoffEnabled: () => true, pending: async () => null,
    answer: async () => { classifications++; return { tipoResposta: 'fixa', artigo: null, texto: '', atendimento: 'chat' }; },
  });
  const inbox = new DurableInbox({ handle: handler, canGroup: async () => false });
  let sequence = 0;
  const text = async (body: string, from = phone) => {
    await persistIncoming([{ id: `handoff-fixture-${++sequence}`, from, type: 'text', text: { body } }]);
    assert.equal(await inbox.runOne(), true);
  };
  const choose = async (id: string, from = phone) => {
    await persistIncoming([{ id: `handoff-fixture-${++sequence}`, from, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id } } }]);
    assert.equal(await inbox.runOne(), true);
  };
  try {
    await choose(CHAT_OPTION.id); // Botão avulso ou expirado não abre fila.
    assert.equal(await waitingForHuman(prisma, phone), null);
    await text('quero atendimento');
    assert.equal(await waitingForHuman(prisma, phone), null);
    const prior = await prisma.outgoingMessage.count({ where: { phoneLookup: hashes[0]!, state: 'PENDING' } });
    assert.ok(prior > 0);
    await choose(CHAT_OPTION.id);
    assert.ok(await waitingForHuman(prisma, phone));
    assert.equal(await prisma.outgoingMessage.count({ where: { phoneLookup: hashes[0]!, state: 'PENDING' } }), 1);
    assert.equal(await prisma.outgoingMessage.count({ where: { phoneLookup: hashes[0]!, state: 'SKIPPED' } }), prior);
    await text('atendente');
    await text('menu');
    assert.equal(classifications, 0);
    assert.equal(await prisma.outgoingMessage.count({ where: { phoneLookup: hashes[0]!, state: 'PENDING' } }), 1);
    const session = await prisma.userSession.findFirstOrThrow({ where: { phoneNumber: phone } });
    await prisma.userSession.update({ where: { id: session.id }, data: { updatedAt: new Date(0) } });
    await prisma.outgoingMessage.updateMany({ where: { phoneLookup: hashes[0]!, state: 'PENDING' }, data: { state: 'SENT', payload: null, sentAt: new Date() } });
    await retentionPlan(prisma, { sessionsDays: 1 }, true);
    assert.ok(await prisma.userSession.findUnique({ where: { id: session.id } }));
    await text('Ainda estou aguardando.');
    assert.equal(classifications, 0);
    await text('quero atendimento', other);
    await choose(IN_PERSON_OPTION.id, other);
    assert.equal(await waitingForHuman(prisma, other), null);
    assert.match((await prisma.userSession.findFirstOrThrow({ where: { phoneNumber: other } })).stepState!, /SCHEDULE_CATEGORY/);
    await text('Uma pessoa da equipe poderia continuar a conversa?', semantic);
    assert.equal(classifications, 1);
    assert.ok(await waitingForHuman(prisma, semantic));
    await text('passa pra um atendente falar comigo', direct);
    assert.equal(classifications, 1);
    assert.ok(await waitingForHuman(prisma, direct));
  } finally {
    await prisma.outgoingMessage.deleteMany({ where: { phoneLookup: { in: hashes } } });
    await prisma.messageReceipt.deleteMany({ where: { phoneLookup: { in: hashes } } });
    await prisma.humanHandoff.deleteMany({ where: { phoneLookup: { in: hashes } } });
    await prisma.userSession.deleteMany({ where: { phoneLookup: { in: hashes } } });
    await prisma.$disconnect();
  }
});
