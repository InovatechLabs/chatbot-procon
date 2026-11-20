import { Router } from 'express';
import { prisma } from '../database/index.js';
import { AuthError } from '../services/auth/authService.js';
import { institutionMutation, readInstitution } from '../services/institution/settings.js';

export function createInstitutionRouter() {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/', async (_req, res) => { res.json(await readInstitution(prisma)); });
  router.put('/', async (req, res) => {
    const input = institutionMutation.safeParse(req.body);
    if (!input.success) throw new AuthError(400, 'Revise os dados de contato e os campos das mensagens.');
    const { version, value } = input.data;
    const settings = await prisma.$transaction(async tx => {
      const actor = await tx.panelUser.findUnique({ where: { id: res.locals.panelUser.id } });
      if (!actor?.active || actor.role !== 'ADMIN' || actor.mustChangePassword) throw new AuthError(403, 'Acesso restrito ao administrador.');
      const changed = version === 0
        ? await tx.institutionSettings.createMany({ data: { ...value, id: 'main', version: 1 }, skipDuplicates: true })
        : await tx.institutionSettings.updateMany({ where: { id: 'main', version }, data: { ...value, version: { increment: 1 } } });
      if (!changed.count) throw new AuthError(409, 'As configurações foram alteradas. Recarregue antes de salvar.');
      return tx.institutionSettings.findUniqueOrThrow({ where: { id: 'main' } });
    });
    res.json(settings);
  });
  return router;
}
