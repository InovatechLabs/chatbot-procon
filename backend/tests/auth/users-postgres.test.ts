import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/services/auth/authService.js';
import { bootstrapAdmin, createPanelUserService } from '../../src/services/auth/panelUserService.js';

test('gestão de contas: HTTP, senha temporária, revogação e último ADMIN concorrente', { skip: !process.env.AUTH_TEST_DB_NAME }, async () => {
  const name = process.env.AUTH_TEST_DB_NAME!;
  assert.match(name, /^procon_auth_test_[a-z0-9_]+$/);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${name}`;
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  const db2 = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  const prefix = `gestao-${randomUUID()}`;
  const initialPassword = 'Senha-inicial-teste-123';
  const personalPassword = 'Senha-pessoal-teste-456';
  const auth = createAuthService(db);
  const users = createPanelUserService(db);
  const otherUsers = createPanelUserService(db2);
  const server = createApp(auth, { origins: ['http://localhost:5173'], secure: false }, users).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta ausente');
  const request = (path: string, method = 'GET', cookie = '', body?: unknown, origin = 'http://localhost:5173') => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
    method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = async (username: string, password: string) => {
    const response = await request('/auth/login', 'POST', '', { username, password });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie')!.split(';')[0]!;
  };
  try {
    // Duas inicializações concorrentes não podem criar dois administradores iniciais.
    const boots = await Promise.allSettled([
      bootstrapAdmin(`${prefix}-root`, initialPassword, db),
      bootstrapAdmin(`${prefix}-root2`, initialPassword, db2),
    ]);
    assert.equal(boots.filter(result => result.status === 'fulfilled').length, 1);
    const root = await db.panelUser.findFirstOrThrow({ where: { username: { startsWith: prefix } } });
    const rootCookie = await login(root.username, initialPassword);
    assert.equal((await request('/users')).status, 401);
    assert.equal((await request('/users', 'POST', rootCookie, {}, 'https://invalido.example')).status, 403);
    assert.equal((await request('/users', 'POST', rootCookie, { username: 'x', role: 'ADMIN', password: initialPassword })).status, 400);
    const creation = await request('/users', 'POST', rootCookie, { username: `${prefix}-staff`.toUpperCase(), role: 'ATTENDANT', password: initialPassword });
    assert.equal(creation.status, 201);
    const staff = (await creation.json()).user;
    assert.equal(staff.username, `${prefix}-staff`);
    assert.equal(staff.mustChangePassword, true);
    assert.equal('passwordHash' in staff, false);
    assert.equal((await request('/users', 'POST', rootCookie, { username: staff.username, role: 'ATTENDANT', password: initialPassword })).status, 409);
    const temporaryCookie = await login(staff.username, initialPassword);
    const blocked = await request('/appointments', 'GET', temporaryCookie);
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await request('/auth/password', 'POST', temporaryCookie, { currentPassword: initialPassword, newPassword: initialPassword })).status, 400);
    assert.equal((await request('/auth/password', 'POST', temporaryCookie, { currentPassword: initialPassword, newPassword: personalPassword })).status, 204);
    assert.equal((await request('/auth/me', 'GET', temporaryCookie)).status, 401);
    const staffCookie = await login(staff.username, personalPassword);
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const path = method === 'PATCH' || method === 'DELETE' ? `/users/${root.id}` : '/users';
      assert.equal((await request(path, method, staffCookie, method === 'POST' || method === 'PATCH' ? { role: 'ADMIN' } : undefined)).status, 403);
    }
    assert.equal((await request(`/users/${root.id}`, 'PATCH', rootCookie, { role: 'ATTENDANT' })).status, 409);
    assert.equal((await request(`/users/${root.id}`, 'PATCH', rootCookie, { active: false })).status, 409);
    assert.equal((await request(`/users/${root.id}`, 'DELETE', rootCookie)).status, 409);
    const listed = await (await request('/users', 'GET', rootCookie)).json();
    assert.equal(JSON.stringify(listed).includes('passwordHash'), false);
    assert.equal(JSON.stringify(listed).includes(initialPassword), false);
    assert.equal((await request(`/users/${staff.id}`, 'PATCH', rootCookie, { active: false })).status, 200);
    assert.equal((await request('/auth/me', 'GET', staffCookie)).status, 401);
    assert.equal((await request(`/users/${staff.id}`, 'PATCH', rootCookie, { active: true, username: `${prefix}-renamed` })).status, 200);
    assert.equal((await request('/auth/me', 'GET', staffCookie)).status, 401); // reativar não restaura sessões
    const renamedCookie = await login(`${prefix}-renamed`, personalPassword);
    assert.equal((await request(`/users/${staff.id}/password`, 'POST', rootCookie, { password: initialPassword })).status, 204);
    assert.equal((await request('/auth/me', 'GET', renamedCookie)).status, 401);
    const resetCookie = await login(`${prefix}-renamed`, initialPassword);
    assert.equal((await (await request('/auth/me', 'GET', resetCookie)).json()).user.mustChangePassword, true);
    assert.equal((await request(`/users/${staff.id}/revoke-sessions`, 'POST', rootCookie)).status, 204);
    assert.equal((await request('/auth/me', 'GET', resetCookie)).status, 401);
    const beforeDelete = await login(`${prefix}-renamed`, initialPassword);
    assert.equal((await request(`/users/${staff.id}`, 'DELETE', rootCookie)).status, 204);
    assert.equal((await request('/auth/me', 'GET', beforeDelete)).status, 401);
    assert.equal(await db.panelSession.count({ where: { userId: staff.id } }), 0);
    assert.equal((await request(`/users/${randomUUID()}`, 'DELETE', rootCookie)).status, 404);

    const second = await users.create(root.id, { username: `${prefix}-second`, role: 'ADMIN', password: initialPassword });
    await auth.changePassword(second.id, initialPassword, personalPassword);
    const results = await Promise.allSettled([
      users.update(root.id, root.id, { role: 'ATTENDANT' }),
      otherUsers.update(second.id, second.id, { role: 'ATTENDANT' }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(await db.panelUser.count({ where: { active: true, role: 'ADMIN' } }), 1);
    const remaining = await db.panelUser.findFirstOrThrow({ where: { active: true, role: 'ADMIN' } });
    const demoted = remaining.id === root.id ? second : root;
    await assert.rejects(users.create(demoted.id, { username: `${prefix}-unauthorized`, password: initialPassword, role: 'ADMIN' }), { status: 403 });
    await assert.rejects(users.remove(remaining.id, remaining.id), { status: 409 });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.panelUser.deleteMany({ where: { username: { startsWith: prefix } } });
    await Promise.all([db.$disconnect(), db2.$disconnect()]);
  }
});
