import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../../src/app.js';
import { createAuthService, tokenHash } from '../../src/services/auth/authService.js';
import { hashPassword, verifyPassword } from '../../src/services/auth/password.js';
import { authConfig } from '../../src/routes/auth/auth.js';

const password = 'Senha-ficticia-para-testes-123';
const originalHash = await hashPassword(password);
test('configuração de produção exige origem HTTPS explícita e exata', () => {
  const previousMode = process.env.NODE_ENV;
  const previousOrigins = process.env.PANEL_ORIGINS;
  try {
    process.env.NODE_ENV = 'production';
    for (const origin of ['', 'http://painel.example', 'https://painel.example/caminho', '*']) {
      process.env.PANEL_ORIGINS = origin;
      assert.throws(() => authConfig());
    }
    process.env.PANEL_ORIGINS = 'https://painel.example';
    assert.deepEqual(authConfig(), { origins: ['https://painel.example'], secure: true });
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousOrigins === undefined) delete process.env.PANEL_ORIGINS; else process.env.PANEL_ORIGINS = previousOrigins;
  }
});
function fixture(role = 'ADMIN') {
  let date = new Date();
  const user: any = { id: 'user', username: 'operador', passwordHash: originalHash, active: true, role };
  const sessions = new Map<string, any>();
  const attempts = new Map<string, any>();
  const matches = (row: any, where: any): boolean => Object.entries(where).every(([key, value]: any) => {
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    if (value && typeof value === 'object' && 'lt' in value) return row[key] < value.lt;
    return row[key] === value;
  });
  const db: any = {
    panelUser: {
      findUnique: async ({ where }: any) => matches(user, where) ? { ...user } : null,
      updateMany: async ({ where, data }: any) => { if (!matches(user, where)) return { count: 0 }; Object.assign(user, data); return { count: 1 }; },
    },
    panelSession: {
      findUnique: async ({ where }: any) => { const session = sessions.get(where.tokenHash); return session ? { ...session, user: { ...user } } : null; },
      create: async ({ data }: any) => { sessions.set(data.tokenHash, data); return data; },
      deleteMany: async ({ where }: any) => { let count = 0; for (const [key, row] of sessions) if (matches(row, where)) { sessions.delete(key); count++; } return { count }; },
    },
    panelLoginAttempt: {
      upsert: async ({ where, create }: any) => { const value = attempts.get(where.key) ?? { ...create, count: 0 }; value.count++; attempts.set(where.key, value); return value; },
      deleteMany: async () => ({ count: 0 }),
    },
    $transaction: async (run: any) => run(db),
  };
  return { user, sessions, service: createAuthService(db, () => date), advance: (ms: number) => { date = new Date(date.getTime() + ms); } };
}

test('senhas usam sal independente e comparação segura', async () => {
  const other = await hashPassword(password);
  assert.notEqual(other, originalHash);
  assert.equal(await verifyPassword(password, other), true);
  assert.equal(await verifyPassword('incorreta', other), false);
  assert.equal(await verifyPassword(password, 'hash-invalido'), false);
  await assert.rejects(hashPassword('admin'));
});

test('sessões têm token opaco, expiram, rotacionam e são revogadas no logout/desativação', async () => {
  const f = fixture();
  const first = await f.service.login(' OPERADOR ', password, 'ip');
  assert.ok(f.sessions.has(tokenHash(first.token)));
  assert.ok(!f.sessions.has(first.token));
  const second = await f.service.login('operador', password, 'ip', first.token);
  assert.equal(await f.service.current(first.token), null);
  assert.equal((await f.service.current(second.token))?.role, 'ADMIN');
  f.user.role = 'ATTENDANT';
  assert.equal((await f.service.current(second.token))?.role, 'ATTENDANT');
  f.user.active = false;
  assert.equal(await f.service.current(second.token), null);
  f.user.active = true;
  await f.service.logout(second.token);
  assert.equal(await f.service.current(second.token), null);
  const third = await f.service.login('operador', password, 'ip');
  f.advance(8 * 60 * 60_000 + 1);
  assert.equal(await f.service.current(third.token), null);
});

test('troca exige senha atual e revoga todas as sessões', async () => {
  const f = fixture();
  const first = await f.service.login('operador', password, 'ip');
  const second = await f.service.login('operador', password, 'ip');
  await assert.rejects(f.service.changePassword(f.user.id, 'incorreta', 'Nova-senha-ficticia-123'));
  assert.ok(await f.service.current(first.token));
  await f.service.changePassword(f.user.id, password, 'Nova-senha-ficticia-123');
  assert.equal(await f.service.current(first.token), null);
  assert.equal(await f.service.current(second.token), null);
  await assert.rejects(f.service.login('operador', password, 'ip'));
});

test('limite por conta bloqueia tentativas e nova janela permite autenticar', async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) await assert.rejects(f.service.login('operador', 'incorreta', 'ip'), { status: 401 });
  await assert.rejects(f.service.login('operador', password, 'outro-ip'), { status: 429 });
  f.advance(16 * 60_000);
  assert.ok(await f.service.login('operador', password, 'ip'));
});

test('HTTP protege APIs, ignora flag antiga, valida origem, restringe perfis e não revela o token no JSON', async t => {
  const f = fixture('ATTENDANT');
  const app = createApp(f.service, { origins: ['http://localhost:5173'], secure: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta ausente');
  const request = (path: string, options?: RequestInit) => fetch(`http://127.0.0.1:${address.port}${path}`, options);
  assert.equal((await request('/health')).status, 200);
    assert.equal((await request('/ready')).status, 503); // nos testes unitários o banco é propositalmente inacessível
  for (const path of ['/api/nodes', '/api/flow/steps', '/api/appointments', '/api/analytics', '/api/users', '/api/schedule']) {
    assert.equal((await request(path, { headers: { Cookie: 'authenticated=true' } })).status, 401, path);
  }
  assert.equal((await request('/api/webhook')).status, 403); // verificação Meta, não bloqueio do painel
  const body = JSON.stringify({ username: 'operador', password });
  assert.equal((await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://invalido.example' }, body })).status, 403);
  assert.equal((await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\/api/);
  assert.deepEqual(Object.keys(await login.json()), ['user']);
  const headers = { Cookie: cookie.split(';')[0]!, Origin: 'http://localhost:5173' };
  assert.equal((await request('/api/auth/me', { headers })).status, 200);
  assert.equal((await request('/api/nodes', { headers })).status, 403);
  assert.equal((await request('/api/flow/steps', { headers })).status, 403);
  assert.equal((await request('/api/analytics', { headers })).status, 403);
  assert.equal((await request('/api/users', { headers })).status, 403);
  assert.equal((await request('/api/schedule', { headers })).status, 403);
  // A consulta inválida é validada no controller depois da autorização, antes de acessar banco.
  assert.equal((await request('/api/appointments/availability?date=invalid', { headers })).status, 400);
  assert.equal((await request('/api/auth/logout', { method: 'POST', headers: { Cookie: headers.Cookie, Origin: 'https://invalido.example' } })).status, 403);
  assert.equal((await request('/api/auth/me', { headers })).status, 200);
  assert.equal((await request('/api/auth/logout', { method: 'POST', headers })).status, 204);
  assert.equal((await request('/api/auth/me', { headers })).status, 401);
});

test('cookie em produção é Secure', async t => {
  const f = fixture();
  const server = createApp(f.service, { origins: ['https://painel.example'], secure: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta ausente');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://painel.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'operador', password }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie')!, /Secure/);
});
