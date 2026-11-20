import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import axios from 'axios';
import type { MetaPayload } from '../../src/services/whatsapp/outgoingContext.js';

test('atendimento humano por HTTP e filas: disputa, áudio autorizado, autoria, janela, entrega e devolução', { skip: !process.env.PRIVACY_TEST_DB_NAME }, async t => {
  const dbName = process.env.PRIVACY_TEST_DB_NAME!;
  assert.match(dbName, /^procon_privacy_test_[a-z0-9_]+$/);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  process.env.HUMAN_HANDOFF_ENABLED = 'true';
  const { prisma } = await import('../../src/database/index.js');
  const { createApp } = await import('../../src/app.js');
  const { createAuthService } = await import('../../src/services/auth/authService.js');
  const { hashPassword } = await import('../../src/services/auth/password.js');
  const { lookupHash } = await import('../../src/services/privacy/crypto.js');
  const { createConversationHandler } = await import('../../src/controllers/webhook/conversation.js');
  const { DurableInbox, DurableOutbox, persistIncoming, queueOutgoing } = await import('../../src/services/whatsapp/durableMessages.js');
  const { externalWork } = await import('../../src/services/whatsapp/externalWork.js');
  const { LEAVE_QUEUE_OPTION } = await import('../../src/services/conversation/handoff.js');
  const phone = '5511999976520', phoneLookup = lookupHash('phoneNumber', phone);
  const parallelPhones = ['5511999976521', '5511999976522'] as const;
  const fixturePhones = [phoneLookup, ...parallelPhones.map(number => lookupHash('phoneNumber', number))];
  process.env.HUMAN_HANDOFF_TEST_PHONE = phone;
  const auth = createAuthService(prisma);
  const password = 'Fixture-Atendente-123456';
  const operators = await Promise.all(['a', 'b'].map(async name => prisma.panelUser.create({ data: {
    username: `fixture-handoff-${name}`, displayName: `Atendente ${name.toUpperCase()}`, role: 'ATTENDANT', passwordHash: await hashPassword(password),
  } })));
  const cookies = await Promise.all(operators.map(async user => `procon_session=${(await auth.login(user.username, password, user.id)).token}`));
  const origin = 'http://localhost:5173';
  const server = createApp(auth, { origins: [origin], secure: false }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const call = (path: string, who: string, body?: unknown) => fetch(`${base}/conversations${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { Cookie: who, Origin: origin, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let modelCalls = 0;
  let started = () => {}, resume = () => {};
  const startedGate = new Promise<void>(resolve => { started = resolve; });
  const resumeGate = new Promise<void>(resolve => { resume = resolve; });
  const handle = createConversationHandler({ answer: async text => {
    if (text === 'Relato antes da transferência') await externalWork('handoff-stale-fixture', async () => { started(); await resumeGate; });
    else modelCalls++;
    return { tipoResposta: 'fixa', artigo: null, texto: 'Resposta fictícia do bot.' };
  } });
  const inbox = new DurableInbox({ handle, canGroup: async () => false });
  let stream: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let startStepId: string | undefined;
  let buffer = '';
  const decoder = new TextDecoder();
  const readEvent = async (event: string) => {
    for (;;) {
      const index = buffer.indexOf('\n\n');
      if (index >= 0) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (frame.startsWith(`event: ${event}\n`)) return JSON.parse(frame.split('\ndata: ')[1]!);
      } else {
        const chunk = await stream!.read();
        assert.equal(chunk.done, false, `esperava evento ${event}`);
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    }
  };
  const inbound = async (body: string, date = Date.now(), from = phone) => {
    const message = { id: randomUUID(), from, type: 'text', timestamp: String(Math.floor(date / 1000)), text: { body } };
    await persistIncoming([message]);
    assert.equal(await inbox.runOne(), true);
    return message;
  };
  try {
    assert.equal((await call('', '')).status, 401);
    assert.equal((await call('/events', '')).status, 401);
    const updates = await fetch(`${base}/conversations/events`, { headers: { Cookie: cookies[0]! }, signal: AbortSignal.timeout(30_000) });
    assert.match(updates.headers.get('content-type') ?? '', /text\/event-stream/);
    stream = updates.body!.getReader();
    assert.equal((await readEvent('refresh')).waiting, 0);
    const message = (body: string) => ({ id: randomUUID(), from: phone, type: 'text', timestamp: String(Math.floor(Date.now() / 1000)), text: { body } });
    await persistIncoming([message('Relato antes da transferência')]);
    const slow = inbox.runOne();
    try {
      await Promise.race([startedGate, slow.then(() => assert.fail('O processamento externo não iniciou'))]);
      await persistIncoming([message('atendente')]);
    } finally { resume(); }
    assert.equal(await slow, true);
    assert.equal(await prisma.outgoingMessage.count({ where: { phoneLookup } }), 0, 'resposta anterior ao pedido não foi enfileirada');
    const botList = await (await call('/bot', cookies[0]!)).json();
    assert.equal(botList.items.length, 1);
    const botPath = `/bot/${botList.items[0].id}/messages`;
    const botHistory = await call(botPath, cookies[0]!);
    assert.equal(botHistory.status, 200);
    assert.equal((await botHistory.json()).items[0].text, 'Relato antes da transferência');
    assert.equal(await inbox.runOne(), true);
    assert.equal((await readEvent('refresh')).waiting, 1);
    assert.equal((await call(botPath, cookies[0]!)).status, 404, 'a visualização do bot não acompanha a conversa depois da transferência');
    const list = await (await call('', cookies[0]!)).json();
    assert.equal(list.items.length, 1);
    assert.ok(!JSON.stringify(list).includes(phoneLookup));
    assert.ok(!JSON.stringify(list).includes(phone));
    const item = list.items[0], path = `/${item.id}`;
    const fixtureMedia = '1234567812345678';
    const voice = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{
      id: randomUUID(), from: phone, timestamp: String(Math.floor(Date.now() / 1000)), type: 'audio', audio: { id: fixtureMedia, mime_type: 'audio/ogg; codecs=opus' },
    }] } }] }] });
    const voiceSignature = createHmac('sha256', process.env.META_APP_SECRET!).update(voice).digest('hex');
    assert.equal((await fetch(`${base}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': `sha256=${voiceSignature}` }, body: voice })).status, 200);
    assert.equal(await inbox.runOne(), true);
    const waitingHistory = await (await call(`${path}/messages`, cookies[0]!)).json();
    assert.ok(!JSON.stringify(waitingHistory).includes(fixtureMedia));
    const voiceMessage = waitingHistory.items.find((row: { hasAudio?: boolean }) => row.hasAudio);
    assert.ok(voiceMessage, 'áudio da fila aparece no histórico');
    const voicePath = `${path}/messages/${voiceMessage.id}/audio`;
    const stored = await prisma.$queryRaw<{ audioMediaId: string }[]>`SELECT "audioMediaId" FROM "ChatLog" WHERE "id" = ${voiceMessage.id}`;
    assert.match(stored[0]!.audioMediaId, /^enc:v1:/);
    const oldBot = await queueOutgoing({ to: phone, type: 'text', text: { body: 'Resposta anterior' } });
    await prisma.outgoingMessage.update({ where: { id: oldBot.id }, data: { state: 'SENDING', leaseUntil: new Date(Date.now() + 60_000) } });
    assert.equal((await call(`${path}/claim`, cookies[0]!, { version: item.version })).status, 409);
    await prisma.outgoingMessage.update({ where: { id: oldBot.id }, data: { state: 'SKIPPED', leaseUntil: null, payload: null } });
    const attempts = await Promise.all(cookies.map(cookie => call(`${path}/claim`, cookie, { version: item.version })));
    assert.deepEqual(attempts.map(response => response.status).sort(), [200, 409]);
    const winner = attempts.findIndex(response => response.status === 200);
    const owner = cookies[winner]!, other = cookies[1 - winner]!;
    const active = await attempts[winner]!.json();
    assert.equal(active.assigneeId, operators[winner]!.id);
    assert.equal(active.noticeQueued, true);
    const claimNotice = new DurableOutbox(async payload => {
      assert.equal(payload.to, phone);
      assert.match((payload.text as { body: string }).body, /assumiu a conversa/);
      return { messages: [{ id: 'fixture-meta-claim-notice' }] };
    });
    assert.equal(await claimNotice.runOne(), true);
    assert.equal((await call(`${path}/messages`, other)).status, 403);
    const fakeAudio = Buffer.from('OggS-test');
    let graphRequests = 0;
    let allowHost = false;
    const meta = t.mock.method(axios, 'get', async (url: string) => {
      graphRequests++;
      if (url.startsWith('https://graph.facebook.com/')) return { data: {
        url: allowHost ? 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=test' : 'https://example.invalid/audio',
        mime_type: 'audio/ogg; codecs=opus', file_size: fakeAudio.length,
      } };
      return { data: fakeAudio };
    });
    try {
      assert.equal((await call(voicePath, '')).status, 401);
      assert.equal((await call(voicePath, other)).status, 403);
      assert.equal((await call(`${path}/messages/${randomUUID()}/audio`, owner)).status, 404);
      assert.equal(graphRequests, 0, 'solicitações sem autorização não consultam a Meta');
      assert.equal((await call(voicePath, owner)).status, 502);
      assert.equal(graphRequests, 1, 'a URL de fora da Meta nunca é consultada');
      allowHost = true;
      const playback = await call(voicePath, owner);
      assert.equal(playback.status, 200);
      assert.equal(playback.headers.get('content-type'), 'audio/ogg');
      assert.equal(playback.headers.get('cache-control'), 'no-store');
      assert.deepEqual(Buffer.from(await playback.arrayBuffer()), fakeAudio);
    } finally { meta.mock.restore(); }
    await stream.cancel();
    buffer = '';
    const focused = await fetch(`${base}/conversations/events?selected=${item.id}`, { headers: { Cookie: owner }, signal: AbortSignal.timeout(30_000) });
    stream = focused.body!.getReader();
    assert.equal((await readEvent('refresh')).waiting, 0);
    const input = { version: active.version, requestId: randomUUID(), text: 'Olá, sou da equipe do PROCON.' };
    assert.equal((await call(`${path}/messages`, other, input)).status, 403);
    const queued = await call(`${path}/messages`, owner, input);
    assert.equal(queued.status, 202);
    const reply = await queued.json();
    assert.equal((await (await call(`${path}/messages`, owner, input)).json()).id, reply.id);
    assert.equal((await call(`${path}/messages`, owner, { ...input, text: 'outro texto' })).status, 409);
    assert.equal(await prisma.outgoingMessage.count({ where: { phoneLookup, humanAuthored: true } }), 1);
    const update = await readEvent('refresh');
    assert.deepEqual(Object.keys(update).sort(), ['latestRequestedAt', 'waiting']);
    assert.equal((await call(`${path}/return`, owner, { version: active.version })).status, 409);
    const outbox = new DurableOutbox(async payload => {
      assert.equal((payload.text as { body: string }).body, `*${operators[winner]!.displayName}*\n\n${input.text}`);
      const event = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { statuses: [
        { id: 'fixture-meta-human', status: 'read', biz_opaque_callback_data: payload.biz_opaque_callback_data },
        { id: 'fixture-meta-human', status: 'delivered' },
      ] } }] }] });
      const signature = createHmac('sha256', process.env.META_APP_SECRET!).update(event).digest('hex');
      const response = await fetch(`${base}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': `sha256=${signature}` }, body: event });
      assert.equal(response.status, 200);
      return { messages: [{ id: 'fixture-meta-human' }] };
    });
    assert.equal(await outbox.runOne(), true);
    const history = await (await call(`${path}/messages`, owner)).json();
    const sent = history.items.find((message: { id: string }) => message.id === reply.id);
    assert.equal(sent.authorName, operators[winner]!.displayName);
    assert.equal(sent.delivery.state, 'SENT'); assert.equal(sent.delivery.deliveryStatus, 'read');
    assert.ok(history.items.some((message: { author: string }) => message.author === 'BOT'));
    await prisma.messageReceipt.updateMany({ where: { phoneLookup }, data: { sourceAt: new Date(0) } });
    const delayed = await inbound('mensagem antiga que chegou atrasada', Date.now() - 25 * 60 * 60_000);
    await persistIncoming([{ ...delayed, timestamp: String(Math.floor(Date.now() / 1000)) }]);
    const next = { ...input, requestId: randomUUID() };
    assert.equal((await call(`${path}/messages`, owner, next)).status, 409);
    await inbound('Ainda preciso de ajuda.');
    assert.equal(modelCalls, 0);
    assert.equal((await call(`${path}/messages`, owner, next)).status, 202);
    await prisma.messageReceipt.updateMany({ where: { phoneLookup }, data: { sourceAt: new Date(0) } });
    const expired = new DurableOutbox(async () => assert.fail('Texto expirado não chega à Meta'));
    assert.equal(await expired.runOne(), true);
    assert.equal(await prisma.outgoingMessage.count({ where: { phoneLookup, lastError: 'WindowExpired' } }), 1);
    const returnExpired = await call(`${path}/return`, owner, { version: active.version });
    assert.equal(returnExpired.status, 200);
    assert.equal((await returnExpired.json()).noticeQueued, false);
    await inbound('Minha televisão queimou no primeiro dia.');
    assert.equal(modelCalls, 1);
    await inbound('atendente');
    const reopened = (await (await call('', owner)).json()).items[0];
    assert.equal(reopened.status, 'WAITING');
    assert.equal(reopened.id, item.id);
    const claimedAgain = await (await call(`${path}/claim`, owner, { version: reopened.version })).json();
    assert.equal((await call(`${path}/close`, owner, { version: claimedAgain.version })).status, 200);
    await stream.cancel();
    stream = undefined;
    delete process.env.HUMAN_HANDOFF_TEST_PHONE;
    await inbound('atendente', Date.now(), parallelPhones[0]);
    await inbound('atendente', Date.now(), parallelPhones[1]);
    const queue = await (await call('?view=waiting', cookies[0]!)).json();
    assert.equal(queue.items.length, 2);
    for (const [index, number] of parallelPhones.entries()) {
      const logs = await prisma.chatLog.findMany({ where: { phoneNumber: number, direction: 'OUTBOUND' } });
      assert.ok(logs.some(log => log.messageText.includes(`Posição na fila: ${index + 1}`)));
    }
    const claimParallel = async (index: number) => {
      const pending = queue.items[index];
      const res = await call(`/${pending.id}/claim`, cookies[index]!, { version: pending.version });
      assert.equal(res.status, 200);
      return res.json();
    };
    const first = await claimParallel(0);
    await inbound('posição', Date.now(), parallelPhones[1]);
    assert.ok(await prisma.chatLog.findFirst({ where: { phoneNumber: parallelPhones[1], direction: 'OUTBOUND' }, orderBy: { timestamp: 'desc' } }).then(log => log?.messageText.includes('fila é *1*')));
    const second = await claimParallel(1);
    const activePair = [first, second];
    for (const [index, ticket] of activePair.entries()) assert.equal(ticket.assigneeId, operators[index]!.id);
    const notices = new DurableOutbox(async () => ({ messages: [{ id: randomUUID() }] }));
    assert.equal(await notices.runOne(), true);
    assert.equal(await notices.runOne(), true);
    const pairReplies = await Promise.all(activePair.map((ticket, index) => call(`/${ticket.id}/messages`, cookies[index]!, {
      version: ticket.version, requestId: randomUUID(), text: `Resposta ${index + 1}`,
    })));
    assert.deepEqual(pairReplies.map(response => response.status), [202, 202]);
    let startSend = () => {}, finishSend = () => {};
    const sending = new Promise<void>(resolve => { startSend = resolve; });
    const finish = new Promise<void>(resolve => { finishSend = resolve; });
    const recipients: string[] = [];
    const transport = async (payload: MetaPayload) => {
      const index = parallelPhones.findIndex(number => number === payload.to);
      assert.ok(index >= 0);
      assert.equal((payload.text as { body: string }).body, `*${operators[index]!.displayName}*\n\nResposta ${index + 1}`);
      recipients.push(payload.to);
      if (recipients.length === 1) { startSend(); await finish; }
      return { messages: [{ id: randomUUID() }] };
    };
    const firstSend = new DurableOutbox(transport).runOne();
    try {
      await Promise.race([sending, firstSend.then(() => assert.fail('O primeiro envio não ficou em andamento'))]);
      assert.equal(await new DurableOutbox(transport).runOne(), true);
      assert.equal(new Set(recipients).size, 2);
    } finally { finishSend(); await firstSend; }
    assert.equal(await prisma.outgoingMessage.count({ where: { phoneLookup: { in: fixturePhones.slice(1) }, state: 'SENT', humanAuthored: true } }), 2);
    const returned = await call(`/${first.id}/return`, cookies[0]!, { version: first.version });
    assert.equal(returned.status, 200);
    assert.equal((await returned.json()).noticeQueued, true);
    assert.equal(await new DurableOutbox(async payload => {
      assert.equal(payload.to, parallelPhones[0]);
      assert.match((payload.text as { body: string }).body, /voltou a conversar com o assistente virtual/);
      return { messages: [{ id: 'fixture-meta-return-notice' }] };
    }).runOne(), true);
    const selectLeave = async (from: string) => {
      await persistIncoming([{ ...message(''), from, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: LEAVE_QUEUE_OPTION.id } } }]);
      assert.equal(await inbox.runOne(), true);
    };
    await selectLeave(parallelPhones[1]);
    const stillActive = await (await call(`/${second.id}/messages`, cookies[1]!)).json();
    assert.equal(stillActive.ticket.status, 'ACTIVE', 'botão antigo não encerra um atendimento em andamento');
    await inbound('atendente', Date.now(), parallelPhones[0]);
    const timeout = new DurableOutbox(async () => { throw new Error('SimulatedTimeout'); });
    assert.equal(await timeout.runOne(), true);
    const waitingLog = await prisma.chatLog.findFirstOrThrow({ where: { phoneNumber: parallelPhones[0], direction: 'OUTBOUND' }, orderBy: { timestamp: 'desc' } });
    assert.ok(waitingLog.messageText.includes('sair da fila'));
    const startStep = await prisma.step.create({ data: { isStart: true, title: 'Menu de teste', message: 'Escolha uma opção do menu.' } });
    startStepId = startStep.id;
    const option = await prisma.option.create({ data: { stepId: startStep.id, text: 'Entender um direito' } });
    await selectLeave(parallelPhones[0]);
    assert.equal((await (await call('?view=waiting', cookies[0]!)).json()).items.length, 0);
    const menu = await prisma.chatLog.findFirstOrThrow({ where: { phoneNumber: parallelPhones[0], direction: 'OUTBOUND' }, orderBy: { timestamp: 'desc' } });
    assert.match(menu.messageText, /^Você saiu da fila de atendimento por chat\./);
    let menuSent = false;
    assert.equal(await new DurableOutbox(async payload => {
      menuSent = payload.to === parallelPhones[0] && payload.type === 'interactive' && JSON.stringify(payload).includes('Você saiu da fila') && JSON.stringify(payload).includes(option.id);
      return { messages: [{ id: 'fixture-meta-cancel-menu' }] };
    }).runOne(), true);
    assert.equal(menuSent, true, 'envio incerto anterior não impede o menu');
    const revoked = await fetch(`${base}/conversations/events`, { headers: { Cookie: owner }, signal: AbortSignal.timeout(15_000) });
    stream = revoked.body!.getReader(); buffer = '';
    await readEvent('refresh');
    await auth.logout(owner.split('=')[1]);
    assert.equal((await readEvent('access-changed')).reason, 'session');
  } finally {
    await stream?.cancel().catch(() => {});
    await new Promise<void>(resolve => server.close(() => resolve()));
    const where = { phoneLookup: { in: fixturePhones } };
    await prisma.userSession.deleteMany({ where });
    if (startStepId) {
      await prisma.option.deleteMany({ where: { stepId: startStepId } });
      await prisma.step.delete({ where: { id: startStepId } });
    }
    await prisma.outgoingMessage.deleteMany({ where });
    await prisma.messageReceipt.deleteMany({ where });
    await prisma.humanHandoff.deleteMany({ where });
    await prisma.panelUser.deleteMany({ where: { id: { in: operators.map(user => user.id) } } });
    await prisma.$disconnect();
  }
});
