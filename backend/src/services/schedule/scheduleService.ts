import { prisma } from '../../database/index.js';
import { AppointmentStatus } from '@prisma/client';

export interface AvailableSlot {
  time: string; // "08:00", "08:30"
  dateTimeIso: string; // ISO string completa para a gravação
}

export const OPERATING_SLOTS = [
  '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00'
];

/**
 * Retorna os horários livres para uma data específica (YYYY-MM-DD).
 */
export const getAvailableSlots = async (targetDateStr: string): Promise<AvailableSlot[]> => {
  const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

  // Validação de final de semana (0 = Domingo, 6 = Sábado)
  const dayOfWeek = targetDate.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return [];
  }

  // Define o início e o fim do dia para busca de agendamentos existentes
  const startOfDay = new Date(targetDate);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Busca agendamentos já marcados para o dia selecionado
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

  // Mapeia os horários já ocupados ("08:00", "09:30")
  const bookedTimes = existingAppointments.map(app => {
    const hours = String(app.scheduledAt.getUTCHours()).padStart(2, '0');
    const minutes = String(app.scheduledAt.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  });

  const now = new Date();
  const availableSlots: AvailableSlot[] = [];

  for (const timeSlot of OPERATING_SLOTS) {
    if (bookedTimes.includes(timeSlot)) {
      continue; // Horário ocupado
    }

    const parts = timeSlot.split(':');
    const hours = parseInt(parts[0] ?? '0', 10);
    const minutes = parseInt(parts[1] ?? '0', 10);

    const slotDateTime = new Date(targetDate);
    slotDateTime.setUTCHours(hours, minutes, 0, 0);

    // Se a data for o dia atual e o horário já passou, ignora
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

/**
 * Cria um novo agendamento e retorna os detalhes e o guia de documentos.
 */
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

  // 3. Atualiza os dados do usuário na UserSession para consultas futuras
  await prisma.userSession.update({
    where: { id: data.sessionId },
    data: {
      userName: data.userName,
      userCpf: data.userCpf
    }
  });

  return appointment;
};