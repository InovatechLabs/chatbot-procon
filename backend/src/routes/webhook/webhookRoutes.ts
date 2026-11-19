import express, { Router } from 'express';
import type { RequestHandler } from 'express';
import { verifyWebhook, handleWebhookEvent } from '../../controllers/webhook/webhookController.js';
import { requireMetaSignature } from './signature.js';

export function createWebhookRouter(handler: RequestHandler = handleWebhookEvent, getSecret = () => process.env.META_APP_SECRET) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/', verifyWebhook);
  router.post('/',
    express.raw({ type: () => true, limit: '100kb', inflate: false }),
    requireMetaSignature(getSecret),
    (req, res, next) => {
      if (!req.is('application/json')) { res.status(415).json({ error: 'Envie application/json.' }); return; }
      try {
        req.body = JSON.parse((req.body as Buffer).toString('utf8'));
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new Error();
      } catch { res.status(400).json({ error: 'JSON inválido.' }); return; }
      next();
    },
    handler,
  );
  return router;
}
