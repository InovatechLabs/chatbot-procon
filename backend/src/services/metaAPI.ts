import axios from 'axios';
import type { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Variável para guardar a instância na memória depois da primeira vez
let metaApiInstance: AxiosInstance | null = null;

// Função que monta o Axios apenas quando for realmente necessário
const getMetaApi = (): AxiosInstance => {
  if (!metaApiInstance) {
    const META_WA_TOKEN = process.env.META_WA_TOKEN;
    const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

    if (!META_WA_TOKEN || !META_PHONE_NUMBER_ID) {
      throw new Error("As variáveis de ambiente META_WA_TOKEN e META_PHONE_NUMBER_ID devem estar definidas.");
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
  try {
    const api = getMetaApi(); // <-- Chama a função aqui dentro!
    const response = await api.post('/messages', {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: text },
    });
    return response.data;
  } catch (error: any) {
    console.error("Erro ao enviar mensagem via Meta API:", error.response?.data || error.message);
    throw error;
  }
};

export const sendInteractiveMessage = async (to: string, text: string, options: any[]) => {
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
              title: opt.text.substring(0, 20),
            },
          })),
        },
      };
    } 
    else {
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
                title: opt.text.substring(0, 24),
              })),
            },
          ],
        },
      };
    }

    const api = getMetaApi(); // <-- Chama a função aqui dentro também!
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