import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';

const serverUrl = async (server: Server) => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
};
const close = (server: Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

test('configuração de IA preserva o modelo ativo se o Ollama rejeitar a mudança', { skip: !process.env.PRIVACY_TEST_DB_NAME }, async () => {
  const dbName = process.env.PRIVACY_TEST_DB_NAME!;
  assert.match(dbName, /^procon_privacy_test_[a-z0-9_]+$/);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  const { prisma } = await import('../../src/database/index.js');
  const { createApp } = await import('../../src/app.js');
  const { createAuthService } = await import('../../src/services/auth/authService.js');
  const { hashPassword } = await import('../../src/services/auth/password.js');
  const prefix = randomUUID();
  const password = 'Senha-ficticia-ia-123';
  const passwordHash = await hashPassword(password);
  const admin = await prisma.panelUser.create({ data: { username: `${prefix}-admin`, role: 'ADMIN', passwordHash } });
  const attendant = await prisma.panelUser.create({ data: { username: `${prefix}-attendant`, role: 'ATTENDANT', passwordHash } });
  const auth = createAuthService(prisma);
  const cookie = async (username: string) => `procon_session=${(await auth.login(username, password, prefix)).token}`;
  const adminCookie = await cookie(admin.username);
  const staffCookie = await cookie(attendant.username);
  const requests: { model: string; think: boolean; format: object; prompt: string }[] = [];
  const ollama = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const payload = JSON.parse(raw);
    requests.push(payload);
    res.setHeader('content-type', 'application/json');
    if (!['teste:com-thinking', 'teste:sem-thinking'].includes(payload.model)) {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    res.end(JSON.stringify({ response: '{"resultado":12}', thinking: payload.think && payload.model === 'teste:com-thinking' ? '7 + 5' : '' }));
  });
  const oldUrl = process.env.OLLAMA_GENERATE_URL;
  process.env.OLLAMA_GENERATE_URL = `${await serverUrl(ollama)}/api/generate`;
  const origin = 'http://localhost:5173';
  const app = createApp(auth, { origins: [origin], secure: false });
  const server = createServer(app);
  const endpoint = `${await serverUrl(server)}/api/ai-settings`;
  const request = (method: string, session: string, body?: unknown) => fetch(endpoint, {
    method,
    headers: { Cookie: session, Origin: origin, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const save = (version: number, model: string, thinkingEnabled: boolean) =>
    request('PUT', adminCookie, { version, value: { model, thinkingEnabled } });
  try {
    assert.equal((await request('GET', '')).status, 401);
    assert.equal((await request('GET', staffCookie)).status, 403);
    assert.equal((await request('PUT', staffCookie, { version: 0, value: { model: 'teste:com-thinking', thinkingEnabled: true } })).status, 403);
    const initial = await (await request('GET', adminCookie)).json();
    assert.equal(initial.version, 0);
    assert.equal(initial.model, process.env.OLLAMA_GENERATE_MODEL_NAME);
    assert.equal(initial.thinkingEnabled, false);
    assert.equal((await save(0, 'nome inválido', false)).status, 400);
    assert.equal(requests.length, 0);
    assert.equal((await save(0, 'teste:ausente', false)).status, 422);
    assert.equal((await save(0, 'teste:sem-thinking', true)).status, 422);
    assert.equal(await prisma.aiSettings.count(), 0);
    const concurrent = await Promise.all([save(0, 'teste:com-thinking', true), save(0, 'teste:com-thinking', true)]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    assert.ok(requests.every(payload => payload.format && payload.prompt.includes('7 mais 5')));
    assert.equal((await save(1, 'teste:ausente', false)).status, 422);
    assert.equal((await (await request('GET', adminCookie)).json()).model, 'teste:com-thinking');
    assert.equal((await save(1, 'teste:com-thinking', false)).status, 200);
    assert.equal((await save(1, 'teste:sem-thinking', false)).status, 409);
    const latest = await (await request('GET', adminCookie)).json();
    assert.equal(latest.version, 2);
    assert.equal(latest.thinkingEnabled, false);
    assert.equal(latest.model, 'teste:com-thinking');
  } finally {
    await close(server);
    await close(ollama);
    if (oldUrl === undefined) delete process.env.OLLAMA_GENERATE_URL;
    else process.env.OLLAMA_GENERATE_URL = oldUrl;
    await prisma.aiSettings.deleteMany({ where: { id: 'main' } });
    await prisma.panelUser.deleteMany({ where: { id: { in: [admin.id, attendant.id] } } });
    await prisma.$disconnect();
  }
});
