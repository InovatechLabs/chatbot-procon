import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  listAppointmentsSchema,
  availabilitySchema,
  idParamSchema,
} from './appointmentSchemas.js';
import * as service from '../../services/appointments/appointmentService.js';

// Mesmo envelope dos demais controllers: { success, data } / { success: false, message }
function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      issues: error.issues,
    });
  }
  if (error instanceof service.AppointmentError) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) {
    // P2034: conflito entre transações simultâneas (dois agendamentos disputando o mesmo horário)
    return res.status(409).json({ success: false, code: 'SLOT_TAKEN', message: 'Horário indisponível. Tente novamente.' });
  }
  console.error(`${fallback}:`, error);
  return res.status(500).json({ success: false, message: fallback });
}

export const getAvailability = async (req: Request, res: Response) => {
  try {
    const { date, attendantId } = availabilitySchema.parse(req.query);
    const data = await service.getAvailability(date, attendantId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Falha ao buscar horários disponíveis');
  }
};

export const listAppointments = async (req: Request, res: Response) => {
  try {
    const data = await service.listAppointments(listAppointmentsSchema.parse(req.query));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Falha ao listar agendamentos');
  }
};

export const createAppointment = async (req: Request, res: Response) => {
  try {
    const input = createAppointmentSchema.parse(req.body);
    const data = await service.createAppointment(input);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Falha ao criar agendamento');
  }
};

export const getAppointmentHistory = async (req: Request, res: Response) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await service.getAppointmentHistory(id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Falha ao buscar histórico do agendamento');
  }
};

export const updateAppointment = async (req: Request, res: Response) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await service.updateAppointment(id, updateAppointmentSchema.parse(req.body));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Falha ao atualizar agendamento');
  }
};

export const cancelAppointment = async (req: Request, res: Response) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await service.cancelAppointment(id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Falha ao cancelar agendamento');
  }
};
