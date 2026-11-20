import { Router } from 'express';
import { prisma } from '../database/index.js';
import { AuthError } from '../services/auth/authService.js';
import { checkGeneration } from '../services/ollama/ollamaClient.js';
import { generationMutation, readGeneration } from '../services/ollama/settings.js';

export function createAiSettingsRouter() {
  const router = Router();
  const conflict = () => new AuthError(409, 'As configurações de IA foram alteradas. Recarregue antes de salvar.');
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/', async (_req, res) => { res.json(await readGeneration(prisma)); });
  router.put('/', async (req, res) => {
    const input = generationMutation.safeParse(req.body);
    if (!input.success) throw new AuthError(400, 'Informe um nome de modelo válido e selecione o thinking mode.');
    const { version, value } = input.data;
    const current = await readGeneration(prisma);
    if (current.version !== version) throw conflict();
    if (version > 0 && current.model === value.model && current.thinkingEnabled === value.thinkingEnabled) {
      res.json(current);
      return;
    }
    // O teste do Ollama pode aquecer um modelo. Não mantém transação aberta.
    const failure = await checkGeneration(value);
    if (failure) throw new AuthError(422, failure);
    const settings = await prisma.$transaction(async tx => {
      const actor = await tx.panelUser.findUnique({ where: { id: res.locals.panelUser.id } });
      if (!actor?.active || actor.role !== 'ADMIN' || actor.mustChangePassword) throw new AuthError(403, 'Acesso restrito ao administrador.');
      const changed = version === 0
        ? await tx.aiSettings.createMany({ data: { ...value, id: 'main', version: 1 }, skipDuplicates: true })
        : await tx.aiSettings.updateMany({ where: { id: 'main', version }, data: { ...value, version: { increment: 1 } } });
      if (!changed.count) throw conflict();
      return tx.aiSettings.findUniqueOrThrow({ where: { id: 'main' } });
    });
    res.json(settings);
  });
  return router;
}
