import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { persistIncoming } from '../../services/whatsapp/durableMessages.js';
import type { IncomingMessage } from './conversation.js';
import { z } from 'zod';

export const verifyWebhook = async (req: Request, res: Response): Promise<any> => {
  const token = req.query['hub.verify_token'];
  const expected = process.env.META_VERIFY_TOKEN;
  const challenge = req.query['hub.challenge'];
  if (req.query['hub.mode'] === 'subscribe' && expected && typeof token === 'string' && typeof challenge === 'string' && challenge.length > 0 && challenge.length <= 512) {
    const actualBytes = Buffer.from(token); const expectedBytes = Buffer.from(expected);
    if (actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)) return res.status(200).type('text/plain').send(challenge);
  }
  return res.sendStatus(403);
};

// Guarda apenas os campos consumidos pelo bot, sem perfis, URLs ou bytes de mídia.
const incomingSchema = z.object({ id: z.string().min(1).max(512), from: z.string().regex(/^\d{7,20}$/), type: z.string().min(1).max(40),
  text: z.object({ body: z.string().max(10000) }).optional(),
  button: z.object({ payload: z.string().max(512).optional() }).optional(),
  interactive: z.object({ type: z.string(), button_reply: z.object({ id: z.string().max(512) }).optional(), list_reply: z.object({ id: z.string().max(512) }).optional() }).optional(),
}).superRefine((value, ctx) => {
  if (value.type === 'text' && !value.text) ctx.addIssue({ code: 'custom', message: 'Texto ausente.' });
  if (value.type === 'interactive' && !value.interactive?.button_reply && !value.interactive?.list_reply) ctx.addIssue({ code: 'custom', message: 'Seleção ausente.' });
});

export const createWebhookEventHandler = (persist = persistIncoming) => async (req: Request, res: Response): Promise<any> => {
  if (req.body.object !== 'whatsapp_business_account') return res.sendStatus(404);
  if ((req.body.entry !== undefined && !Array.isArray(req.body.entry)) || (req.body.entry ?? []).some((entry: any) => !entry || !Array.isArray(entry.changes ?? []) || (entry.changes ?? []).some((change: any) => !change?.value || !Array.isArray(change.value.messages ?? [])))) {
    return res.status(400).json({ error: 'Estrutura de evento inválida.' });
  }
  console.info('Webhook Meta: assinatura validada.');
  const pending: IncomingMessage[] = [];
  for (const entry of req.body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const parsed = incomingSchema.safeParse(message);
        if (!parsed.success) return res.status(400).json({ error: 'Mensagem inválida.' });
        pending.push({ id: parsed.data.id, from: parsed.data.from, type: parsed.data.type,
          ...(parsed.data.text ? { text: parsed.data.text } : {}),
          ...(parsed.data.button?.payload ? { button: { payload: parsed.data.button.payload } } : {}),
          ...(parsed.data.interactive ? { interactive: { type: parsed.data.interactive.type,
            ...(parsed.data.interactive.button_reply ? { button_reply: parsed.data.interactive.button_reply } : {}),
            ...(parsed.data.interactive.list_reply ? { list_reply: parsed.data.interactive.list_reply } : {}),
          } } : {}),
        });
      }
    }
  }
  try {
    await persist(pending);
    return res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('Falha ao persistir webhook:', error instanceof Error ? error.name : 'erro');
    return res.sendStatus(503);
  }
};
export const handleWebhookEvent = createWebhookEventHandler();
