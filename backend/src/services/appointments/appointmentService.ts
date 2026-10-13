import { Prisma, AppointmentStatus } from '@prisma/client';
import { prisma } from '../../database/index.js';
import { SCHEDULE, HISTORY_LIMIT } from './scheduleConfig.js';

// ---------- tipos ----------

export class AppointmentError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface CreateAppointmentInput {
  phoneNumber: string;
  scheduledAt: Date;
  citizenName?: string | undefined;
  subject?: string | undefined;
  notes?: string | undefined;
  attendantId?: string | undefined;
  source?: 'PANEL' | 'WHATSAPP' | undefined;
}

export interface UpdateAppointmentInput {
  scheduledAt?: Date | undefined;
  status?: AppointmentStatus | undefined;
  attendantId?: string | null | undefined;
  citizenName?: string | undefined;
  subject?: string | undefined;
  notes?: string | undefined;
}

export interface ListAppointmentsInput {
  from?: string | undefined; // YYYY-MM-DD
  to?: string | undefined;   // YYYY-MM-DD (inclusivo)
  status?: AppointmentStatus | undefined;
  attendantId?: string | undefined;
  phoneNumber?: string | undefined;
}

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const MINUTE = 60_000;
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ---------- utilidades ----------

/** Remove campos undefined (o tsconfig usa exactOptionalPropertyTypes, que rejeita undefined explícito no Prisma). */
function defined<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

/** Aceita "(11) 99999-9999", "11999999999" ou "5511999999999" e devolve só dígitos com DDI 55. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length <= 11 ? `55${digits}` : digits;
}

/**
 * A WhatsApp Cloud API pode entregar celulares brasileiros sem o 9º dígito (12 dígitos),
 * enquanto o painel recebe o número completo (13). Devolve as duas formas para casar
 * UserSession/ChatLog com o agendamento.
 */
export function phoneVariants(raw: string): string[] {
  const n = normalizePhone(raw);
  const variants = new Set<string>([n]);
  if (n.startsWith('55')) {
    const ddd = n.slice(2, 4);
    const rest = n.slice(4);
    if (rest.length === 9 && rest.startsWith('9')) variants.add(`55${ddd}${rest.slice(1)}`);
    if (rest.length === 8 && /^[6-9]/.test(rest)) variants.add(`55${ddd}9${rest}`);
  }
  return [...variants];
}

function localParts(d: Date) {
  const iso = new Date(d.getTime() + SCHEDULE.tzOffsetMinutes * MINUTE).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

function dayStart(date: string) {
  return new Date(`${date}T00:00:00${SCHEDULE.tzOffset}`);
}

function addDays(date: string, days: number) {
  return localParts(new Date(dayStart(date).getTime() + days * 24 * 60 * MINUTE)).date;
}

function slotsForDate(date: string): { time: string; at: Date }[] {
  const weekday = new Date(`${date}T12:00:00${SCHEDULE.tzOffset}`).getUTCDay();
  if (!SCHEDULE.workDays.includes(weekday)) return [];
  const slots: { time: string; at: Date }[] = [];
  for (let m = SCHEDULE.startHour * 60; m < SCHEDULE.endHour * 60; m += SCHEDULE.slotMinutes) {
    const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    slots.push({ time, at: new Date(`${date}T${time}:00${SCHEDULE.tzOffset}`) });
  }
  return slots;
}

/** "Seg 20/10 09:00" — cabe nos 24 caracteres de uma linha de lista do WhatsApp. */
export function formatSlotLabel(at: Date): string {
  const local = new Date(at.getTime() + SCHEDULE.tzOffsetMinutes * MINUTE);
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  return `${WEEKDAYS[local.getUTCDay()] ?? ''} ${dd}/${mm} ${localParts(at).time}`;
}

function assertValidFutureSlot(at: Date) {
  if (at.getTime() <= Date.now()) {
    throw new AppointmentError(422, 'O horário deve ser no futuro.', 'PAST_DATE');
  }
  const { date } = localParts(at);
  if (!slotsForDate(date).some((s) => s.at.getTime() === at.getTime())) {
    throw new AppointmentError(422, 'Horário fora da grade de atendimento.', 'INVALID_SLOT');
  }
}

/** Conflito: mesmo atendente no mesmo horário OU capacidade do horário esgotada. */
async function assertAvailable(
  tx: Prisma.TransactionClient,
  scheduledAt: Date,
  attendantId?: string | null,
  excludeId?: string
) {
  const base: Prisma.AppointmentWhereInput = {
    scheduledAt,
    status: { not: AppointmentStatus.CANCELLED },
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };

  if (attendantId) {
    const attendant = await tx.attendant.findFirst({ where: { id: attendantId, active: true } });
    if (!attendant) throw new AppointmentError(404, 'Atendente não encontrado.', 'ATTENDANT_NOT_FOUND');
    if (await tx.appointment.count({ where: { ...base, attendantId } })) {
      throw new AppointmentError(409, 'Atendente já possui atendimento neste horário.', 'SLOT_TAKEN');
    }
  }

  const [taken, activeAttendants] = await Promise.all([
    tx.appointment.count({ where: base }),
    tx.attendant.count({ where: { active: true } }),
  ]);
  if (taken >= Math.max(1, activeAttendants)) {
    throw new AppointmentError(409, 'Horário indisponível.', 'SLOT_TAKEN');
  }
}

// ---------- casos de uso ----------

export async function createAppointment(input: CreateAppointmentInput) {
  assertValidFutureSlot(input.scheduledAt);
  const variants = phoneVariants(input.phoneNumber);

  return prisma.$transaction(async (tx) => {
    await assertAvailable(tx, input.scheduledAt, input.attendantId);

    const already = await tx.appointment.findFirst({
      where: {
        phoneNumber: { in: variants },
        status: AppointmentStatus.PENDING,
        scheduledAt: { gte: new Date() },
      },
    });
    if (already) {
      throw new AppointmentError(409, 'Este número já possui um atendimento pendente.', 'ALREADY_SCHEDULED');
    }

    // Vínculo com a conversa do WhatsApp: usa o phoneNumber da própria sessão, que é o que o bot recebe da Meta
    const session = await tx.userSession.findFirst({
      where: { phoneNumber: { in: variants } },
      select: { id: true, phoneNumber: true },
    });

    return tx.appointment.create({
      data: {
        phoneNumber: session?.phoneNumber ?? normalizePhone(input.phoneNumber),
        scheduledAt: input.scheduledAt,
        durationMin: SCHEDULE.slotMinutes,
        source: input.source ?? 'PANEL',
        sessionId: session?.id ?? null,
        ...defined({
          citizenName: input.citizenName,
          subject: input.subject,
          notes: input.notes,
          attendantId: input.attendantId,
        }),
      },
      include: { attendant: true },
    });
  }, SERIALIZABLE);
}

export async function listAppointments(q: ListAppointmentsInput) {
  const range: Prisma.DateTimeFilter = {};
  if (q.from) range.gte = dayStart(q.from);
  if (q.to) range.lt = dayStart(addDays(q.to, 1));

  return prisma.appointment.findMany({
    where: {
      ...(q.from || q.to ? { scheduledAt: range } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.attendantId ? { attendantId: q.attendantId } : {}),
      ...(q.phoneNumber ? { phoneNumber: { in: phoneVariants(q.phoneNumber) } } : {}),
    },
    include: { attendant: true },
    orderBy: { scheduledAt: 'asc' },
  });
}

export async function getAvailability(date: string, attendantId?: string) {
  const slots = slotsForDate(date);
  const first = slots[0];
  const last = slots[slots.length - 1];
  if (!first || !last) return [];

  const end = new Date(last.at.getTime() + SCHEDULE.slotMinutes * MINUTE);
  const [appointments, activeAttendants] = await Promise.all([
    prisma.appointment.findMany({
      where: { scheduledAt: { gte: first.at, lt: end }, status: { not: AppointmentStatus.CANCELLED } },
      select: { scheduledAt: true, attendantId: true },
    }),
    prisma.attendant.count({ where: { active: true } }),
  ]);

  const capacity = Math.max(1, activeAttendants);
  const earliest = Date.now() + SCHEDULE.minLeadMinutes * MINUTE;

  return slots.map(({ time, at }) => {
    const inSlot = appointments.filter((a) => a.scheduledAt.getTime() === at.getTime());
    const attendantBusy = attendantId ? inSlot.some((a) => a.attendantId === attendantId) : false;
    return {
      time,
      scheduledAt: at.toISOString(),
      available: at.getTime() >= earliest && inSlot.length < capacity && !attendantBusy,
    };
  });
}

/** Próximos horários livres (para o bot oferecer no WhatsApp; a lista do WhatsApp comporta no máximo 10). */
export async function getUpcomingSlots(limit = 8, daysAhead = 14) {
  const out: { scheduledAt: string; label: string }[] = [];
  const today = localParts(new Date()).date;

  for (let i = 0; i < daysAhead && out.length < limit; i++) {
    const slots = await getAvailability(addDays(today, i));
    for (const s of slots) {
      if (!s.available) continue;
      out.push({ scheduledAt: s.scheduledAt, label: formatSlotLabel(new Date(s.scheduledAt)) });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export async function updateAppointment(id: string, input: UpdateAppointmentInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.appointment.findUnique({ where: { id } });
    if (!current) throw new AppointmentError(404, 'Agendamento não encontrado.', 'NOT_FOUND');

    const slotChanged =
      input.scheduledAt !== undefined && input.scheduledAt.getTime() !== current.scheduledAt.getTime();
    const attendantChanged = input.attendantId !== undefined && input.attendantId !== current.attendantId;
    const statusChanged = input.status !== undefined && input.status !== current.status;

    if ((slotChanged || attendantChanged || statusChanged) && current.status !== AppointmentStatus.PENDING) {
      throw new AppointmentError(409, 'Agendamento já finalizado ou cancelado.', 'ALREADY_CLOSED');
    }

    const nextStatus = input.status ?? current.status;
    if (nextStatus === AppointmentStatus.PENDING && (slotChanged || attendantChanged)) {
      if (slotChanged && input.scheduledAt) assertValidFutureSlot(input.scheduledAt);
      const nextAttendant = input.attendantId === undefined ? current.attendantId : input.attendantId;
      await assertAvailable(tx, input.scheduledAt ?? current.scheduledAt, nextAttendant, id);
    }

    return tx.appointment.update({
      where: { id },
      data: {
        ...defined({
          scheduledAt: slotChanged ? input.scheduledAt : undefined,
          status: input.status,
          citizenName: input.citizenName,
          subject: input.subject,
          notes: input.notes,
        }),
        ...(attendantChanged ? { attendantId: input.attendantId ?? null } : {}),
      },
      include: { attendant: true },
    });
  }, SERIALIZABLE);
}

/** Cancelamento lógico: mantém o registro e libera o horário. */
export const cancelAppointment = (id: string) =>
  updateAppointment(id, { status: AppointmentStatus.CANCELLED });

/** Agendamento + sessão do WhatsApp + mensagens em ordem cronológica (as HISTORY_LIMIT mais recentes). */
export async function getAppointmentHistory(id: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id }, include: { attendant: true } });
  if (!appointment) throw new AppointmentError(404, 'Agendamento não encontrado.', 'NOT_FOUND');

  const sessions = await prisma.userSession.findMany({
    where: { phoneNumber: { in: phoneVariants(appointment.phoneNumber) } },
    include: { currentStep: { select: { id: true, title: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  const logs = sessions.length
    ? await prisma.chatLog.findMany({
        where: { sessionId: { in: sessions.map((s) => s.id) } },
        orderBy: { timestamp: 'desc' },
        take: HISTORY_LIMIT + 1,
        include: { step: { select: { id: true, title: true } } },
      })
    : [];

  return {
    appointment,
    session: sessions[0] ?? null,
    messages: logs.slice(0, HISTORY_LIMIT).reverse(),
    truncated: logs.length > HISTORY_LIMIT,
  };
}
