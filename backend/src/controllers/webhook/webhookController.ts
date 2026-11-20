import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { persistIncoming, persistDeliveryUpdates, type DeliveryUpdate } from '../../services/whatsapp/durableMessages.js';
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

// Guarda apenas campos usados na conversa, sem perfis, URLs ou bytes de mídia.
const incomingSchema = z.object({ id: z.string().min(1).max(512), from: z.string().regex(/^\d{7,20}$/), type: z.string().min(1).max(40),
  timestamp: z.string().regex(/^\d{1,10}$/).optional(),
  text: z.object({ body: z.string().max(10000) }).optional(),
  audio: z.object({ id: z.string().regex(/^\d{1,32}$/) }).optional().catch(undefined),
  interactive: z.object({ type: z.string(), button_reply: z.object({ id: z.string().max(512) }).optional(), list_reply: z.object({ id: z.string().max(512) }).optional() }).optional(),
}).superRefine((value, ctx) => {
  if (value.type === 'text' && !value.text) ctx.addIssue({ code: 'custom', message: 'Texto ausente.' });
  if (value.type === 'interactive' && !value.interactive?.button_reply && !value.interactive?.list_reply) ctx.addIssue({ code: 'custom', message: 'Seleção ausente.' });
});

const deliverySchema = z.object({ id: z.string().min(1).max(512), status: z.enum(['sent', 'delivered', 'read', 'failed']), biz_opaque_callback_data: z.string().max(512).optional() });

export const createWebhookEventHandler = (persist = persistIncoming, persistStatuses = persistDeliveryUpdates) => async (req: Request, res: Response): Promise<any> => {
  if (req.body.object !== 'whatsapp_business_account') return res.sendStatus(404);
  if ((req.body.entry !== undefined && !Array.isArray(req.body.entry)) || (req.body.entry ?? []).some((entry: any) => !entry || !Array.isArray(entry.changes ?? []) || (entry.changes ?? []).some((change: any) => !change?.value || !Array.isArray(change.value.messages ?? [])))) {
    return res.status(400).json({ error: 'Estrutura de evento inválida.' });
  }
  console.info('Webhook Meta: assinatura validada.');
  const pending: IncomingMessage[] = [];
  const deliveries: DeliveryUpdate[] = [];
  for (const entry of req.body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (Array.isArray(change.value?.statuses)) for (const status of change.value.statuses) {
        const parsed = deliverySchema.safeParse(status);
        if (parsed.success) deliveries.push(parsed.data);
      }
      for (const message of change.value?.messages ?? []) {
        const parsed = incomingSchema.safeParse(message);
        if (!parsed.success) return res.status(400).json({ error: 'Mensagem inválida.' });
        pending.push({ id: parsed.data.id, from: parsed.data.from, type: parsed.data.type,
          ...(parsed.data.timestamp ? { timestamp: parsed.data.timestamp } : {}),
          ...(parsed.data.text ? { text: parsed.data.text } : {}),
          ...(parsed.data.type === 'audio' && parsed.data.audio ? { audio: parsed.data.audio } : {}),
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
    await persistStatuses(deliveries);
    return res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('Falha ao persistir webhook:', error instanceof Error ? error.name : 'erro');
    return res.sendStatus(503);
  }
};
export const handleWebhookEvent = createWebhookEventHandler();
