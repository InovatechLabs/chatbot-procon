import { Router } from 'express';
import { prisma } from '../database/index.js';
import { AuthError } from '../services/auth/authService.js';
import { handoffMutation, isHandoffOpen, readHandoffSettings } from '../services/conversation/handoffSettings.js';
import { isInstitutionTemplate, readInstitution } from '../services/institution/settings.js';

export function createHandoffSettingsRouter() {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const response = (settings: Awaited<ReturnType<typeof readHandoffSettings>>) =>
    ({ ...settings, openNow: isHandoffOpen(settings), pilotRestricted: Boolean(process.env.HUMAN_HANDOFF_TEST_PHONE) });
  router.get('/', async (_req, res) => {
    const institution = await readInstitution(prisma);
    res.json(response(await readHandoffSettings(prisma, institution.queueMessage)));
  });
  router.put('/', async (req, res) => {
    const input = handoffMutation.safeParse(req.body);
    if (!input.success) throw new AuthError(400, 'Confira os dias e intervalos de expediente e preencha os dois textos. Os horários do mesmo dia não podem se sobrepor.');
    const { value, version } = input.data;
    const settings = await prisma.$transaction(async tx => {
      const actor = await tx.panelUser.findUnique({ where: { id: res.locals.panelUser.id } });
      if (!actor?.active || actor.role !== 'ADMIN' || actor.mustChangePassword) throw new AuthError(403, 'Acesso restrito ao administrador.');
      const institution = await readInstitution(tx);
      if (![value.queueMessage, value.closedMessage].every(text => isInstitutionTemplate(text, institution))) {
        throw new AuthError(400, 'Use apenas as variáveis indicadas. Cada mensagem renderizada pode ter até 700 caracteres.');
      }
      const data = { ...value, periods: value.periods ?? [] };
      const written = version === 0
        ? await tx.handoffSettings.createMany({ data: { ...data, id: 'main', version: 1 }, skipDuplicates: true })
        : await tx.handoffSettings.updateMany({ where: { id: 'main', version }, data: { ...data, version: { increment: 1 } } });
      if (!written.count) throw new AuthError(409, 'As regras foram alteradas. Recarregue as configurações antes de salvar.');
      return readHandoffSettings(tx);
    });
    res.json(response(settings));
  });
  return router;
}
