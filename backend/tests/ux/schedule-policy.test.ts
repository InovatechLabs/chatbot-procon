import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilityForDate, capacityAt, civilTime, peakOccupancy, slotsForDate } from '../../src/services/appointments/schedulePolicy.js';
import type { SchedulePolicy } from '../../src/services/appointments/schedulePolicy.js';
import { blockSchema, settingsSchema } from '../../src/services/appointments/scheduleSchemas.js';
const date = '2026-11-16';
const now = new Date('2026-11-15T00:00:00Z');
const fixture = (): SchedulePolicy => ({ settings: { id: 'main', capacity: 2, startMinute: 540, endMinute: 1020, slotMinutes: 30, minLeadMinutes: 0, workDays: [1, 2, 3, 4, 5], version: 1, updatedAt: now }, capacities: [], blocks: [] });
test('capacidade geral, dia e horário têm precedência explícita e bloqueio prevalece', () => {
  const policy = fixture();
  policy.capacities = [{ id: 'day', date, minute: -1, capacity: 3 }, { id: 'hour', date, minute: 660, capacity: 2 }];
  assert.equal(capacityAt(date, 660, policy), 2); assert.equal(capacityAt(date, 690, policy), 3);
  assert.equal(capacityAt('2026-11-17', 660, policy), 2);
  const busy = [{ scheduledAt: civilTime(date, 660), durationMin: 30, attendantId: null }];
  const slot = availabilityForDate(date, policy, busy, undefined, now).find(slot => slot.time === '11:00')!;
  assert.equal(slot.remaining, 1); assert.equal(slot.available, true);
  policy.blocks.push({ id: 'block', startDate: date, endDate: date, weekDays: [], startMinute: 660, endMinute: 690, note: null, createdAt: now });
  const blocked = availabilityForDate(date, policy, busy, undefined, now).find(slot => slot.time === '11:00')!;
  assert.equal(blocked.blocked, true); assert.equal(blocked.remaining, 0); assert.equal(blocked.available, false);
});
test('intervalos atravessados também bloqueiam; fim é exclusivo e duração antiga ocupa a nova grade', () => {
  const policy = fixture(); policy.settings.slotMinutes = 60;
  policy.blocks = [{ id: 'lunch', startDate: null, endDate: null, weekDays: [1, 2, 3, 4, 5], startMinute: 720, endMinute: 780, note: null, createdAt: now }];
  const slots = availabilityForDate(date, policy, [], undefined, now);
  assert.equal(slots.find(slot => slot.time === '11:00')!.blocked, false);
  assert.equal(slots.find(slot => slot.time === '12:00')!.blocked, true);
  assert.equal(slots.find(slot => slot.time === '13:00')!.blocked, false);
  policy.settings.startMinute = 690; // atendimento de 11:30 a 12:30 atravessa almoço
  assert.equal(availabilityForDate(date, policy, [], undefined, now)[0]!.blocked, true);
  policy.settings.startMinute = 540; policy.settings.slotMinutes = 15; policy.settings.capacity = 1;
  const appointments = [{ scheduledAt: civilTime(date, 840), durationMin: 60, attendantId: null }];
  const after = availabilityForDate(date, policy, appointments, undefined, now);
  assert.equal(after.find(slot => slot.time === '14:15')!.available, false);
  assert.equal(after.find(slot => slot.time === '15:00')!.available, true);
});
test('ocupação usa pico simultâneo, e não soma intervalos que nunca coincidem', () => {
  const start = civilTime(date, 540), end = civilTime(date, 600);
  const rows = [{ scheduledAt: start, durationMin: 30, attendantId: 'one' }, { scheduledAt: civilTime(date, 570), durationMin: 30, attendantId: 'one' }];
  assert.equal(peakOccupancy(start, end, rows), 1);
});
test('férias atravessando ano, recorrência semanal e sábado configurável respeitam o calendário', () => {
  const policy = fixture(); policy.settings.workDays = [0, 1, 2, 3, 4, 5, 6];
  policy.blocks = [{ id: 'holidays', startDate: '2026-12-22', endDate: '2027-01-02', weekDays: [], startMinute: null, endMinute: null, note: null, createdAt: now }];
  for (const day of ['2026-12-22', '2026-12-31', '2027-01-02']) assert.ok(availabilityForDate(day, policy, [], undefined, now).every(slot => slot.blocked));
  assert.ok(availabilityForDate('2027-01-03', policy, [], undefined, now).some(slot => slot.available));
  policy.blocks = [{ id: 'friday', startDate: null, endDate: null, weekDays: [5], startMinute: 900, endMinute: 1440, note: null, createdAt: now }];
  assert.equal(availabilityForDate('2026-11-20', policy, [], undefined, now).find(slot => slot.time === '15:00')!.blocked, true);
  assert.equal(availabilityForDate('2026-11-19', policy, [], undefined, now).find(slot => slot.time === '15:00')!.blocked, false);
  assert.ok(slotsForDate('2026-11-21', policy.settings).length > 0);
});
test('validação recusa expediente vazio, datas impossíveis e bloqueio sem período nem recorrência', () => {
  assert.equal(settingsSchema.safeParse({ ...fixture().settings, id: undefined }).success, false);
  const { id, version, updatedAt, ...settings } = fixture().settings;
  assert.ok(id && version && updatedAt);
  assert.equal(settingsSchema.safeParse({ ...settings, startMinute: 1020, endMinute: 540 }).success, false);
  assert.equal(settingsSchema.safeParse({ ...settings, workDays: [] }).success, false);
  const blank = { startDate: null, endDate: null, weekDays: [], startMinute: null, endMinute: null, note: null };
  assert.equal(blockSchema.safeParse(blank).success, false);
  assert.equal(blockSchema.safeParse({ ...blank, startDate: '2026-02-30', endDate: '2026-03-01' }).success, false);
  assert.equal(blockSchema.safeParse({ ...blank, weekDays: [1], startMinute: 780, endMinute: 720 }).success, false);
});
