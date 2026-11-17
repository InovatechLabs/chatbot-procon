import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageInbox } from '../../src/controllers/webhook/messageInbox.js';
import type { IncomingMessage } from '../../src/controllers/webhook/conversation.js';
const msg = (id: string, body: string, phone = '1'): IncomingMessage => ({ id, from: phone, type: 'text', text: { body } });

test('mensagens picadas geram uma análise e entrega duplicada é ignorada', async () => {
  const received: IncomingMessage[] = [];
  const inbox = new MessageInbox(async message => { received.push(message); }, async () => true, 5);
  await Promise.all([
    inbox.enqueue(msg('a', 'comprei um celular')),
    inbox.enqueue(msg('b', 'não ligou')),
    inbox.enqueue(msg('a', 'comprei um celular')),
  ]);
  assert.equal(received.length, 1);
  assert.equal(received[0]!.text!.body, 'comprei um celular\nnão ligou');
});

test('botão e comando formam barreira; processamento do mesmo telefone é serial', async () => {
  const received: string[] = [];
  let active = 0;
  const inbox = new MessageInbox(async message => {
    assert.equal(active++, 0);
    await new Promise(resolve => setTimeout(resolve, 2));
    received.push(message.text!.body);
    active--;
  }, async () => true, 5);
  await Promise.all([inbox.enqueue(msg('a', 'comprei na loja')), inbox.enqueue(msg('b', 'Menu!')), inbox.enqueue(msg('c', 'outro problema'))]);
  assert.deepEqual(received, ['comprei na loja', 'Menu!', 'outro problema']);
});

test('dados de coleta não são agrupados e uma falha não bloqueia a fila', async () => {
  const received: string[] = [];
  const inbox = new MessageInbox(async message => {
    if (message.id === 'a') throw new Error('teste');
    received.push(message.text!.body);
  }, async () => false, 1);
  await Promise.all([inbox.enqueue(msg('a', 'Maria da Silva')), inbox.enqueue(msg('b', 'Paula da Silva'))]);
  assert.deepEqual(received, ['Paula da Silva']);
});

test('complemento após a janela de agrupamento torna a análise em andamento obsoleta', async () => {
  let started!: () => void;
  let release!: () => void;
  const startedPromise = new Promise<void>(resolve => { started = resolve; });
  const releasePromise = new Promise<void>(resolve => { release = resolve; });
  const received: [string, boolean][] = [];
  const inbox = new MessageInbox(async (message, hasNewerText) => {
    if (message.id === 'a') { started(); await releasePromise; }
    received.push([message.id, await hasNewerText()]);
  }, async () => true, 1);
  const first = inbox.enqueue(msg('a', 'comprei um celular numa loja'));
  await startedPromise;
  const second = inbox.enqueue(msg('b', 'ele não liga'));
  release();
  await Promise.all([first, second]);
  assert.deepEqual(received, [['a', true], ['b', false]]);
});
