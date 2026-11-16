import axios from 'axios';
import type { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import { charLength, clip, splitMessage } from './whatsapp/messagePolicy.js';

dotenv.config();

let metaApiInstance: AxiosInstance | null = null;

const getMetaApi = (): AxiosInstance => {
  if (!metaApiInstance) {
    const META_WA_TOKEN = process.env.META_WA_TOKEN;
    const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

    if (!META_WA_TOKEN || !META_PHONE_NUMBER_ID) {
      throw new Error("Variáveis META_WA_TOKEN e META_PHONE_NUMBER_ID são obrigatórias.");
    }

    metaApiInstance = axios.create({
      baseURL: `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}`,
      headers: {
        Authorization: `Bearer ${META_WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
  }
  return metaApiInstance;
};

export const sendTextMessage = async (to: string, text: string) => {
  if (charLength(text) > 4096) {
    for (const part of splitMessage(text, 4096)) await sendTextMessage(to, part);
    return;
  }
  try {
    const api = getMetaApi();
    const response = await api.post('/messages', {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text },
    });
    return response.data;
  } catch (error: any) {
    console.error("Erro ao enviar mensagem de texto via Meta API:", error.response?.data || error.message);
    throw error;
  }
};

export const sendInteractiveMessage = async (to: string, text: string, options: any[]) => {
  if (!options.length) return sendTextMessage(to, text);
  // Preserva o conteúdo completo; os controles acompanham apenas o último bloco.
  const parts = splitMessage(text);
  for (const part of parts.slice(0, -1)) await sendTextMessage(to, part);
  text = parts.at(-1) ?? 'Escolha uma opção:';
  if (options.length > 10) {
    // Nós editados no painel também precisam continuar acessíveis.
    for (let offset = 0; offset < options.length; offset += 10) {
      await sendInteractiveMessage(to, offset === 0 ? text : 'Mais opções:', options.slice(offset, offset + 10));
    }
    return;
  }
  try {
    let interactiveConfig: any = {};

    if (options.length <= 3) {
      interactiveConfig = {
        type: 'button',
        body: { text },
        action: {
          buttons: options.map((opt) => ({
            type: 'reply',
            reply: {
              id: opt.id,
              title: clip(opt.text, 20),
            },
          })),
        },
      };
    } else {
      interactiveConfig = {
        type: 'list',
        body: { text },
        action: {
          button: 'Ver opções',
          sections: [
            {
              title: 'Selecione uma opção',
              rows: options.map((opt) => ({
                id: opt.id,
                title: clip(opt.text, 24),
              })),
            },
          ],
        },
      };
    }

    const api = getMetaApi();
    const response = await api.post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: interactiveConfig,
    });
    return response.data;
  } catch (error: any) {
    console.error(`❌ Erro ao enviar interação para ${to}:`, error.response?.data || error.message);
    throw error;
  }
};

/**
 * Envia uma mensagem interativa de Lista com seções, títulos e descrições.
 */
export const sendListMessage = async (
  to: string,
  title: string,
  bodyText: string,
  buttonText: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>
) => {
  const rowCount = sections.reduce((total, section) => total + section.rows.length, 0);
  if (rowCount < 1 || rowCount > 10) throw new Error('Listas do WhatsApp devem conter de 1 a 10 opções.');
  const parts = splitMessage(bodyText);
  for (const part of parts.slice(0, -1)) await sendTextMessage(to, part);
  bodyText = parts.at(-1) ?? 'Escolha uma opção:';
  try {
    const api = getMetaApi();
    const response = await api.post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: clip(title, 60) },
        body: { text: bodyText },
        footer: { text: 'PROCON Municipal' },
        action: {
          button: clip(buttonText, 20),
          sections: sections.map((sec) => ({
            title: clip(sec.title, 24),
            rows: sec.rows.map((row) => ({
              id: row.id,
              title: clip(row.title, 24),
              description: row.description ? clip(row.description, 72) : undefined,
            })),
          })),
        },
      },
    });
    return response.data;
  } catch (error: any) {
    console.error(`❌ Erro ao enviar lista interativa para ${to}:`, error.response?.data || error.message);
    throw error;
  }
};
