import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { startRetentionWorker } from '../../src/services/privacy/retentionWorker.js';

test('worker de retenção não sobrepõe execuções e aguarda a atual no shutdown', async () => {
  let release = () => {}, calls = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const stop = startRetentionWorker(async () => { calls++; await gate; return null; }, 5);
  try {
    await delay(25); assert.equal(calls, 1);
    let stopped = false;
    const closing = stop().then(() => { stopped = true; });
    await delay(10); assert.equal(stopped, false);
    release(); await closing; await delay(15); assert.equal(calls, 1);
  } finally { release(); await stop(); }
});

test('worker de retenção retenta falhas sem registrar conteúdo da exceção', async t => {
  const log = t.mock.method(console, 'error', () => {});
  let calls = 0, done = () => {};
  const completed = new Promise<void>(resolve => { done = resolve; });
  const stop = startRetentionWorker(async () => { if (++calls === 1) throw new Error('conteudo-pessoal-ficticio'); done(); return null; }, 5);
  try {
    await Promise.race([completed, delay(1000).then(() => { throw new Error('Worker não retomou'); })]);
    assert.ok(calls >= 2); assert.equal(log.mock.callCount(), 1);
    assert.ok(!JSON.stringify(log.mock.calls).includes('conteudo-pessoal-ficticio'));
  } finally { await stop(); }
});
