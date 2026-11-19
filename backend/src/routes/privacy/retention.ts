import { Router } from 'express';
import { prisma } from '../../database/index.js';
import { createRetentionSettingsService } from '../../services/privacy/retentionSettings.js';

export function createRetentionRouter() {
  const router = Router();
  const service = createRetentionSettingsService(prisma);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/', async (_req, res) => { res.json(await service.get()); });
  router.put('/', async (req, res) => { res.json(await service.save(res.locals.panelUser.id, req.body)); });
  return router;
}
