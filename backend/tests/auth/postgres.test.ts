import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createAuthService, tokenHash } from '../../src/services/auth/authService.js';

// Opt-in: nunca usa a base da aplicação como destino dos testes.
test('PostgreSQL: persistência, revogação e limite concorrente entre instâncias', { skip: !process.env.AUTH_TEST_DB_NAME }, async () => {
  const name = process.env.AUTH_TEST_DB_NAME!;
  assert.match(name, /^procon_auth_test_[a-z0-9_]+$/);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${name}`;
  const firstDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  const secondDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  const username = `teste-${randomUUID()}`;
  const password = 'Senha-ficticia-postgres-123';
  const at = new Date();
  const first = createAuthService(firstDb, () => at);
  const second = createAuthService(secondDb, () => at);
  try {
    const provision = () => promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/create-panel-user.ts'], {
      env: { ...process.env, DATABASE_URL: url.toString(), AUTH_BOOTSTRAP_USERNAME: username, AUTH_BOOTSTRAP_PASSWORD: password, AUTH_BOOTSTRAP_ROLE: 'ADMIN' },
    });
    const created = await provision();
    assert.ok(!created.stdout.includes(password));
    const user = await firstDb.panelUser.findUniqueOrThrow({ where: { username } });
    assert.equal(user.role, 'ADMIN');
    await assert.rejects(provision()); // CLI não sobrescreve conta existente.
    await assert.rejects(firstDb.panelUser.create({ data: { username, passwordHash: 'duplicado' } }));
    const session = await first.login(username.toUpperCase(), password, username);
    assert.equal((await second.current(session.token))?.id, user.id);
    const stored = await firstDb.panelSession.findUniqueOrThrow({ where: { tokenHash: tokenHash(session.token) } });
    assert.notEqual(stored.tokenHash, session.token);
    await second.logout(session.token);
    assert.equal(await first.current(session.token), null);
    const next = await first.login(username, password, username);
    await second.changePassword(user.id, password, 'Outra-senha-postgres-456');
    assert.equal(await first.current(next.token), null);
    await assert.rejects(first.login(username, password, username), { status: 401 });
    const valid = await second.login(username, 'Outra-senha-postgres-456', username);
    await firstDb.panelUser.update({ where: { id: user.id }, data: { active: false } });
    assert.equal(await first.current(valid.token), null);

    // Conta inexistente tem o mesmo limite, compartilhado por processos/IPs distintos.
    const absent = `ausente-${randomUUID()}`;
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, i) =>
      (i % 2 ? first : second).login(absent, password, `${username}-${i}`)));
    assert.equal(attempts.filter(r => r.status === 'rejected' && r.reason.status === 401).length, 10);
    assert.equal(attempts.filter(r => r.status === 'rejected' && r.reason.status === 429).length, 2);
  } finally {
    await firstDb.panelUser.deleteMany({ where: { username } });
    await Promise.all([firstDb.$disconnect(), secondDb.$disconnect()]);
  }
});
