import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { sendInteractiveMessage, sendListMessage } from '../../src/services/metaAPI.js';
import { charLength } from '../../src/services/whatsapp/messagePolicy.js';


test('payloads da Meta respeitam limites sem perder texto ou opções', async () => {
  const previousAdapter = axios.defaults.adapter;
  const previousToken = process.env.META_WA_TOKEN;
  const previousPhoneId = process.env.META_PHONE_NUMBER_ID;
  const requests: any[] = [];
  process.env.META_WA_TOKEN = 'teste-sem-rede';
  process.env.META_PHONE_NUMBER_ID = 'teste';
  axios.defaults.adapter = async config => {
    requests.push(JSON.parse(config.data));
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
  try {
    const text = ('Orientação oficial completa. ').repeat(120);
    await sendInteractiveMessage('teste', text, [{ id: 'menu', text: '📅 Agendar atendimento' }]);
    assert.ok(requests.slice(0, -1).every(request => request.type === 'text'));
    const last = requests.at(-1)!;
    assert.ok(last.interactive.body.text.length <= 1024);
    assert.ok(last.interactive.action.buttons[0].reply.title.length <= 20);
    const sent = requests.map(request => request.type === 'text' ? request.text.body : request.interactive.body.text).join(' ');
    assert.equal(sent.replace(/\s/g, ''), text.replace(/\s/g, ''));
    requests.length = 0;
    const options = Array.from({ length: 23 }, (_, i) => ({ id: String(i), text: `Opção ${i}` }));
    await sendInteractiveMessage('teste', 'Escolha', options);
    const ids = requests.flatMap(request => request.interactive.type === 'button' ? request.interactive.action.buttons.map((button: any) => button.reply.id) : request.interactive.action.sections.flatMap((section: any) => section.rows.map((row: any) => row.id)));
    assert.deepEqual(ids, options.map(option => option.id));
    await assert.rejects(() => sendListMessage('teste', 'Título', 'Texto', 'Ver', [{ title: 'Seção', rows: options.map(option => ({ id: option.id, title: option.text })) }]), /1 a 10/);
  } finally {
    if (previousAdapter === undefined) delete axios.defaults.adapter; else axios.defaults.adapter = previousAdapter;
    if (previousToken === undefined) delete process.env.META_WA_TOKEN; else process.env.META_WA_TOKEN = previousToken;
    if (previousPhoneId === undefined) delete process.env.META_PHONE_NUMBER_ID; else process.env.META_PHONE_NUMBER_ID = previousPhoneId;
  }
});
