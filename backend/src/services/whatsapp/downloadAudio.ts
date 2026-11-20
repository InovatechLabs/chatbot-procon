import axios from 'axios';
import { AuthError } from '../auth/authService.js';

const MAX_BYTES = 16 * 1024 * 1024;
const audioTypes = new Set(['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr']);

export async function downloadWhatsAppAudio(mediaId: string, signal?: AbortSignal) {
  const token = process.env.META_WA_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new AuthError(503, 'A reprodução de áudio está indisponível.');
  const options = { headers: { Authorization: `Bearer ${token}` }, timeout: 15000, maxRedirects: 0, ...(signal ? { signal } : {}) };
  try {
    const { data } = await axios.get<{ url?: string; mime_type?: string; file_size?: number }>(`https://graph.facebook.com/v19.0/${encodeURIComponent(mediaId)}`, {
      ...options, params: { phone_number_id: phoneNumberId }, maxContentLength: 32768,
    });
    const url = new URL(data.url ?? '');
    if (url.origin !== 'https://lookaside.fbsbx.com' || url.username || url.password || !url.pathname.startsWith('/whatsapp_business/attachments')) {
      throw new AuthError(502, 'A Meta retornou um endereço de mídia não reconhecido.');
    }
    const mime = data.mime_type?.split(';')[0]?.trim().toLowerCase();
    if (!mime || !audioTypes.has(mime)) throw new AuthError(415, 'Formato de áudio indisponível para reprodução.');
    if (typeof data.file_size === 'number' && data.file_size > MAX_BYTES) throw new AuthError(413, 'Áudio acima do limite de reprodução.');
    const response = await axios.get<Buffer>(url.toString(), { ...options, responseType: 'arraybuffer', maxContentLength: MAX_BYTES });
    const body = Buffer.from(response.data);
    if (!body.length) throw new AuthError(404, 'Áudio indisponível na Meta.');
    return { body, mime };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (axios.isAxiosError(error) && [404, 410].includes(error.response?.status ?? 0)) throw new AuthError(404, 'Áudio indisponível na Meta.');
    throw new AuthError(502, 'Não foi possível carregar o áudio agora.');
  }
}
