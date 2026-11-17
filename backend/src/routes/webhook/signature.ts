import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export function verifyMetaSignature(body: Buffer, signature: string, secret: string): boolean {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const supplied = Buffer.from(signature.slice(7), 'hex');
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, supplied);
}

export const requireMetaSignature = (getSecret = () => process.env.META_APP_SECRET): RequestHandler => (req, res, next) => {
  const secret = getSecret();
  if (!secret?.trim()) {
    res.status(503).json({ error: 'Recebimento de eventos temporariamente indisponível.' }); return;
  }
  // Cabeçalhos repetidos não podem ser reinterpretados pelo proxy ou pelo Node.
  const count = req.rawHeaders.filter((header, index) => index % 2 === 0 && header.toLowerCase() === 'x-hub-signature-256').length;
  const signature = req.headers['x-hub-signature-256'];
  if (count !== 1 || typeof signature !== 'string' || !Buffer.isBuffer(req.body) || !verifyMetaSignature(req.body, signature, secret)) {
    res.status(403).json({ error: 'Assinatura do evento inválida.' }); return;
  }
  next();
};
