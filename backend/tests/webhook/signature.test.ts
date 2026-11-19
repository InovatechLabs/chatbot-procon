import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import express from 'express';
import { createWebhookRouter } from '../../src/routes/webhook/webhookRoutes.js';
import { verifyMetaSignature } from '../../src/routes/webhook/signature.js';
import { createApp } from '../../src/app.js';
import { createWebhookEventHandler } from '../../src/controllers/webhook/webhookController.js';

const secret = 'segredo-ficticio-apenas-para-testes';
const sign = (body: string, key = secret) => `sha256=${createHmac('sha256', key).update(body).digest('hex')}`;
const payload = '{ "object": "whatsapp_business_account", "entry": [], "texto": "açúcar \\u00e7" }';

test('webhook só confirma depois da persistência, responde 503 em falha e minimiza o payload', async t => {
  let committed = false;
  let failing = false;
  let captured: unknown;
  const app = express();
  app.use('/webhook', createWebhookRouter(createWebhookEventHandler(async messages => {
    if (failing) throw new Error('DatabaseUnavailable');
    captured = messages;
    await new Promise(resolve => setTimeout(resolve, 10));
    committed = true;
  }), () => secret));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Porta ausente');
  const input = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { contacts: [{ profile: { name: 'Pessoa fictícia' } }], messages: [{ id: 'wamid-test', from: '5511999999999', type: 'text', text: { body: 'menu' }, profile: 'não armazenar' }] } }] }] };
  const post = async (value: unknown) => {
    const body = JSON.stringify(value);
    return fetch(`http://127.0.0.1:${address.port}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(body) }, body });
  };
  assert.equal((await post(input)).status, 200); assert.equal(committed, true);
  assert.deepEqual(captured, [{ id: 'wamid-test', from: '5511999999999', type: 'text', text: { body: 'menu' } }]);
  failing = true; assert.equal((await post(input)).status, 503);
  input.entry[0]!.changes[0]!.value.messages[0]!.id = '';
  assert.equal((await post(input)).status, 400);
});

test('HMAC usa bytes originais e recusa corpo, chave ou assinatura alterados', () => {
  assert.equal(verifyMetaSignature(Buffer.from(payload), sign(payload), secret), true);
  assert.equal(verifyMetaSignature(Buffer.from(JSON.stringify(JSON.parse(payload))), sign(payload), secret), false);
  assert.equal(verifyMetaSignature(Buffer.from(payload), sign(payload), 'outra-chave'), false);
  for (const signature of ['', 'sha1=abc', 'sha256=zz', `sha256=${'a'.repeat(63)}`, `sha256=${'a'.repeat(66)}`]) assert.equal(verifyMetaSignature(Buffer.from(payload), signature, secret), false);
});

test('assinatura é exigida antes de interpretar JSON ou chamar o processamento', async t => {
  let calls = 0;
  let configured: string | undefined = secret;
  const app = express();
  app.use('/api/webhook', createWebhookRouter((req, res) => {
    calls++;
    assert.equal(req.body.object, 'whatsapp_business_account');
    assert.equal(req.body.texto, 'açúcar ç');
    res.sendStatus(200);
  }, () => configured));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Porta ausente');
  const url = `http://127.0.0.1:${address.port}/api/webhook`;
  const post = (body: string, signature?: string, contentType = 'application/json') => fetch(url, { method: 'POST', headers: { 'Content-Type': contentType, ...(signature ? { 'X-Hub-Signature-256': signature } : {}) }, body });
  assert.equal((await post(payload)).status, 403);
  assert.equal((await post(payload, sign(payload, 'incorreto'))).status, 403);
  assert.equal((await post(payload + ' ', sign(payload))).status, 403);
  assert.equal((await post('{json invalido')).status, 403);
  assert.equal((await post('{json invalido', sign('{json invalido'))).status, 400);
  assert.equal((await post('null', sign('null'))).status, 400);
  assert.equal((await post('[]', sign('[]'))).status, 400);
  assert.equal((await post(payload, sign(payload), 'text/plain')).status, 415);
  assert.equal(calls, 0);
  const repeated = await new Promise<number>(resolve => {
    const req = httpRequest(url, { method: 'POST', headers: ['Host', `127.0.0.1:${address.port}`, 'Content-Type', 'application/json', 'X-Hub-Signature-256', sign(payload), 'X-Hub-Signature-256', sign(payload)] }, res => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
    req.end(payload);
  });
  assert.equal(repeated, 403); assert.equal(calls, 0);
  assert.equal((await post(payload, sign(payload))).status, 200); assert.equal(calls, 1);
  configured = undefined;
  assert.equal((await post(payload, sign(payload))).status, 503); assert.equal(calls, 1);
});

test('app real preserva handshake GET, aceita evento assinado sem Origin e mantém limites', async t => {
  const previousSecret = process.env.META_APP_SECRET; const previousToken = process.env.META_VERIFY_TOKEN;
  process.env.META_APP_SECRET = secret; process.env.META_VERIFY_TOKEN = 'verificacao-ficticia';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.META_APP_SECRET; else process.env.META_APP_SECRET = previousSecret;
    if (previousToken === undefined) delete process.env.META_VERIFY_TOKEN; else process.env.META_VERIFY_TOKEN = previousToken;
  });
  const server = createApp(undefined, { origins: ['http://localhost:5173'], secure: false }).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Porta ausente');
  const base = `http://127.0.0.1:${address.port}/api/webhook`;
  const verify = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=verificacao-ficticia&hub.challenge=123456`);
  assert.equal(verify.status, 200); assert.equal(await verify.text(), '123456'); assert.match(verify.headers.get('content-type')!, /text\/plain/);
  assert.equal((await fetch(`${base}?hub.mode=subscribe&hub.verify_token=incorreto&hub.challenge=123456`)).status, 403);
  assert.equal((await fetch(`${base}?hub.mode=subscribe&hub.verify_token=verificacao-ficticia`)).status, 403);
  const post = (body: string, headers = {}) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(body), ...headers }, body });
  assert.equal((await post(payload)).status, 200);
  assert.equal((await post('{"object":"outro"}')).status, 404);
  assert.equal((await post('{"object":"whatsapp_business_account","entry":[null]}')).status, 400);
  assert.equal((await post('{"object":"whatsapp_business_account","entry":"invalido"}')).status, 400);
  assert.equal((await post('a'.repeat(102401))).status, 413);
  assert.equal((await post(payload, { 'Content-Encoding': 'gzip' })).status, 415);
  // Rotas administrativas continuam usando JSON normal, sem exigir assinatura Meta.
  const login = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: '{}' });
  assert.equal(login.status, 400);
});
