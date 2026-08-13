import { Router } from 'express';
import type { Request, Response } from 'express';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { processMessage } from '../services/messageHandler.js';

const router = Router();

/**
 * Verificação do webhook exigida pela Meta ao cadastrar a URL no app do WhatsApp
 * (Meta for Developers > WhatsApp > Configuration > Webhook).
 */
router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('Webhook verificado com sucesso!');
    res.status(200).send(String(challenge ?? ''));
    return;
  }

  res.sendStatus(403);
});

/**
 * Recebimento de eventos (mensagens, status, etc.) enviados pela Meta.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    if (message && message.type === 'text') {
      const from: string = message.from;
      const text: string = message.text?.body?.trim() ?? '';

      console.log(`Mensagem recebida de ${from}: ${text}`);

      const resposta = processMessage(text);
      await sendWhatsAppMessage(from, resposta);
    }
  } catch (error) {
    console.error('Erro ao processar evento do webhook:', error);
  }

  // A Meta espera um 200 rápido, mesmo quando o evento é ignorado.
  res.sendStatus(200);
});

export default router;
