import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsWindow, analyticsQuery, percentage } from '../../src/services/analytics/analyticsService.js';
import { eventSchema } from '../../src/services/analytics/events.js';

test('analytics usa dias civis de Brasília, períodos válidos e denominadores explícitos', () => {
  const range = analyticsWindow(7, new Date('2026-11-17T02:30:00Z'));
  assert.equal(range.from.toISOString(), '2026-11-10T03:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-11-17T03:00:00.000Z');
  assert.equal(percentage(0, 0), null); assert.equal(percentage(1, 3), 33.3);
  assert.equal(percentage(0, 2), 0);
  assert.equal(analyticsQuery.safeParse({ days: '30' }).success, true);
  assert.equal(analyticsQuery.safeParse({ days: '999999' }).success, false);
  assert.equal(analyticsQuery.safeParse({ phone: '5511999999999' }).success, false);
});

test('eventos não aceitam transcrições, campos pessoais ou metadados arbitrários', () => {
  assert.equal(eventSchema.safeParse({ kind: 'TURN_RECEIVED', sessionId: 'uuid-ficticio', stage: 'MENU' }).success, true);
  for (const extra of [{ phoneNumber: '5511999999999' }, { userCpf: '52998224725' }, { text: 'relato' }, { metadata: { arbitrary: 'texto' } }]) {
    assert.equal(eventSchema.safeParse({ kind: 'TURN_RECEIVED', ...extra }).success, false);
  }
  assert.equal(eventSchema.safeParse({ kind: 'RATING_SUBMITTED', rating: 999 }).success, false);
  assert.equal(eventSchema.safeParse({ kind: 'ANSWER_PREPARED', answerKind: 'texto inventado' }).success, false);
});
