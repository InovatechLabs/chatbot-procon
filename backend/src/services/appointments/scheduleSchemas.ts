import { z } from 'zod';
export const civilDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Data inválida.');
const days = z.array(z.number().int().min(0).max(6)).max(7).refine(values => new Set(values).size === values.length, 'Dias repetidos.');
export const settingsSchema = z.object({
  capacity: z.number().int().min(1).max(1000),
  startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440),
  slotMinutes: z.number().int().min(5).max(480), minLeadMinutes: z.number().int().min(0).max(10080),
  workDays: days.refine(values => values.length > 0, 'Escolha ao menos um dia.'),
}).strict().refine(value => value.endMinute - value.startMinute >= value.slotMinutes, 'O expediente precisa comportar um atendimento completo.');
export const capacitySchema = z.object({ date: civilDateSchema, minute: z.number().int().min(-1).max(1439), capacity: z.number().int().min(1).max(1000) }).strict();
export const blockSchema = z.object({
  startDate: civilDateSchema.nullable(), endDate: civilDateSchema.nullable(), weekDays: days,
  startMinute: z.number().int().min(0).max(1439).nullable(), endMinute: z.number().int().min(1).max(1440).nullable(),
  note: z.string().trim().max(300).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) ctx.addIssue({ code: 'custom', message: 'A data final deve ser posterior à inicial.' });
  if (!value.weekDays.length && (!value.startDate || !value.endDate)) ctx.addIssue({ code: 'custom', message: 'Informe um período completo ou dias recorrentes.' });
  if ((value.startMinute === null) !== (value.endMinute === null) || (value.startMinute !== null && value.endMinute !== null && value.startMinute >= value.endMinute)) ctx.addIssue({ code: 'custom', message: 'Informe início e fim válidos, ou marque dia inteiro.' });
});
