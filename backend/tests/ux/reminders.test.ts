import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReminderPayload, handleReminderReply, queueDueReminders, reminderConfig, whenLabel } from '../../src/services/appointments/reminders.js';
import type { ReminderConfig } from '../../src/services/appointments/reminders.js';

const cfg: ReminderConfig = { enabled: true, template: 'lembrete_teste', language: 'pt_BR', address: 'Rua   Teste,\n1', hoursBefore: 24,
  minLeadMinutes: 60, minAgeMinutes: 120, startMinute: 480, endMinute: 1200 };
const appointment = { id: '11111111-2222-3333-4444-555555555555', phoneNumber: '5512999999999', citizenName: ' Maria\nSouza ', userName: null,
  scheduledAt: new Date('2026-11-19T17:00:00.000Z') };

test('data e hora do lembrete usam o horário de Brasília', () => {
  assert.deepEqual(whenLabel(appointment.scheduledAt), { date: 'quinta-feira, 19/11/2026', time: '14:00' });
  // 02:00 UTC ainda é noite do dia anterior em Brasília.
  assert.equal(whenLabel(new Date('2026-11-20T02:00:00.000Z')).date, 'quinta-feira, 19/11/2026');
});

test('payload do template traz parâmetros limpos e botões ligados ao agendamento', () => {
  const payload = buildReminderPayload(appointment, cfg);
  assert.equal(payload.to, '5512999999999');
  assert.equal(payload.type, 'template');
  const template = payload.template as { name: string; language: { code: string }; components: { type: string; index?: string; parameters: { text?: string; payload?: string }[] }[] };
  assert.equal(template.name, 'lembrete_teste');
  assert.equal(template.language.code, 'pt_BR');
  const body = template.components.find(component => component.type === 'body')!;
  assert.deepEqual(body.parameters.map(parameter => parameter.text), ['Maria', 'quinta-feira, 19/11/2026', '14:00', 'Rua Teste, 1']);
  const buttons = template.components.filter(component => component.type === 'button');
  assert.deepEqual(buttons.map(button => button.parameters[0]?.payload), [`rem_ok:${appointment.id}`, `rem_no:${appointment.id}`]);
  assert.deepEqual(buttons.map(button => button.index), ['0', '1']);
  // Sem nome cadastrado, usa um tratamento genérico em vez de parâmetro vazio.
  const anonymous = buildReminderPayload({ ...appointment, citizenName: null }, cfg).template as typeof template;
  assert.equal(anonymous.components[0]!.parameters[0]!.text, 'cidadão');
});

test('o agendador não consulta o banco desligado ou fora do horário comercial', async () => {
  // O banco dos testes unitários é inacessível de propósito: qualquer consulta falharia.
  assert.equal(await queueDueReminders(new Date('2026-11-19T15:00:00.000Z'), { ...cfg, enabled: false }), 0);
  assert.equal(await queueDueReminders(new Date('2026-11-20T01:00:00.000Z'), cfg), 0); // 22:00 em Brasília
  assert.equal(await queueDueReminders(new Date('2026-11-19T10:59:00.000Z'), cfg), 0); // 07:59 em Brasília
  assert.equal(await queueDueReminders(new Date('2026-11-19T23:00:00.000Z'), cfg), 0); // 20:00 em Brasília
});

test('lembretes ficam desligados sem a configuração explícita', () => {
  const saved = { enabled: process.env.REMINDERS_ENABLED, template: process.env.REMINDER_TEMPLATE_NAME };
  try {
    delete process.env.REMINDERS_ENABLED; delete process.env.REMINDER_TEMPLATE_NAME;
    assert.equal(reminderConfig().enabled, false);
    process.env.REMINDERS_ENABLED = 'true';
    assert.equal(reminderConfig().enabled, false); // falta o nome do template aprovado
    process.env.REMINDER_TEMPLATE_NAME = 'lembrete_agendamento';
    assert.equal(reminderConfig().enabled, true);
    assert.equal(reminderConfig().hoursBefore, 24);
  } finally {
    if (saved.enabled === undefined) delete process.env.REMINDERS_ENABLED; else process.env.REMINDERS_ENABLED = saved.enabled;
    if (saved.template === undefined) delete process.env.REMINDER_TEMPLATE_NAME; else process.env.REMINDER_TEMPLATE_NAME = saved.template;
  }
});

test('respostas que não são do lembrete seguem para o fluxo normal da conversa', async () => {
  assert.equal(await handleReminderReply('5512999999999', 'btn_go_menu'), false);
  assert.equal(await handleReminderReply('5512999999999', 'rem_ok:nao-e-um-uuid'), false);
  assert.equal(await handleReminderReply('5512999999999', 'rem_xx:11111111-2222-3333-4444-555555555555'), false);
});
