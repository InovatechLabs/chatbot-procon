import axios from 'axios';

const GRAPH_API_VERSION = 'v23.0';

/**
 * Envia uma mensagem de texto para um número via WhatsApp Cloud API (Meta).
 * Requer PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN configurados no .env.
 */
export async function sendWhatsAppMessage(to: string, message: string): Promise<void> {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN não configurados no .env');
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );

    console.log('Mensagem enviada com sucesso:', response.status, response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Erro ao enviar mensagem via WhatsApp:', error.response?.data ?? error.message);
    } else {
      console.error('Erro inesperado ao enviar mensagem via WhatsApp:', error);
    }
    throw error;
  }
}
