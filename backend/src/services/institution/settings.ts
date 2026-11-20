import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { charLength } from '../whatsapp/messagePolicy.js';

const contact = (max: number) => z.string().trim().min(1).max(max).regex(/^[^{}\r\n]+$/u);
const message = z.string().trim().min(1).max(600);
export const institutionSchema = z.object({
  name: contact(100),
  address: contact(240),
  phone: contact(36).refine(value => /^\+?[\d() .-]+$/.test(value) && value.replace(/\D/g, '').length >= 8),
  email: contact(160).pipe(z.email()),
  hours: contact(200),
  referralMessage: message,
  appointmentMessage: message,
  unavailableMessage: message,
  rescheduleMessage: message,
  privacyMessage: message,
  queueMessage: message,
}).strict();
export type Institution = z.infer<typeof institutionSchema>;

export const defaultInstitution = (): Institution => ({
  name: 'PROCON de Jacareí',
  address: process.env.PROCON_ENDERECO?.trim() || 'Rua Capitão Joaquim Pinheiro do Prado, 222, Centro, Jacareí-SP',
  phone: '(12) 3955-9130',
  email: 'procon@jacarei.sp.gov.br',
  hours: process.env.PROCON_HORARIO?.trim() || 'consulte pelo telefone',
  referralMessage: 'A equipe pode ouvir e analisar seu caso presencialmente. Quer agendar?',
  appointmentMessage: 'Posso ajudar a marcar atendimento presencial em {{nome}}. Quer agendar?',
  unavailableMessage: 'Minha consulta está temporariamente indisponível. Tente novamente em alguns instantes ou fale com a equipe pelo {{telefone}}. Você também pode usar as opções do menu.',
  rescheduleMessage: 'Por aqui eu ainda não consigo cancelar ou remarcar. Fale com a equipe pelo telefone ou WhatsApp {{telefone}} para ajustar o seu horário.',
  privacyMessage: 'Para dúvidas sobre o uso dos seus dados ou para pedir que sejam apagados, fale com a equipe pelo {{telefone}} ou {{email}}. Por aqui não consigo excluir dados. Seu pedido precisa ser analisado pela equipe.',
  queueMessage: 'Você entrou na fila de atendimento. Um atendente deve assumir a conversa em breve.',
});

const contacts = { nome: 'name', endereco: 'address', telefone: 'phone', email: 'email', horario: 'hours' } as const;
const placeholders = /\{\{(nome|endereco|telefone|email|horario)\}\}/g;
export const renderInstitution = (text: string, settings: Institution) =>
  text.replace(placeholders, (_, key: keyof typeof contacts) => settings[contacts[key]]);

export const institutionMessageKeys = ['referralMessage', 'appointmentMessage', 'unavailableMessage', 'rescheduleMessage', 'privacyMessage', 'queueMessage'] as const;

export const institutionMutation = z.object({
  version: z.number().int().min(0).max(2_147_483_646),
  value: institutionSchema.superRefine((value, ctx) => {
    for (const key of institutionMessageKeys) {
      const template = value[key];
      if (/[{}]/.test(template.replace(placeholders, '')) || charLength(renderInstitution(template, value)) > 700) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Use apenas os campos indicados e até 700 caracteres após a substituição.' });
      }
    }
  }),
}).strict();

export async function readInstitution(db: Pick<PrismaClient, 'institutionSettings'>) {
  // Alguns fluxos de teste usam dependências em memória, sem esse delegado.
  return await db.institutionSettings?.findUnique({ where: { id: 'main' } })
    ?? { ...defaultInstitution(), version: 0, updatedAt: null };
}
