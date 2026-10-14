import { Prisma, AppointmentStatus } from '@prisma/client';
import { prisma } from '../../database/index.js';
import { SCHEDULE, HISTORY_LIMIT } from './scheduleConfig.js';

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
  userName?: string | undefined;
  userCpf?: string | undefined;
  subject?: string | undefined;
  categoryName?: string | undefined;
  categoryKey?: string | undefined;
  notes?: string | undefined;
  issueSummary?: string | undefined;
  attendantId?: string | undefined;
  source?: 'PANEL' | 'WHATSAPP' | undefined;
  sessionId?: string | undefined;
}

export interface UpdateAppointmentInput {
  scheduledAt?: Date | undefined;
  status?: AppointmentStatus | undefined;
  attendantId?: string | null | undefined;
  citizenName?: string | undefined;
  userName?: string | undefined;
  subject?: string | undefined;
  notes?: string | undefined;
}

export interface ListAppointmentsInput {
  from?: string | undefined; // YYYY-MM-DD
  to?: string | undefined;   // YYYY-MM-DD
  mes?: string | undefined;  // YYYY-MM (usado pelo Painel React)
  status?: AppointmentStatus | undefined;
  attendantId?: string | undefined;
  phoneNumber?: string | undefined;
}

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const MINUTE = 60_000;
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length <= 11 ? `55${digits}` : digits;
}

function defined<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

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

// --- CASOS DE USO ---

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

    const session = input.sessionId
      ? await tx.userSession.findUnique({ where: { id: input.sessionId } })
      : await tx.userSession.findFirst({
          where: { phoneNumber: { in: variants } },
          orderBy: { createdAt: 'desc' },
        });

    let docGuideId: string | null = null;
    let categoryName = input.categoryName ?? input.subject ?? 'Atendimento Geral';

    if (input.categoryKey) {
      const docGuide = await tx.documentGuide.findUnique({ where: { categoryKey: input.categoryKey } });
      if (docGuide) {
        docGuideId = docGuide.id;
        categoryName = docGuide.categoryName;
      }
    }

    const citizenName = input.citizenName ?? input.userName ?? session?.userName ?? 'Cidadão';

    return tx.appointment.create({
      data: {
        phoneNumber: session?.phoneNumber ?? normalizePhone(input.phoneNumber),
        userName: citizenName,
        citizenName,
        userCpf: input.userCpf ?? session?.userCpf ?? null,
        subject: categoryName,
        categoryName,
        scheduledAt: input.scheduledAt,
        durationMin: SCHEDULE.slotMinutes,
        source: input.source ?? 'PANEL',
        sessionId: session?.id ?? null,
        documentGuideId: docGuideId,
        attendantId: input.attendantId ?? null,
        ...defined({
          notes: input.notes ?? input.issueSummary,
          issueSummary: input.issueSummary ?? input.notes,
        }),
      },
      include: { attendant: true, documentGuide: true },
    });
  }, SERIALIZABLE);
}

export async function listAppointments(q: ListAppointmentsInput) {
  const range: Prisma.DateTimeFilter = {};

  if (q.mes) {
    const [yyyy, mm] = q.mes.split('-');
    const startDate = `${yyyy}-${mm}-01`;
    const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
    const endDate = `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`;
    range.gte = dayStart(startDate);
    range.lt = dayStart(addDays(endDate, 1));
  } else {
    if (q.from) range.gte = dayStart(q.from);
    if (q.to) range.lt = dayStart(addDays(q.to, 1));
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      ...(q.from || q.to || q.mes ? { scheduledAt: range } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.attendantId ? { attendantId: q.attendantId } : {}),
      ...(q.phoneNumber ? { phoneNumber: { in: phoneVariants(q.phoneNumber) } } : {}),
    },
    include: { attendant: true, documentGuide: true },
    orderBy: { scheduledAt: 'asc' },
  });

  // Mapeia os campos para que o Painel React (Agenda.tsx) receba os atributos que espera
  return appointments.map((app) => {
    const local = localParts(app.scheduledAt);
    return {
      ...app,
      data: local.date,
      horario: local.time,
      nomeCliente: app.citizenName ?? app.userName ?? 'Nome não informado',
      telefone: app.phoneNumber,
      assunto: app.subject ?? app.categoryName ?? 'Sem assunto',
      status: app.status.toLowerCase(), // 'pending' -> 'pendente'
      origem: app.source,
    };
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

    if (current.status !== AppointmentStatus.PENDING && (slotChanged || attendantChanged)) {
      throw new AppointmentError(409, 'Agendamento já finalizado ou cancelado.', 'ALREADY_CLOSED');
    }

    const nextStatus = input.status ?? current.status;
    if (nextStatus === AppointmentStatus.PENDING && (slotChanged || attendantChanged)) {
      if (slotChanged && input.scheduledAt) assertValidFutureSlot(input.scheduledAt);
      const nextAttendant = input.attendantId === undefined ? current.attendantId : input.attendantId;
      await assertAvailable(tx, input.scheduledAt ?? current.scheduledAt, nextAttendant, id);
    }

    // 🟢 Utiliza defined(...) para limpar propriedades com valor undefined antes de enviar ao Prisma
    const updated = await tx.appointment.update({
      where: { id },
      data: {
        ...defined({
          scheduledAt: slotChanged ? input.scheduledAt : undefined,
          status: input.status,
          citizenName: input.citizenName ?? input.userName,
          userName: input.userName ?? input.citizenName,
          subject: input.subject,
          notes: input.notes,
        }),
        ...(attendantChanged ? { attendantId: input.attendantId ?? null } : {}),
      },
      include: { attendant: true },
    });

    const local = localParts(updated.scheduledAt);
    return {
      ...updated,
      data: local.date,
      horario: local.time,
      nomeCliente: updated.citizenName ?? updated.userName,
      telefone: updated.phoneNumber,
      status: updated.status.toLowerCase(),
    };
  }, SERIALIZABLE);
}

export const cancelAppointment = (id: string) =>
  updateAppointment(id, { status: AppointmentStatus.CANCELLED });

export async function getAppointmentHistory(id: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { attendant: true },
  });
  if (!appointment) throw new AppointmentError(404, 'Agendamento não encontrado.', 'NOT_FOUND');

  let targetSession = null;

  // 1. Se o agendamento possui sessionId vinculado, busca essa sessão específica
  if (appointment.sessionId) {
    targetSession = await prisma.userSession.findUnique({
      where: { id: appointment.sessionId },
      include: { currentStep: { select: { id: true, title: true } } },
    });
  }

  // 2. Fallback: se foi agendado pelo painel e não tem sessionId, busca a sessão mais recente do número
  if (!targetSession) {
    const variants = phoneVariants(appointment.phoneNumber);
    targetSession = await prisma.userSession.findFirst({
      where: { phoneNumber: { in: variants } },
      include: { currentStep: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 3. Busca apenas as mensagens da sessão identificada
  const logs = targetSession
    ? await prisma.chatLog.findMany({
        where: { sessionId: targetSession.id },
        orderBy: { timestamp: 'desc' },
        take: HISTORY_LIMIT + 1,
        include: { step: { select: { id: true, title: true } } },
      })
    : [];

  return {
    appointment,
    sessao: targetSession
      ? {
          etapaAtual: targetSession.currentStep?.title ?? null,
          status: targetSession.status,
          nota: targetSession.rating ?? null,
        }
      : null,
    mensagens: logs
      .slice(0, HISTORY_LIMIT)
      .map((log) => ({
        id: log.id,
        direction: log.direction,
        timestamp: log.timestamp.toISOString(),
        etapa: log.step?.title ?? null,
        messageText: log.messageText,
      }))
      .reverse(),
    truncado: logs.length > HISTORY_LIMIT,
  };
}