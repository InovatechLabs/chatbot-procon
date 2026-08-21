import type { Request, Response } from 'express';
import { prisma } from '../../database/index.js';
import { sendTextMessage, sendInteractiveMessage } from '../../services/metaAPI.js';
import dotenv from 'dotenv';

dotenv.config();

export const verifyWebhook = async (req: Request, res: Response): Promise<any> => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const MY_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

  if (mode && token) {
    if (mode === 'subscribe' && token === MY_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }
  return res.sendStatus(400);
};

export const handleWebhookEvent = async (req: Request, res: Response): Promise<any> => {
  const { body } = req;

  if (body.object === 'whatsapp_business_account') {
    try {
      for (const entry of body.entry) {
        const changes = entry.changes[0].value;
        
        if (changes.messages && changes.messages.length > 0) {
          const message = changes.messages[0];
          const phoneNumber = message.from;
          let responseStep = null;

          if (message.type === 'text') {
            console.log(`💬 Texto de ${phoneNumber}: ${message.text.body}`);
            responseStep = await prisma.step.findFirst({
              where: { isStart: true },
              include: { options: true },
            });
          } 
          else if (message.type === 'interactive') {
            let selectedOptionId = null;

            if (message.interactive.type === 'button_reply') {
              selectedOptionId = message.interactive.button_reply.id;
            } else if (message.interactive.type === 'list_reply') {
              selectedOptionId = message.interactive.list_reply.id;
            }

            if (selectedOptionId) {
              console.log(`👆 Clique no ID: ${selectedOptionId}`);
              const optionClicked = await prisma.option.findUnique({
                where: { id: selectedOptionId },
              });

              if (optionClicked && optionClicked.nextStepId) {
                responseStep = await prisma.step.findUnique({
                  where: { id: optionClicked.nextStepId },
                  include: { options: true },
                });
              }
            }
          }

          if (responseStep) {
            if (responseStep.options.length > 0) {
              await sendInteractiveMessage(phoneNumber, responseStep.message, responseStep.options);
            } else {
              await sendTextMessage(phoneNumber, responseStep.message);
            }
          }
        }
      }
    } catch (error) {
      console.error("Erro interno no WebhookController:", error);
    }
    return res.status(200).send('EVENT_RECEIVED');
  }

  return res.sendStatus(404);
};