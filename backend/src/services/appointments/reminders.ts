import { prisma, inDatabaseTransaction } from '../../database/index.js';
import { sendTextMessage, sendInteractiveMessage } from '../metaAPI.js';
import { queueOutgoing } from '../whatsapp/durableMessages.js';
import { MENU_OPTION } from '../whatsapp/messagePolicy.js';
import type { MetaPayload } from '../whatsapp/outgoingContext.js';
import { AppointmentError, cancelAppointment, phoneVariants } from './appointmentService.js';
import { localParts, weekdayOf } from './schedulePolicy.js';

const MINUTE = 60_000;
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export interface ReminderConfig {
  enabled: boolean;
  template: string;
  language: string;
  address: string;
  hoursBefore: number;
  minLeadMinutes: number;
  minAgeMinutes: number;
  startMinute: number;
  endMinute: number;
}

const integer = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

// Desligado por padrão: só envia com REMINDERS_ENABLED=true e o template aprovado na Meta.
export const reminderConfig = (): ReminderConfig => ({
  enabled: process.env.REMINDERS_ENABLED === 'true' && !!process.env.REMINDER_TEMPLATE_NAME,
  template: process.env.REMINDER_TEMPLATE_NAME ?? '',
  language: process.env.REMINDER_TEMPLATE_LANG || 'pt_BR',
  address: process.env.PROCON_ENDERECO || 'PROCON de Jacareí',
  hoursBefore: integer(process.env.REMINDER_HOURS_BEFORE, 24, 2, 72),
  minLeadMinutes: 60, // não lembra atendimentos que começam em menos de 1 hora
  minAgeMinutes: integer(process.env.REMINDER_MIN_AGE_MINUTES, 120, 0, 1440), // evita lembrar logo após marcar
  startMinute: 8 * 60, // só envia entre 08:00 e 20:00 (horário de Brasília)
  endMinute: 20 * 60,
});

export function whenLabel(at: Date) {
  const { date, time } = localParts(at);
  const [year, month, day] = date.split('-');
  return { date: `${WEEKDAYS[weekdayOf(date)] ?? ''}, ${day}/${month}/${year}`, time };
}

// Parâmetros de template não aceitam quebras de linha, tabs nem espaços repetidos.
const clean = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);

export interface ReminderAppointment {
  id: string;
  phoneNumber: string;
  citizenName: string | null;
  userName: string | null;
  scheduledAt: Date;
}

export function buildReminderPayload(appointment: ReminderAppointment, cfg: ReminderConfig): MetaPayload {
  const firstName = clean(appointment.citizenName ?? appointment.userName ?? '', 80).split(' ')[0] || 'cidadão';
  const { date, time } = whenLabel(appointment.scheduledAt);
  return {
    messaging_product: 'whatsapp',
    to: appointment.phoneNumber,
    type: 'template',
    template: {
      name: cfg.template,
      language: { code: cfg.language },
      components: [
        { type: 'body', parameters: [firstName, date, time, clean(cfg.address, 300)].map(text => ({ type: 'text', text })) },
        { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `rem_ok:${appointment.id}` }] },
        { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `rem_no:${appointment.id}` }] },
      ],
    },
  };
}

/**
 * Enfileira (uma única vez) o lembrete dos atendimentos pendentes que ocorrem nas próximas
 * `hoursBefore` horas. A marcação e o enfileiramento acontecem na mesma transação; várias
 * instâncias podem rodar ao mesmo tempo (FOR UPDATE SKIP LOCKED). Retorna quantos foram enfileirados.
 */
export async function queueDueReminders(now = new Date(), cfg: ReminderConfig = reminderConfig()): Promise<number> {
  if (!cfg.enabled) return 0;
  const { time } = localParts(now);
  const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  if (minute < cfg.startMinute || minute >= cfg.endMinute) return 0;
  const from = new Date(now.getTime() + cfg.minLeadMinutes * MINUTE);
  const to = new Date(now.getTime() + cfg.hoursBefore * 60 * MINUTE);
  const createdBefore = new Date(now.getTime() - cfg.minAgeMinutes * MINUTE);
  return inDatabaseTransaction(async () => {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Appointment"
      WHERE "status" = 'PENDING' AND "reminderQueuedAt" IS NULL
      AND "scheduledAt" > ${from} AND "scheduledAt" <= ${to} AND "createdAt" <= ${createdBefore}
      ORDER BY "scheduledAt" LIMIT 25 FOR UPDATE SKIP LOCKED`;
    for (const { id } of rows) {
      const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id } });
      await queueOutgoing(buildReminderPayload(appointment, cfg));
      await prisma.appointment.update({ where: { id }, data: { reminderQueuedAt: now } });
    }
    return rows.length;
  }, 30_000);
}

const REPLY = /^rem_(ok|no):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Trata o toque nos botões do lembrete (mensagem do tipo "button", payload rem_ok:<id> / rem_no:<id>).
 * Retorna false se o payload não for de lembrete, para o fluxo normal da conversa seguir.
 */
export async function handleReminderReply(phone: string, payload: string): Promise<boolean> {
  const match = REPLY.exec(payload);
  const action = match?.[1]?.toLowerCase();
  const id = match?.[2];
  if (!action || !id) return false;
  // O número que respondeu precisa ser o dono do agendamento.
  const appointment = await prisma.appointment.findFirst({ where: { id, phoneNumber: { in: phoneVariants(phone) } } });
  if (!appointment || appointment.status !== 'PENDING' || appointment.scheduledAt.getTime() <= Date.now()) {
    await sendTextMessage(phone, 'Não encontrei um atendimento pendente para esta resposta. Se precisar de um novo horário, digite *menu*.');
    return true;
  }
  const { date, time } = whenLabel(appointment.scheduledAt);
  if (action === 'ok') {
    await prisma.appointment.update({ where: { id }, data: { confirmedAt: new Date() } });
    await sendTextMessage(phone, `Presença confirmada! Esperamos você em *${date}* às *${time}* no PROCON de Jacareí. Leve um documento com foto e os documentos do seu caso. Se precisar mudar o horário, ligue para (12) 3955-9130.`);
    return true;
  }
  try {
    await cancelAppointment(id);
  } catch (error) {
    if (!(error instanceof AppointmentError)) throw error;
    await sendTextMessage(phone, 'Não foi possível cancelar este atendimento por aqui. Ligue para (12) 3955-9130 para falar com a equipe.');
    return true;
  }
  await sendInteractiveMessage(phone, `Seu atendimento de *${date}* às *${time}* foi cancelado e o horário foi liberado. Quer marcar outro?`,
    [{ id: 'btn_agendar_sim', text: 'Agendar novo horário' }, MENU_OPTION]);
  return true;
}
