import type { Prisma, PrismaClient, ScheduleSettings, ScheduleCapacity, ScheduleBlock } from '@prisma/client';
export const TZ = '-03:00';
const MINUTE = 60_000;
export const localParts = (value: Date) => {
  const iso = new Date(value.getTime() - 180 * MINUTE).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};
export const civilTime = (date: string, minute: number) => new Date(new Date(`${date}T00:00:00${TZ}`).getTime() + minute * MINUTE);
export const minuteLabel = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export interface SchedulePolicy { settings: ScheduleSettings; capacities: ScheduleCapacity[]; blocks: ScheduleBlock[] }
export interface BusyAppointment { scheduledAt: Date; durationMin: number; attendantId: string | null }
export async function busyBetween(tx: Prisma.TransactionClient, start: Date, end: Date, excludeId = '') {
  // Apenas metadados de ocupação, sem campos pessoais/criptografados.
  return tx.$queryRaw<BusyAppointment[]>`SELECT "scheduledAt", "durationMin", "attendantId" FROM "Appointment"
    WHERE "status" NOT IN ('CANCELLED','NO_SHOW') AND "id" <> ${excludeId} AND "scheduledAt" < ${end}
    AND "scheduledAt" + "durationMin" * INTERVAL '1 minute' > ${start}`;
}
export const overlap = (a: number, b: number, x: number, y: number) => a < y && x < b;
export async function loadPolicy(db: Prisma.TransactionClient): Promise<SchedulePolicy> {
  const [settings, capacities, blocks] = await Promise.all([
    db.scheduleSettings.findUniqueOrThrow({ where: { id: 'main' } }),
    db.scheduleCapacity.findMany({ orderBy: [{ date: 'asc' }, { minute: 'asc' }] }),
    db.scheduleBlock.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);
  return { settings, capacities, blocks };
}
export async function lockSchedule(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(19781116, 2)::text`;
}
// READ COMMITTED: leituras após aguardar o lock enxergam a configuração/reserva anterior.
export function scheduleTransaction<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async tx => { await lockSchedule(tx); return work(tx); }, { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 15000 });
}
export function slotsForDate(date: string, settings: ScheduleSettings) {
  if (!settings.workDays.includes(weekdayOf(date))) return [];
  const slots = [];
  for (let minute = settings.startMinute; minute + settings.slotMinutes <= settings.endMinute; minute += settings.slotMinutes) slots.push({ minute, time: minuteLabel(minute), at: civilTime(date, minute) });
  return slots;
}
export function capacityAt(date: string, minute: number, policy: SchedulePolicy) {
  return policy.capacities.find(rule => rule.date === date && rule.minute === minute)?.capacity
    ?? policy.capacities.find(rule => rule.date === date && rule.minute === -1)?.capacity
    ?? policy.settings.capacity;
}
export function blockingRules(date: string, start: Date, end: Date, policy: SchedulePolicy) {
  return policy.blocks.filter(rule => (!rule.startDate || date >= rule.startDate) && (!rule.endDate || date <= rule.endDate)
    && (!rule.weekDays.length || rule.weekDays.includes(weekdayOf(date)))
    && (rule.startMinute === null || overlap(start.getTime(), end.getTime(), civilTime(date, rule.startMinute).getTime(), civilTime(date, rule.endMinute!).getTime())));
}
export function peakOccupancy(start: Date, end: Date, appointments: BusyAppointment[]) {
  const events = appointments.filter(app => overlap(start.getTime(), end.getTime(), app.scheduledAt.getTime(), app.scheduledAt.getTime() + app.durationMin * MINUTE))
    .flatMap(app => [[Math.max(start.getTime(), app.scheduledAt.getTime()), 1], [Math.min(end.getTime(), app.scheduledAt.getTime() + app.durationMin * MINUTE), -1]] as [number, number][])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let count = 0, peak = 0;
  for (const [, change] of events) { count += change; peak = Math.max(peak, count); }
  return peak;
}
export function availabilityForDate(date: string, policy: SchedulePolicy, appointments: BusyAppointment[], attendantId?: string, now = new Date()) {
  return slotsForDate(date, policy.settings).map(slot => {
    const end = new Date(slot.at.getTime() + policy.settings.slotMinutes * MINUTE);
    const blocked = blockingRules(date, slot.at, end, policy).length > 0;
    const capacity = capacityAt(date, slot.minute, policy);
    const taken = peakOccupancy(slot.at, end, appointments);
    const attendantBusy = !!attendantId && appointments.some(app => app.attendantId === attendantId && overlap(slot.at.getTime(), end.getTime(), app.scheduledAt.getTime(), app.scheduledAt.getTime() + app.durationMin * MINUTE));
    return {
      time: slot.time, scheduledAt: slot.at.toISOString(), durationMin: policy.settings.slotMinutes, capacity, taken, remaining: blocked ? 0 : Math.max(0, capacity - taken), blocked,
      available: !blocked && !attendantBusy && taken < capacity && slot.at.getTime() >= now.getTime() + policy.settings.minLeadMinutes * MINUTE
    };
  });
}
