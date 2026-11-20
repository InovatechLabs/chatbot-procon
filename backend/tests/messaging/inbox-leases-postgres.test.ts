import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function reached(promise: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Worker não alcançou a etapa esperada')), 10_000); })]); }
  finally { if (timer) clearTimeout(timer); }
}

test('inbox: leases, fencing, CAS e trabalho externo sem transação', { skip: !process.env.MESSAGING_TEST_DB_NAME }, async t => {
  const name = process.env.MESSAGING_TEST_DB_NAME!;
  assert.match(name, /^procon_messaging_test_[a-z0-9_]+$/);
  const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${name}`; process.env.DATABASE_URL = url.toString();
  const { prisma, rootPrisma, isInDatabaseTransaction } = await import('../../src/database/index.js');
  const { DurableInbox, persistIncoming, queueOutgoing } = await import('../../src/services/whatsapp/durableMessages.js');
  const { externalWork } = await import('../../src/services/whatsapp/externalWork.js');
  const { createConversationHandler } = await import('../../src/controllers/webhook/conversation.js');
  const { createRagService } = await import('../../src/services/llm/llmService.js');
  const { decodeSession, initialSnapshot, persistable } = await import('../../src/services/conversation/state.js');
  const phone = '5511999999910';
  const message = (id: string, from = phone) => ({ id, from, type: 'text', text: { body: 'A loja cobrou uma dívida que já paguei' } });
  const clear = async () => {
    await prisma.outgoingMessage.deleteMany(); await prisma.messageReceipt.deleteMany();
    await prisma.sessionFeedback.deleteMany(); await prisma.appointment.deleteMany();
    await prisma.chatLog.deleteMany(); await prisma.userSession.deleteMany();
  };
  const noOpenTransaction = async () => {
    const rows = await rootPrisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'`;
    assert.equal(Number(rows[0]!.count), 0, 'nenhuma transação aguardando I/O');
  };
  try {
    await t.test('mesmo telefone é serializado; outro telefone avança durante a espera sem transação', async () => {
      await clear();
      await persistIncoming([message('slow')]);
      const started = gate(), finish = gate();
      let externalCalls = 0;
      const slow = new DurableInbox({ canGroup: async () => false, handle: async incoming => {
        await queueOutgoing({ to: incoming.from, type: 'text', text: { body: 'Preparação' } });
        await externalWork(['slow', incoming.id], async () => {
          externalCalls++; assert.equal(isInDatabaseTransaction(), false);
          started.release(); await finish.promise; return 'Resultado';
        });
      } });
      const running = slow.runOne();
      try {
        await reached(started.promise);
        assert.equal((await prisma.messageReceipt.findFirstOrThrow()).state, 'PROCESSING');
        assert.equal(await prisma.outgoingMessage.count(), 0, 'preparação desfeita antes da espera');
        await noOpenTransaction();
        await persistIncoming([message('same-phone'), message('other-phone', '5511999999911')]);
        const seen: string[] = [];
        const fast = new DurableInbox({ canGroup: async () => false, handle: async incoming => { seen.push(incoming.id); } });
        assert.equal(await fast.runOne(), true);
        assert.deepEqual(seen, ['other-phone']);
        assert.equal(await fast.runOne(), false, 'mesma conversa aguarda o lease');
        const beforeRenewal = (await prisma.messageReceipt.findUniqueOrThrow({ where: { metaMessageId: 'slow' } })).leaseUntil!;
        await new Promise(resolve => setTimeout(resolve, 21_000));
        const renewed = await prisma.messageReceipt.findUniqueOrThrow({ where: { metaMessageId: 'slow' } });
        assert.ok(renewed.leaseUntil!.getTime() > beforeRenewal.getTime(), 'heartbeat renova durante o trabalho externo');
        await noOpenTransaction();
        finish.release(); assert.equal(await running, true);
        assert.equal(externalCalls, 1, 'resultado externo reutilizado no commit');
        assert.equal(await prisma.outgoingMessage.count(), 1);
        assert.equal(await fast.runOne(), true); assert.deepEqual(seen, ['other-phone', 'same-phone']);
      } finally { finish.release(); await running; }
    });

    await t.test('lease expirado é recuperado; worker antigo não grava nem conclui com token antigo', async () => {
      await clear(); await persistIncoming([message('recover')]);
      const started = gate(), finish = gate();
      const old = new DurableInbox({ canGroup: async () => false, handle: async incoming => {
        await externalWork('old', async () => { started.release(); await finish.promise; return 'antigo'; });
        await queueOutgoing({ to: incoming.from, type: 'text', text: { body: 'antigo' } });
      } });
      const running = old.runOne();
      try {
        await reached(started.promise);
        const claimed = await prisma.messageReceipt.findFirstOrThrow();
        await prisma.messageReceipt.update({ where: { id: claimed.id }, data: { leaseUntil: new Date(0) } });
        let replacementToken: string | null = null;
        const recovered = new DurableInbox({ canGroup: async () => false, handle: async incoming => {
          replacementToken = (await prisma.messageReceipt.findUniqueOrThrow({ where: { id: claimed.id } })).leaseToken;
          await queueOutgoing({ to: incoming.from, type: 'text', text: { body: 'recuperado' } });
        } });
        assert.equal(await recovered.runOne(), true); assert.notEqual(replacementToken, claimed.leaseToken);
        finish.release(); assert.equal(await running, false);
        const receipt = await prisma.messageReceipt.findUniqueOrThrow({ where: { id: claimed.id } });
        assert.equal(receipt.state, 'DONE'); assert.equal(receipt.attempts, 2); assert.equal(receipt.leaseToken, null);
        const outputs = await prisma.outgoingMessage.findMany(); assert.equal(outputs.length, 1);
        assert.equal(JSON.parse(outputs[0]!.payload!).text.body, 'recuperado');
      } finally { finish.release(); await running; }
    });

    await t.test('token vencido é rejeitado mesmo antes de outro worker recuperar', async () => {
      await clear(); await persistIncoming([message('expired')]);
      const started = gate(), finish = gate();
      const running = new DurableInbox({ canGroup: async () => false, handle: async incoming => {
        await externalWork('expire', async () => { started.release(); await finish.promise; });
        await queueOutgoing({ to: incoming.from, type: 'text' });
      } }).runOne();
      try {
        await reached(started.promise);
        await prisma.messageReceipt.updateMany({ data: { leaseUntil: new Date(0) } });
        finish.release(); assert.equal(await running, false);
        assert.equal(await prisma.outgoingMessage.count(), 0);
        assert.equal((await prisma.messageReceipt.findFirstOrThrow()).state, 'PROCESSING');
        assert.equal(await new DurableInbox({ canGroup: async () => false, handle: async () => {} }).runOne(), true);
      } finally { finish.release(); await running; }
    });

    await t.test('mudança da sessão durante a IA aborta o snapshot antigo e permite retry fresco', async () => {
      await clear();
      const session = await prisma.userSession.create({ data: { phoneNumber: phone, ...persistable(initialSnapshot()) } });
      await persistIncoming([message('cas')]);
      const started = gate(), finish = gate();
      const options = { canGroup: async () => false, handle: async () => {
        await externalWork('cas', async () => { started.release(); await finish.promise; });
        await prisma.userSession.update({ where: { id: session.id }, data: { userName: 'Estado antigo' } });
        await queueOutgoing({ to: phone, type: 'text' });
      } };
      const running = new DurableInbox(options).runOne();
      try {
        await reached(started.promise);
        await prisma.userSession.update({ where: { id: session.id }, data: { userName: 'Estado atualizado' } });
        finish.release(); assert.equal(await running, false);
        assert.equal((await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } })).userName, 'Estado atualizado');
        assert.equal(await prisma.outgoingMessage.count(), 0);
        const row = await prisma.messageReceipt.findFirstOrThrow(); assert.equal(row.lastError, 'SessionConflict');
        await prisma.messageReceipt.update({ where: { id: row.id }, data: { availableAt: new Date(0) } });
        assert.equal(await new DurableInbox({ canGroup: async () => false, handle: async () => {
          assert.equal((await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } })).userName, 'Estado atualizado');
          await queueOutgoing({ to: phone, type: 'text' });
        } }).runOne(), true);
        assert.equal(await prisma.outgoingMessage.count(), 1);
      } finally { finish.release(); await running; }
    });

    await t.test('falha diferida no commit final reverte sessão, histórico, eventos e outbox; retry único', async () => {
      await clear(); await persistIncoming([message('commit')]);
      await prisma.$executeRawUnsafe(`CREATE FUNCTION inbox_test_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state = 'DONE' THEN RAISE EXCEPTION 'SimulatedCommitFailure'; END IF; RETURN NEW; END $$`);
      await prisma.$executeRawUnsafe(`CREATE CONSTRAINT TRIGGER inbox_test_commit AFTER UPDATE ON "MessageReceipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inbox_test_fail_commit()`);
      const beforeEvents = await prisma.conversationEvent.count();
      const handler = createConversationHandler({ answer: async () => ({ tipoResposta: 'orientacao_final', artigo: null, texto: 'Teste' }) });
      const options = { canGroup: async () => false, handle: handler };
      try {
        assert.equal(await new DurableInbox(options).runOne(), false);
        assert.equal(await prisma.userSession.count(), 0); assert.equal(await prisma.chatLog.count(), 0);
        assert.equal(await prisma.conversationEvent.count(), beforeEvents); assert.equal(await prisma.outgoingMessage.count(), 0);
        assert.equal((await prisma.messageReceipt.findFirstOrThrow()).state, 'PENDING');
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER inbox_test_commit ON "MessageReceipt"');
        await prisma.$executeRawUnsafe('DROP FUNCTION inbox_test_fail_commit()');
      }
      await prisma.messageReceipt.updateMany({ data: { availableAt: new Date(0) } });
      assert.equal(await new DurableInbox(options).runOne(), true);
      assert.equal(await prisma.outgoingMessage.count(), 2); assert.equal(await prisma.userSession.count(), 1);
      assert.equal(await new DurableInbox(options).runOne(), false); assert.equal(await prisma.outgoingMessage.count(), 2);
    });

    await t.test('lote abandonado é retomado inteiro; esgotamento por quedas vai para DEAD', async () => {
      await clear(); await persistIncoming([message('batch1'), message('batch2')]);
      await prisma.messageReceipt.updateMany({ data: { state: 'PROCESSING', leaseToken: 'abandoned', leaseUntil: new Date(0), attempts: 1 } });
      let received = '';
      assert.equal(await new DurableInbox({ canGroup: async () => false, handle: async incoming => { received = incoming.text!.body; } }).runOne(), true);
      assert.equal(received.split('\n').length, 2); assert.equal(await prisma.messageReceipt.count({ where: { state: 'DONE' } }), 2);
      await clear(); await persistIncoming([message('exhausted')]);
      await prisma.messageReceipt.updateMany({ data: { state: 'PROCESSING', leaseToken: 'abandoned', leaseUntil: new Date(0), attempts: 5 } });
      assert.equal(await new DurableInbox({ canGroup: async () => false, handle: async () => { assert.fail('não executa tentativa adicional'); } }).runOne(), false);
      assert.equal((await prisma.messageReceipt.findFirstOrThrow()).state, 'DEAD');
    });

    await t.test('classificação, embedding e geração reais do adaptador usam HTTP fora da transação', async () => {
      await clear();
      const priorGenerate = process.env.OLLAMA_GENERATE_URL, priorEmbed = process.env.OLLAMA_EMBED_URL;
      const requests: string[] = [];
      const settings = { model: 'teste:primeiro', thinkingEnabled: true };
      const nextSettings = { model: 'teste:segundo', thinkingEnabled: false };
      let failModel = false;
      const officialText = 'Guarde os comprovantes e procure o PROCON.';
      let serverError: unknown;
      const server = createServer(async (req, res) => {
        try {
          await noOpenTransaction();
          let raw = ''; for await (const chunk of req) raw += chunk;
          const payload = JSON.parse(raw);
          requests.push(req.url === '/embed' ? 'embedding' : payload.format?.properties?.categoria ? 'classification' : payload.format ? 'generation' : 'rewrite');
          if (req.url === '/embed') {
            assert.equal(payload.model, process.env.OLLAMA_EMBEDDING_MODEL_NAME);
            assert.equal(payload.think, undefined);
          } else {
            const expected = payload.format && !failModel ? settings : nextSettings;
            assert.equal(payload.model, expected.model);
            assert.equal(payload.think, expected.thinkingEnabled);
          }
          if (failModel) { res.statusCode = 503; res.end('{}'); return; }
          if (payload.format?.properties?.categoria) {
            // A próxima mensagem recebe a alteração; a geração desta conserva a
            // configuração da classificação, mesmo passando pelo rollback.
            await rootPrisma.aiSettings.update({ where: { id: 'main' }, data: { ...nextSettings, version: 2 } });
          }
          if (payload.format && !payload.format.properties?.categoria) assert.ok(payload.prompt.includes('REGRAS_AUXILIARES_JSON'));
          const response = req.url === '/embed' ? { embedding: [0.1, 0.2] } : !payload.format ? { response: officialText } : { response: JSON.stringify(payload.format?.properties?.categoria
            ? { categoria: 'CONSUMO', motivo: 'Cobrança já paga', consultaBusca: 'cobrança indevida', perguntaEsclarecimento: null }
            : { tipoResposta: 'orientacao_final', artigo: 'Art. 42', texto: 'Guarde o comprovante e solicite a revisão da cobrança à empresa.' }) };
          res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(response));
        } catch (error) { serverError = error; res.statusCode = 500; res.end('{}'); }
      });
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      const address = server.address(); assert.ok(address && typeof address === 'object');
      process.env.OLLAMA_GENERATE_URL = `http://127.0.0.1:${address.port}/generate`;
      process.env.OLLAMA_EMBED_URL = `http://127.0.0.1:${address.port}/embed`;
      try {
        await prisma.aiSettings.create({ data: { ...settings, id: 'main', version: 1 } });
        const answer = createRagService({ vectors: async () => [{ id: 'Art. 42', distance: 0.1 }], articles: async () => [{ id: 'Art. 42', title: 'Art. 42 - Cobrança de dívidas', content: 'O consumidor pode questionar cobrança indevida.', keywords: ['cobrança'], distincao: null }] });
        await persistIncoming([message('rag-http')]);
        assert.equal(await new DurableInbox({ canGroup: async () => false, handle: createConversationHandler({
          answer: (question, session, options) => answer(question, session, { ...options, legalRulesMode: 'preview', includeDiagnostics: true }),
        }) }).runOne(), true);
        if (serverError) throw serverError;
        assert.deepEqual(requests, ['classification', 'embedding', 'generation'], 'nenhuma chamada ao modelo é repetida nas preparações');
        assert.equal(decodeSession(await prisma.userSession.findFirstOrThrow()).snapshot.state.kind, 'POST_ANSWER');
        assert.equal(await prisma.outgoingMessage.count(), 2); assert.equal((await prisma.messageReceipt.findFirstOrThrow()).state, 'DONE');
        await clear(); requests.length = 0;
        const { generateOrientativeResponse } = await import('../../src/services/llm/llmService.js');
        await persistIncoming([message('menu-rewrite')]);
        assert.equal(await new DurableInbox({ canGroup: async () => false, handle: async (_message, _hasNewer, generation) => {
          const text = await generateOrientativeResponse('Menu de dúvidas', officialText, generation);
          assert.ok(text.startsWith(officialText));
          await queueOutgoing({ to: phone, type: 'text', text: { body: text } });
        } }).runOne(), true);
        assert.deepEqual(requests, ['rewrite']); assert.equal(await prisma.outgoingMessage.count(), 1);
        await clear(); requests.length = 0; failModel = true;
        await persistIncoming([message('model-failure')]);
        assert.equal(await new DurableInbox({ canGroup: async () => false, handle: createConversationHandler({ answer }) }).runOne(), true);
        assert.deepEqual(requests, ['classification']);
        assert.equal((await prisma.messageReceipt.findFirstOrThrow()).state, 'DONE');
        assert.ok((await prisma.outgoingMessage.findMany()).some(row => JSON.parse(row.payload!).interactive?.body?.text?.includes('temporariamente indisponível')));
        if (serverError) throw serverError;
      } finally {
        await prisma.aiSettings.deleteMany({ where: { id: 'main' } });
        process.env.OLLAMA_GENERATE_URL = priorGenerate; process.env.OLLAMA_EMBED_URL = priorEmbed;
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    });
  } finally { await clear(); await rootPrisma.$disconnect(); }
});
