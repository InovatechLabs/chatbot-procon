import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/index.js';

const title = z.string().trim().min(1).max(120);
const message = z.string().trim().min(1).max(4000);
const createBody = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  title, message,
  isStart: z.boolean().optional(),
});
const updateBody = z.object({ title: title.optional(), message: message.optional(), isStart: z.boolean().optional() });

function fail(res: Response, error: unknown, action: string) {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'P2025') return res.status(404).json({ error: 'Etapa não encontrada.' });
  if (code === 'P2003') return res.status(409).json({ error: 'Remova antes as alternativas ou vínculos desta etapa.' });
  console.error(`Erro ao ${action}:`, error instanceof Error ? error.name : 'erro');
  return res.status(500).json({ error: `Erro interno ao ${action}.` });
}

export const FlowController = {
  async create(req: Request, res: Response) {
    const body = createBody.safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ error: 'Dados da etapa inválidos.' });
    const { id, isStart } = body.data;
    try {
      const newStep = await prisma.step.create({
        data: {
          title: body.data.title,
          message: body.data.message,
          ...(id !== undefined && { id }),
          ...(isStart !== undefined && { isStart }),
        },
      });
      return res.status(201).json(newStep);
    } catch (error) { return fail(res, error, 'criar etapa'); }
  },

  async list(_req: Request, res: Response) {
    try {
      return res.status(200).json(await prisma.step.findMany({ include: { options: true } }));
    } catch (error) { return fail(res, error, 'listar etapas'); }
  },

  async getById(req: Request, res: Response) {
    try {
      const step = await prisma.step.findUnique({ where: { id: String(req.params.id) } });
      if (!step) return res.status(404).json({ error: 'Etapa não encontrada.' });
      return res.status(200).json(step);
    } catch (error) { return fail(res, error, 'buscar etapa'); }
  },

  async update(req: Request, res: Response) {
    const body = updateBody.safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ error: 'Dados da etapa inválidos.' });
    const data: { title?: string; message?: string; isStart?: boolean } = {};
    if (body.data.title !== undefined) data.title = body.data.title;
    if (body.data.message !== undefined) data.message = body.data.message;
    if (body.data.isStart !== undefined) data.isStart = body.data.isStart;
    try {
      return res.status(200).json(await prisma.step.update({ where: { id: String(req.params.id) }, data }));
    } catch (error) { return fail(res, error, 'atualizar etapa'); }
  },

  async delete(req: Request, res: Response) {
    try {
      await prisma.step.delete({ where: { id: String(req.params.id) } });
      return res.status(204).send();
    } catch (error) { return fail(res, error, 'excluir etapa'); }
  },
};