import { Router } from 'express';
import { z } from 'zod';
import type { PanelUserService } from '../../services/auth/panelUserService.js';

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/);
const role = z.enum(['ADMIN', 'ATTENDANT']);
const password = z.string().min(12).max(128);
const create = z.object({ username, role, password }).strict();
const update = z.object({ username: username.optional(), role: role.optional(), active: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0);
export function createPanelUsersRouter(service: PanelUserService) {
  const router = Router();
  router.param('id', (req, res, next, id) => {
    if (!z.uuid().safeParse(id).success) { res.status(400).json({ error: 'Identificador de conta inválido.' }); return; }
    next();
  });
  router.get('/', async (_req, res) => { res.json({ users: await service.list(res.locals.panelUser.id) }); });
  router.post('/', async (req, res) => {
    const body = create.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'Informe usuário de 3–64 caracteres (letras sem acento, números, ponto, hífen ou sublinhado), perfil válido e senha de 12–128 caracteres.' }); return; }
    res.status(201).json({ user: await service.create(res.locals.panelUser.id, body.data) });
  });
  router.patch('/:id', async (req, res) => {
    const body = update.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'Informe usuário, perfil ou situação válidos.' }); return; }
    res.json({ user: await service.update(res.locals.panelUser.id, req.params.id as string, body.data) });
  });
  router.post('/:id/password', async (req, res) => {
    const body = z.object({ password }).strict().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'A senha temporária deve ter entre 12 e 128 caracteres.' }); return; }
    await service.resetPassword(res.locals.panelUser.id, req.params.id as string, body.data.password);
    res.sendStatus(204);
  });
  router.post('/:id/revoke-sessions', async (req, res) => {
    await service.revokeSessions(res.locals.panelUser.id, req.params.id as string);
    res.sendStatus(204);
  });
  router.delete('/:id', async (req, res) => {
    await service.remove(res.locals.panelUser.id, req.params.id as string);
    res.sendStatus(204);
  });
  return router;
}
