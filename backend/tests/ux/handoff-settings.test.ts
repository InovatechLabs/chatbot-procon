import { strict as assert } from 'node:assert';
import test from 'node:test';
import { handoffMutation, isHandoffOpen } from '../../src/services/conversation/handoffSettings.js';

const value = {
  enabled: true,
  periods: [{ weekday: 1, start: '09:00', end: '12:00' }, { weekday: 1, start: '13:00', end: '24:00' }],
  queueMessage: 'Você entrou na fila.',
  closedMessage: 'Fora do expediente.',
};

test('expediente usa horário de Brasília, com pausa, fim exclusivo e meia-noite', () => {
  assert.ok(handoffMutation.safeParse({ version: 0, value }).success);
  const open = (iso: string) => isHandoffOpen(value, new Date(iso));
  assert.equal(open('2026-11-23T11:59:59Z'), false);
  assert.equal(open('2026-11-23T12:00:00Z'), true);
  assert.equal(open('2026-11-23T15:00:00Z'), false);
  assert.equal(open('2026-11-23T16:00:00Z'), true);
  assert.equal(open('2026-11-24T02:59:00Z'), true);
  assert.equal(open('2026-11-24T03:00:00Z'), false);
  assert.equal(isHandoffOpen({ ...value, enabled: false, periods: null }), false);
});

test('rejeita expediente sem intervalos, invertido ou sobreposto', () => {
  for (const periods of [
    [],
    [{ weekday: 1, start: '18:00', end: '08:00' }],
    [...value.periods, { weekday: 1, start: '11:00', end: '14:00' }],
  ]) assert.equal(handoffMutation.safeParse({ version: 0, value: { ...value, periods } }).success, false);
});
