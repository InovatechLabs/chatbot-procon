import { Router } from 'express';
import { z } from 'zod';
import { AuthError } from '../../services/auth/authService.js';
import { blockSchema, capacitySchema, civilDateSchema, settingsSchema } from '../../services/appointments/scheduleSchemas.js';
import { getScheduleAdmin, mutateSchedule, previewSchedule } from '../../services/appointments/scheduleAdminService.js';
const version = z.number().int().min(1);
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AuthError(400, result.error.issues.map(issue => issue.message).join(' '));
  return result.data;
}
export function createScheduleAdminRouter() {
  const router = Router();
  router.param('id', (_req, _res, next, id) => { parse(z.uuid(), id); next(); });
  router.get('/', async (_req, res) => { res.json(await getScheduleAdmin()); });
  router.get('/preview', async (req, res) => { res.json({ slots: await previewSchedule(parse(civilDateSchema, req.query.date)) }); });
  router.put('/settings', async (req, res) => {
    const body = parse(z.object({ version, value: settingsSchema }).strict(), req.body);
    res.json(await mutateSchedule(res.locals.panelUser.id, body.version, { kind: 'settings', value: body.value }));
  });
  for (const [path, kind] of [['capacities', 'capacity'], ['blocks', 'block']] as const) {
    for (const method of ['post', 'put'] as const) router[method](method === 'post' ? `/${path}` : `/${path}/:id`, async (req, res) => {
      // Cada schema permanece validado antes de construir a mutação discriminada.
      const input = parse(z.object({ version, value: z.unknown() }).strict(), req.body);
      const rawId = 'id' in req.params ? req.params.id : undefined;
      const id = typeof rawId === 'string' ? rawId : undefined;
      if (kind === 'capacity') res.json(await mutateSchedule(res.locals.panelUser.id, input.version, { kind, id, value: parse(capacitySchema, req.body.value) }));
      else res.json(await mutateSchedule(res.locals.panelUser.id, input.version, { kind, id, value: parse(blockSchema, req.body.value) }));
    });
    router.delete(`/${path}/:id`, async (req, res) => {
      const body = parse(z.object({ version }).strict(), req.body);
      res.json(await mutateSchedule(res.locals.panelUser.id, body.version, { kind: kind === 'capacity' ? 'deleteCapacity' : 'deleteBlock', id: req.params.id as string }));
    });
  }
  return router;
}
