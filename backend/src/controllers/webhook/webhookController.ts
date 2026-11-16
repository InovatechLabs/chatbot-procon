import type { Request, Response } from 'express';
import { prisma } from '../../database/index.js';
import { sendTextMessage } from '../../services/metaAPI.js';
import { createConversationHandler } from './conversation.js';
import { MessageInbox } from './messageInbox.js';
import { normalize } from '../../utils/intents/intents.js';

export const verifyWebhook = async (req: Request, res: Response): Promise<any> => {
  if (req.query['hub.mode'] === 'subscribe' && process.env.META_VERIFY_TOKEN && req.query['hub.verify_token'] === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.sendStatus(403);
};

const inbox = new MessageInbox(createConversationHandler(), async message => {
  const session = await prisma.userSession.findFirst({ where: { phoneNumber: message.from, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
  if (session?.stepState?.startsWith('SCH_') || session?.stepState?.startsWith('FEEDBACK_') || session?.stepState === 'AWAIT_RATING') return false;
  if (!session?.currentStepId) return true;
  const options = await prisma.option.findMany({ where: { stepId: session.currentStepId } });
  return !options.some(option => normalize(option.text) === normalize(message.text?.body ?? ''));
}, 5000, async (message, error) => {
  console.error('Erro ao processar conversa:', error instanceof Error ? error.message : 'erro');
  await sendTextMessage(message.from, 'O atendimento está temporariamente indisponível. Tente novamente em alguns instantes ou fale com o PROCON pelo (12) 3955-9130. Para recomeçar, digite menu.');
});

export const handleWebhookEvent = async (req: Request, res: Response): Promise<any> => {
  if (req.body.object !== 'whatsapp_business_account') return res.sendStatus(404);
  res.status(200).send('EVENT_RECEIVED');
  const pending: Promise<void>[] = [];
  for (const entry of req.body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (typeof message.from === 'string' && typeof message.id === 'string') pending.push(inbox.enqueue(message));
      }
    }
  }
  await Promise.allSettled(pending);
};
