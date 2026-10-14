import { prisma } from '../../database/index.js';
import { AppointmentStatus } from '@prisma/client';

export interface AvailableSlot {
  time: string;
  dateTimeIso: string;
}

export const OPERATING_SLOTS = [
  '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00'
];

/**
 * Verifica se o usuário possui algum agendamento ativo pendente.
 */
export const getPendingAppointment = async (phoneNumber: string) => {
  return await prisma.appointment.findFirst({
    where: {
      phoneNumber,
      status: AppointmentStatus.SCHEDULED,
    },
    include: {
      documentGuide: true
    }
  });
};

export const getAvailableSlots = async (targetDateStr: string): Promise<AvailableSlot[]> => {
  const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

  const dayOfWeek = targetDate.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return [];
  }

  const startOfDay = new Date(`${targetDateStr}T00:00:00-03:00`);
  const endOfDay = new Date(`${targetDateStr}T23:59:59-03:00`);

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      scheduledAt: {
        gte: startOfDay,
        lte: endOfDay
      },
      status: AppointmentStatus.SCHEDULED
    },
    select: { scheduledAt: true }
  });

  const bookedTimes = existingAppointments.map(app => {
    return app.scheduledAt.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  });

  const now = new Date();
  const availableSlots: AvailableSlot[] = [];

  for (const timeSlot of OPERATING_SLOTS) {
    if (bookedTimes.includes(timeSlot)) {
      continue;
    }

    const slotDateTime = new Date(`${targetDateStr}T${timeSlot}:00-03:00`);

    if (slotDateTime.getTime() < now.getTime()) {
      continue;
    }

    availableSlots.push({
      time: timeSlot,
      dateTimeIso: slotDateTime.toISOString()
    });
  }

  return availableSlots;
};

export const createAppointment = async (data: {
  sessionId: string;
  categoryKey: string;
  userName: string;
  userCpf: string;
  phoneNumber: string;
  scheduledAtIso: string;
  issueSummary?: string;
}) => {
  const scheduledDate = new Date(data.scheduledAtIso);

  const docGuide = await prisma.documentGuide.findUnique({
    where: { categoryKey: data.categoryKey }
  });

  const categoryName = docGuide ? docGuide.categoryName : 'Atendimento Geral';

  const appointment = await prisma.appointment.create({
    data: {
      sessionId: data.sessionId,
      documentGuideId: docGuide?.id ?? null,
      userName: data.userName,
      userCpf: data.userCpf,
      phoneNumber: data.phoneNumber,
      categoryName,
      issueSummary: data.issueSummary ?? null,
      scheduledAt: scheduledDate,
      status: AppointmentStatus.SCHEDULED
    },
    include: {
      documentGuide: true
    }
  });

  await prisma.userSession.update({
    where: { id: data.sessionId },
    data: {
      userName: data.userName,
      userCpf: data.userCpf
    }
  });

  return appointment;
};