import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { sendInteractiveMessage, sendListMessage } from '../../src/services/metaAPI.js';
import { charLength } from '../../src/services/whatsapp/messagePolicy.js';
import { buildMenu } from '../../prisma/seed/seed.js';

test('seed completo: botões até 20 caracteres, itens de lista até 24 e IDs preservados no payload', async () => {
  const { steps, options } = await buildMenu();
  const previous = axios.defaults.adapter;
  const previousToken = process.env.META_WA_TOKEN;
  const previousId = process.env.META_PHONE_NUMBER_ID;
  const sent: any[] = [];
  process.env.META_WA_TOKEN = 'teste-sem-rede'; process.env.META_PHONE_NUMBER_ID = 'teste';
  axios.defaults.adapter = async config => {
    sent.push(JSON.parse(config.data));
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
  try {
    for (const step of steps) {
      const choices = options.filter(option => option.stepId === step.id);
      if (!choices.length) continue;
      const limit = choices.length <= 3 ? 20 : 24;
      for (const choice of choices) {
        assert.ok(charLength(choice.text) > 0 && charLength(choice.text) <= limit,
          `Seed: ${step.id} / ${choice.id}: "${choice.text}" tem ${charLength(choice.text)} caracteres; limite ${limit}`);
      }
      sent.length = 0;
      await sendInteractiveMessage('destinatario-ficticio', step.message, choices);
      const delivered: string[] = [];
      for (const message of sent.filter(message => message.type === 'interactive')) {
        const control = message.interactive;
        assert.ok(charLength(control.body.text) <= 1024, step.id);
        if (control.type === 'button') {
          assert.ok(control.action.buttons.length <= 3);
          for (const button of control.action.buttons) {
            assert.ok(charLength(button.reply.title) <= 20, step.id);
            assert.ok(charLength(button.reply.id) <= 256, step.id);
            delivered.push(button.reply.id);
          }
        } else {
          assert.ok(charLength(control.action.button) <= 20, step.id);
          const rows = control.action.sections.flatMap((section: any) => {
            assert.ok(charLength(section.title) <= 24, step.id); return section.rows;
          });
          assert.ok(rows.length <= 10, step.id);
          for (const row of rows) {
            assert.ok(charLength(row.title) <= 24, step.id);
            assert.ok(charLength(row.id) <= 200, step.id);
            assert.ok(!row.description || charLength(row.description) <= 72, step.id);
            delivered.push(row.id);
          }
        }
      }
      assert.deepEqual(delivered, choices.map(choice => choice.id), `Nenhuma opção perdida em ${step.id}`);
    }
  } finally {
    if (previous === undefined) delete axios.defaults.adapter; else axios.defaults.adapter = previous;
    if (previousToken === undefined) delete process.env.META_WA_TOKEN; else process.env.META_WA_TOKEN = previousToken;
    if (previousId === undefined) delete process.env.META_PHONE_NUMBER_ID; else process.env.META_PHONE_NUMBER_ID = previousId;
  }
});

