import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
const mode = process.argv[2] || 'unit';
if (!['unit', 'integration'].includes(mode)) throw new Error('Use unit ou integration.');
// Não lê .env e substitui credenciais/URLs reais antes de iniciar qualquer teste.
const env = { ...process.env, DOTENV_CONFIG_PATH: '.ci-generated/no-env-file', NODE_ENV: 'test',
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'), DATA_LOOKUP_KEY: randomBytes(32).toString('base64'),
  META_APP_SECRET: 'meta-app-secret-ficticio', META_VERIFY_TOKEN: 'verify-token-ficticio', META_WA_TOKEN: 'token-ficticio', META_PHONE_NUMBER_ID: 'teste',
  OLLAMA_EMBED_URL: 'http://127.0.0.1:1/disabled', OLLAMA_GENERATE_URL: 'http://127.0.0.1:1/disabled',
  OLLAMA_EMBEDDING_MODEL_NAME: 'fake', OLLAMA_GENERATE_MODEL_NAME: 'fake', LLM_ENABLE_THINKING: 'false',
  DATABASE_URL: 'postgresql://ci:ci@127.0.0.1:1/procon_ci_unused' };
delete env.AUTH_TEST_DB_NAME; delete env.PRIVACY_TEST_DB_NAME;
delete env.APPOINTMENTS_TEST_DB_NAME;
delete env.MESSAGING_TEST_DB_NAME;
delete env.ANALYTICS_TEST_DB_NAME;
delete env.AUTH_BOOTSTRAP_USERNAME; delete env.AUTH_BOOTSTRAP_PASSWORD; delete env.AUTH_BOOTSTRAP_ROLE;
const run = args => {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Uma verificação falhou.');
};
const tests = (folder, integration) => readdirSync(`tests/${folder}`).filter(name => name.endsWith('.test.ts') && name.includes('postgres') === integration).map(name => `tests/${folder}/${name}`);
if (mode === 'unit') {
  run(['--import', 'tsx', '--test', '--test-concurrency=1', ...['ux', 'auth', 'privacy', 'webhook'].flatMap(folder => tests(folder, false))]);
} else {
  let source;
  try { source = new URL(process.env.TEST_DATABASE_URL || ''); }
  catch { throw new Error('Configure TEST_DATABASE_URL para uma instância de testes; o valor não será exibido.'); }
  if (!/^\/procon_ci_[a-z0-9_]+$/.test(source.pathname)) throw new Error('TEST_DATABASE_URL deve apontar a uma base exclusiva procon_ci_*. Nunca use a base da aplicação.');
  const { Pool } = await import('pg');
  const admin = new Pool({ connectionString: source.toString() });
  const suffix = randomBytes(8).toString('hex');
  const names = [`procon_auth_test_ci_${suffix}`, `procon_privacy_test_ci_${suffix}`, `procon_appointments_test_ci_${suffix}`, `procon_messaging_test_ci_${suffix}`, `procon_analytics_test_ci_${suffix}`];
  const created = [];
  try {
    for (const name of names) {
      await admin.query(`CREATE DATABASE "${name}"`); created.push(name);
      const url = new URL(source); url.pathname = `/${name}`; env.DATABASE_URL = url.toString();
      run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
      run(['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code']);
      // Reaplicação da compatibilidade sobre schema atual preserva registros existentes.
      const check = new Pool({ connectionString: url.toString() });
      const id = randomBytes(16).toString('hex');
      try {
        await check.query('INSERT INTO "UserSession" (id, "phoneNumber", "updatedAt") VALUES ($1, $2, NOW())', [id, 'fixture-sem-dados-reais']);
        await check.query(readFileSync('prisma/migrations/20261115000000_restore_core_schema/migration.sql', 'utf8'));
        assert.equal((await check.query('SELECT "phoneNumber" FROM "UserSession" WHERE id = $1', [id])).rows[0].phoneNumber, 'fixture-sem-dados-reais');
        await check.query('DELETE FROM "UserSession" WHERE id = $1', [id]);
      } finally { await check.end(); }
      run(['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code']);
    }
    env.AUTH_TEST_DB_NAME = names[0]; env.PRIVACY_TEST_DB_NAME = names[1];
    env.APPOINTMENTS_TEST_DB_NAME = names[2];
    env.MESSAGING_TEST_DB_NAME = names[3];
    env.ANALYTICS_TEST_DB_NAME = names[4];
    // Os fixtures trocam apenas o nome de sua base; conexão inicial também é descartável.
    const url = new URL(source); url.pathname = `/${names[0]}`; env.DATABASE_URL = url.toString();
    run(['--import', 'tsx', '--test', '--test-concurrency=1', ...tests('auth', true), ...tests('privacy', true), ...tests('appointments', true), ...tests('messaging', true), ...tests('analytics', true)]);
    // Verifica o artefato compilado real, sem tsx/watch e sem serviços externos.
    const reservation = createServer().listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    const child = spawn(process.execPath, ['dist/index.js'], { env: { ...env, PORT: String(port) }, stdio: 'ignore' });
    const closed = once(child, 'exit');
    try {
      let ready = false;
      for (let i = 0; i < 50; i++) {
        if (child.exitCode !== null) throw new Error('O backend compilado encerrou antes de ficar pronto.');
        try { ready = (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })).status === 200; } catch { /* aguarda inicialização */ }
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(ready, 'Backend compilado responde /health');
      assert.equal((await fetch(`http://127.0.0.1:${port}/api/appointments`)).status, 401);
      console.log('Smoke do backend compilado: health 200 e API protegida 401.');
    } finally { child.kill(); await closed; }
  } finally {
    // Remove somente bases criadas por esta execução, inclusive em falha de teste.
    for (const name of created.reverse()) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}
