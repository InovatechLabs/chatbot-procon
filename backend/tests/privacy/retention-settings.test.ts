import test from 'node:test';
import assert from 'node:assert/strict';
import { retentionSettingsSchema, retentionMutationSchema } from '../../src/services/privacy/retentionSettings.js';

test('política de retenção: desativação por categoria e autorização explícita com prazos válidos', () => {
  const disabled = { sessionsDays: null, appointmentsDays: null, receiptsDays: null, outgoingDays: null, approved: false };
  assert.equal(retentionSettingsSchema.safeParse(disabled).success, true);
  assert.equal(retentionSettingsSchema.safeParse({ ...disabled, approved: true }).success, false);
  for (const key of ['sessionsDays', 'appointmentsDays', 'receiptsDays', 'outgoingDays']) {
    assert.equal(retentionSettingsSchema.safeParse({ ...disabled, [key]: 36500, approved: true }).success, true);
    for (const value of [0, -1, 1.5, 36501, '30', NaN, Infinity]) assert.equal(retentionSettingsSchema.safeParse({ ...disabled, [key]: value }).success, false);
  }
  assert.equal(retentionSettingsSchema.safeParse({ ...disabled, automatic: true }).success, false);
  assert.equal(retentionMutationSchema.safeParse({ version: 0, value: disabled }).success, false);
  assert.equal(retentionMutationSchema.safeParse({ version: 1, value: disabled, actorId: 'forjado' }).success, false);
});
