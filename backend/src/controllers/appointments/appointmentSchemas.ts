import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato YYYY-MM-DD');
// Exige fuso explícito (ex.: 2026-10-20T14:00:00-03:00) para não haver ambiguidade
const isoDateTime = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const status = z.enum(['PENDING', 'COMPLETED', 'CANCELLED']);

export const createAppointmentSchema = z.object({
  phoneNumber: z.string().min(10).max(20),
  scheduledAt: isoDateTime,
  citizenName: z.string().trim().min(2).max(120).optional(),
  subject: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  attendantId: z.uuid().optional(),
});

export const updateAppointmentSchema = z
  .object({
    scheduledAt: isoDateTime.optional(),
    status: status.optional(),
    attendantId: z.uuid().nullable().optional(),
    citizenName: z.string().trim().min(2).max(120).optional(),
    subject: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'Informe ao menos um campo' });

export const listAppointmentsSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  mes: z.string().regex(/^\d{4}-\d{2}$/, 'Use o formato YYYY-MM').optional(),
  status: status.optional(),
  attendantId: z.string().uuid().optional(),
  phoneNumber: z.string().min(10).max(20).optional(),
});

export const availabilitySchema = z.object({
  date: isoDate,
  attendantId: z.uuid().optional(),
});

export const idParamSchema = z.object({ id: z.uuid() });
