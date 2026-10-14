import { AppointmentStatus } from '@prisma/client';
import { prisma } from '../../database/index.js';
import * as appointmentService from '../appointments/appointmentService.js';

export interface AvailableSlot {
  time: string;
  dateTimeIso: string;
}

export const getPendingAppointment = async (phoneNumber: string) => {
  const variants = appointmentService.phoneVariants(phoneNumber);
  return await prisma.appointment.findFirst({
    where: {
      phoneNumber: { in: variants },
      status: AppointmentStatus.PENDING,
      scheduledAt: { gte: new Date() },
    },
    include: { documentGuide: true },
  });
};

export const getAvailableSlots = async (targetDateStr: string): Promise<AvailableSlot[]> => {
  const slots = await appointmentService.getAvailability(targetDateStr);
  return slots
    .filter((s) => s.available)
    .map((s) => ({
      time: s.time,
      dateTimeIso: s.scheduledAt,
    }));
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
  return await appointmentService.createAppointment({
    sessionId: data.sessionId,
    phoneNumber: data.phoneNumber,
    scheduledAt: new Date(data.scheduledAtIso),
    categoryKey: data.categoryKey,
    userName: data.userName,
    citizenName: data.userName,
    userCpf: data.userCpf,
    issueSummary: data.issueSummary,
    notes: data.issueSummary,
    source: 'WHATSAPP',
  });
};