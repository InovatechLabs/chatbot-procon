import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { defaultInstitution } from '../../src/services/institution/settings.js';

test('configuração institucional restringe acesso, valida mensagens e rejeita versões desatualizadas', { skip: !process.env.PRIVACY_TEST_DB_NAME }, async () => {
  const name = process.env.PRIVACY_TEST_DB_NAME!;
  assert.match(name, /^procon_privacy_test_[a-z0-9_]+$/);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  const { prisma } = await import('../../src/database/index.js');
  const { createApp } = await import('../../src/app.js');
  const { createAuthService } = await import('../../src/services/auth/authService.js');
  const { hashPassword } = await import('../../src/services/auth/password.js');
  const prefix = randomUUID();
  const password = 'Senha-ficticia-institucional-123';
  const passwordHash = await hashPassword(password);
  const admin = await prisma.panelUser.create({ data: { username: `${prefix}-admin`, role: 'ADMIN', passwordHash } });
  const staff = await prisma.panelUser.create({ data: { username: `${prefix}-staff`, role: 'ATTENDANT', passwordHash } });
  const auth = createAuthService(prisma);
  const cookie = async (username: string) => `procon_session=${(await auth.login(username, password, prefix)).token}`;
  const adminCookie = await cookie(admin.username);
  const staffCookie = await cookie(staff.username);
  const origin = 'http://localhost:5173';
  const server = createApp(auth, { origins: [origin], secure: false }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const request = (method: string, session: string, body?: unknown) => fetch(`http://127.0.0.1:${address.port}/api/institution`, {
    method,
    headers: { Cookie: session, Origin: origin, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = { ...defaultInstitution(), phone: '(12) 3999-0000', referralMessage: 'Fale com a equipe pelo {{telefone}}.' };
  try {
    assert.equal((await request('GET', '')).status, 401);
    assert.equal((await request('GET', staffCookie)).status, 403);
    assert.equal((await request('PUT', staffCookie, { version: 0, value })).status, 403);
    const initial = await request('GET', adminCookie);
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).version, 0);
    assert.equal((await request('PUT', adminCookie, { version: 0, value: { ...value, referralMessage: 'Use {{cpf}}' } })).status, 400);
    const concurrent = await Promise.all([request('PUT', adminCookie, { version: 0, value }), request('PUT', adminCookie, { version: 0, value })]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    const saved = await (await request('GET', adminCookie)).json();
    assert.equal(saved.version, 1);
    assert.equal(saved.phone, value.phone);
    assert.equal(saved.referralMessage, value.referralMessage);
    assert.equal((await request('PUT', adminCookie, { version: 1, value: { ...value, hours: 'Segunda a sexta' } })).status, 200);
    assert.equal((await request('PUT', adminCookie, { version: 1, value })).status, 409);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.institutionSettings.deleteMany();
    await prisma.panelUser.deleteMany({ where: { id: { in: [admin.id, staff.id] } } });
    await prisma.$disconnect();
  }
});
