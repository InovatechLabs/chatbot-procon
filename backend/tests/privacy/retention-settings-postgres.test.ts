import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createRetentionSettingsService } from '../../src/services/privacy/retentionSettings.js';

test('retenção automática: ADMIN, exclusão real, cadência durável, concorrência e revogação', { skip: !process.env.PRIVACY_TEST_DB_NAME }, async () => {
  const name = process.env.PRIVACY_TEST_DB_NAME!;
  assert.match(name, /^procon_privacy_test_[a-z0-9_]+$/);
  const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  const { prisma } = await import('../../src/database/index.js');
  const { createApp } = await import('../../src/app.js');
  const { createAuthService } = await import('../../src/services/auth/authService.js');
  const { hashPassword } = await import('../../src/services/auth/password.js');
  const prefix = randomUUID();
  const password = 'Senha-ficticia-retencao-123';
  const admin = await prisma.panelUser.create({ data: { username: `${prefix}-admin`, role: 'ADMIN', passwordHash: await hashPassword(password) } });
  const attendant = await prisma.panelUser.create({ data: { username: `${prefix}-staff`, role: 'ATTENDANT', passwordHash: await hashPassword(password) } });
  const temporary = await prisma.panelUser.create({ data: { username: `${prefix}-temporary`, role: 'ADMIN', mustChangePassword: true, passwordHash: await hashPassword(password) } });
  const auth = createAuthService(prisma);
  const token = async (username: string) => `procon_session=${(await auth.login(username, password, prefix)).token}`;
  const cookie = await token(admin.username), staffCookie = await token(attendant.username), temporaryCookie = await token(temporary.username);
  const server = createApp(auth, { origins: ['http://localhost:5173'], secure: false }).listen(0, '127.0.0.1');
  await once(server, 'listening'); const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta ausente');
  const request = (method: string, path = '', body?: unknown, session = cookie, origin = 'http://localhost:5173') => fetch(`http://127.0.0.1:${address.port}/api/retention${path}`, {
    method, headers: { Cookie: session, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const service = createRetentionSettingsService(prisma);
  const before = await service.get();
  const receipts: string[] = [], outputs: string[] = [], sessions: string[] = [];
  try {
    const initial = await request('GET'); assert.equal(initial.status, 200); assert.equal(initial.headers.get('cache-control'), 'no-store');
    const value = { sessionsDays: null, appointmentsDays: null, receiptsDays: null, outgoingDays: null, approved: false };
    for (const [method, path] of [['GET', ''], ['PUT', '']]) {
      const body = method === 'GET' ? undefined : { version: before.version, value };
      assert.equal((await request(method!, path, body, '')).status, 401);
      assert.equal((await request(method!, path, body, staffCookie)).status, 403);
      assert.equal((await request(method!, path, body, temporaryCookie)).status, 403);
    }
    assert.equal((await request('PUT', '', { version: before.version, value }, cookie, 'https://invalido.example')).status, 403);
    assert.equal((await request('PUT', '', { version: before.version, value: { ...value, receiptsDays: 0 } })).status, 400);
    assert.equal((await request('PUT', '', { version: before.version, value: { ...value, approved: true } })).status, 400);
    assert.equal((await request('PUT', '', { version: before.version, value: { ...value, receiptsDays: 30 } })).status, 200);
    const saved = await service.get(); assert.equal(saved.receiptsDays, 30); assert.equal(saved.updatedBy, admin.id);
    assert.equal(saved.version, before.version + 1);
    assert.equal((await request('PUT', '', { version: before.version, value })).status, 409);
    assert.equal((await request('POST', '/preview', { version: saved.version })).status, 404, 'simulação removida');
    const old = new Date(Date.now() - 100 * 86400_000);
    const row = await prisma.messageReceipt.create({ data: { phoneNumber: '5511999990081', metaMessageId: `${prefix}-received`, state: 'DONE', processedAt: old } }); receipts.push(row.id);
    const retainedOutput = await prisma.outgoingMessage.create({ data: { phoneNumber: '5511999990081', state: 'SENT', sentAt: old } }); outputs.push(retainedOutput.id);
    assert.equal(await service.runDue(), null, 'sem ativação não há exclusão');
    assert.ok(await prisma.messageReceipt.findUnique({ where: { id: row.id } }));
    process.env.RETENTION_APPROVED = 'true';
    await assert.rejects(service.run(), { status: 403 }); // O env legado não contorna a política.
    assert.equal((await request('PUT', '', { version: saved.version, value: { ...value, receiptsDays: 30, approved: true } })).status, 200);
    const authorized = await service.get();
    const clock = new Date();
    assert.equal((await service.runDue(clock))?.receipts, 1);
    assert.equal(await prisma.messageReceipt.findUnique({ where: { id: row.id } }), null);
    assert.ok(await prisma.outgoingMessage.findUnique({ where: { id: retainedOutput.id } }));
    const metadata = await service.get();
    assert.equal(metadata.lastRunAt?.getTime(), clock.getTime());
    assert.deepEqual(metadata.lastRunCounts, { sessions: 0, appointments: 0, receipts: 1, outgoing: 0 });
    assert.equal(metadata.updatedAt.getTime(), authorized.updatedAt.getTime(), 'a execução não altera a data de edição da política');
    const hourly = await prisma.messageReceipt.create({ data: { phoneNumber: '5511999990081', metaMessageId: `${prefix}-hourly`, state: 'DONE', processedAt: old } }); receipts.push(hourly.id);
    assert.equal(await service.runDue(new Date(clock.getTime() + 3599_000)), null);
    assert.ok(await prisma.messageReceipt.findUnique({ where: { id: hourly.id } }));
    const nextHour = new Date(clock.getTime() + 3600_000);
    const runs = await Promise.allSettled([service.runDue(nextHour), service.runDue(nextHour)]);
    const completed = runs.filter(result => result.status === 'fulfilled' && result.value !== null);
    assert.equal(completed.length, 1, 'somente uma instância executa a limpeza');
    assert.equal(await prisma.messageReceipt.findUnique({ where: { id: hourly.id } }), null);
    assert.equal(await createRetentionSettingsService(prisma).runDue(new Date(nextHour.getTime() + 1)), null, 'nova instância respeita a cadência persistida');
    const version = (await service.get()).version;
    assert.equal((await request('PUT', '', { version, value: { ...value, sessionsDays: 30, receiptsDays: 30, approved: true } })).status, 200);
    const expired = await prisma.userSession.create({ data: { phoneNumber: '5511999990083', updatedAt: new Date(clock.getTime() - 31 * 86400_000) } }); sessions.push(expired.id);
    const fresh = await prisma.userSession.create({ data: { phoneNumber: '5511999990084', updatedAt: new Date(clock.getTime() - 29 * 86400_000) } }); sessions.push(fresh.id);
    const pending = await prisma.userSession.create({ data: { phoneNumber: '5511999990085', updatedAt: new Date(clock.getTime() - 31 * 86400_000) } }); sessions.push(pending.id);
    const waiting = await prisma.messageReceipt.create({ data: { phoneNumber: pending.phoneNumber, metaMessageId: `${prefix}-pending`, state: 'PENDING' } }); receipts.push(waiting.id);
    await prisma.chatLog.create({ data: { phoneNumber: expired.phoneNumber, sessionId: expired.id, direction: 'INBOUND', messageText: 'Histórico fictício vencido' } });
    const cleanup = await service.runDue(new Date(nextHour.getTime() + 60_000));
    assert.equal(cleanup?.sessions, 1, 'editar a política permite aplicar na próxima verificação');
    assert.equal(await prisma.userSession.findUnique({ where: { id: expired.id } }), null);
    assert.equal(await prisma.chatLog.count({ where: { sessionId: expired.id } }), 0);
    for (const id of [fresh.id, pending.id]) assert.ok(await prisma.userSession.findUnique({ where: { id } }));
    // Uma execução que aguardava o lock não pode usar autorização revogada.
    const fenced = await prisma.messageReceipt.create({ data: { phoneNumber: '5511999990082', metaMessageId: `${prefix}-fenced`, state: 'DONE', processedAt: old } }); receipts.push(fenced.id);
    let unlock = () => {}, locked = () => {};
    const gate = new Promise<void>(resolve => { unlock = resolve; });
    const ready = new Promise<void>(resolve => { locked = resolve; });
    const revocation = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(19781119, 1)::text`;
      locked(); await gate;
      await tx.retentionSettings.update({ where: { id: 'main' }, data: { approved: false, version: { increment: 1 } } });
    }, { timeout: 10_000 });
    await ready;
    const execution = service.run().then(() => true, () => false);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 50 && !waiting; attempt++) {
        const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory') AS waiting`;
        waiting = rows[0]?.waiting === true;
        if (!waiting) await delay(20);
      }
      assert.equal(waiting, true, 'execução aguardou a edição da política');
    } finally { unlock(); await revocation; }
    assert.equal(await execution, false);
    assert.ok(await prisma.messageReceipt.findUnique({ where: { id: fenced.id } }));
    const current = await service.get();
    const concurrent = await Promise.all([request('PUT', '', { version: current.version, value }), request('PUT', '', { version: current.version, value })]);
    assert.deepEqual(concurrent.map(item => item.status).sort(), [200, 409]);
    await assert.rejects(service.run(), { status: 403 });
    assert.equal(await service.runDue(), null);
    await prisma.panelUser.update({ where: { id: admin.id }, data: { active: false } });
    await assert.rejects(service.save(admin.id, { version: (await service.get()).version, value }), { status: 403 });
  } finally {
    delete process.env.RETENTION_APPROVED;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.outgoingMessage.deleteMany({ where: { id: { in: outputs } } });
    await prisma.messageReceipt.deleteMany({ where: { id: { in: receipts } } });
    await prisma.userSession.deleteMany({ where: { id: { in: sessions } } });
    await prisma.retentionSettings.update({ where: { id: 'main' }, data: { sessionsDays: before.sessionsDays, appointmentsDays: before.appointmentsDays, receiptsDays: before.receiptsDays, outgoingDays: before.outgoingDays, approved: before.approved, version: before.version, updatedBy: before.updatedBy, lastRunAt: null, lastRunVersion: null, lastRunCounts: {} } });
    await prisma.panelUser.deleteMany({ where: { id: { in: [admin.id, attendant.id, temporary.id] } } });
    await prisma.$disconnect();
  }
});
