import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/index.js';

class NodeError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const refId = z.string().trim().min(1).max(100);
const nodeCreateBody = z.object({
  titulo: z.string().trim().max(120).optional(),
  textoMensagem: z.string().trim().max(4000).optional(),
  isStart: z.boolean().optional(),
});
const nodeUpdateBody = z.object({
  titulo: z.string().trim().min(1).max(120).optional(),
  textoMensagem: z.string().trim().min(1).max(4000).optional(),
  isStart: z.boolean().optional(),
});
const optionCreateBody = z.object({
  stepId: refId,
  nextStepId: z.string().trim().max(100).nullish(),
  text: z.string().trim().max(200).optional(),
  texto: z.string().trim().max(200).optional(),
});
const optionUpdateBody = z.object({
  text: z.string().trim().max(200).optional(),
  texto: z.string().trim().max(200).optional(),
  nextStepId: z.string().trim().max(100).nullish(),
  proximoNoId: z.string().trim().max(100).nullish(),
});

const invalid = (res: Response) => res.status(400).json({ success: false, message: 'Dados inválidos.' });

function fail(res: Response, error: unknown, action: string) {
  if (error instanceof NodeError) return res.status(error.status).json({ success: false, message: error.message });
  const code = (error as { code?: string } | null)?.code;
  if (code === 'P2025') return res.status(404).json({ success: false, message: 'Registro não encontrado.' });
  if (code === 'P2003') return res.status(400).json({ success: false, message: 'Referência inválida: o nó informado não existe.' });
  console.error(`Erro ao ${action}:`, error instanceof Error ? error.name : 'erro');
  return res.status(500).json({ success: false, message: `Falha ao ${action}` });
}

export const getNodes = async (_req: Request, res: Response) => {
  try {
    const steps = await prisma.step.findMany({ include: { options: true } });
    const nosFormatados = steps.map((no) => ({
      id: no.id,
      titulo: no.title,
      textoMensagem: no.message,
      tipo: 'pergunta',
      noPaiId: null,
      alternativas: no.options.map((opt) => ({ id: opt.id, texto: opt.text, proximoNoId: opt.nextStepId })),
    }));
    return res.status(200).json({ success: true, data: nosFormatados });
  } catch (error) { return fail(res, error, 'buscar os nós do fluxo'); }
};

export const createNode = async (req: Request, res: Response) => {
  const body = nodeCreateBody.safeParse(req.body ?? {});
  if (!body.success) return invalid(res);
  try {
    const newStep = await prisma.step.create({
      data: {
        title: body.data.titulo || 'Novo Nó',
        message: body.data.textoMensagem || 'Texto da mensagem',
        isStart: body.data.isStart ?? false,
      },
    });
    return res.status(201).json({ success: true, data: newStep });
  } catch (error) { return fail(res, error, 'criar o nó'); }
};

export const updateNode = async (req: Request, res: Response) => {
  const body = nodeUpdateBody.safeParse(req.body ?? {});
  if (!body.success) return invalid(res);
  const data: { title?: string; message?: string; isStart?: boolean } = {};
  if (body.data.titulo !== undefined) data.title = body.data.titulo;
  if (body.data.textoMensagem !== undefined) data.message = body.data.textoMensagem;
  if (body.data.isStart !== undefined) data.isStart = body.data.isStart;
  try {
    const updatedStep = await prisma.step.update({ where: { id: String(req.params.id) }, data });
    return res.status(200).json({ success: true, data: updatedStep });
  } catch (error) { return fail(res, error, 'atualizar o nó'); }
};

// Remoção atômica: ou apaga o nó e suas alternativas, ou não altera nada.
// Recusa o nó inicial e nós que ainda são destino de outras alternativas (use ?force=true para desvincular).
export const deleteNode = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const force = req.query.force === 'true';
    await prisma.$transaction(async (tx) => {
      const step = await tx.step.findUnique({ where: { id }, select: { isStart: true } });
      if (!step) throw new NodeError(404, 'Nó não encontrado.');
      if (step.isStart) throw new NodeError(409, 'O nó inicial não pode ser removido. Defina outro nó como inicial antes.');
      const inbound = await tx.option.count({ where: { nextStepId: id, stepId: { not: id } } });
      if (inbound > 0 && !force) {
        throw new NodeError(409, `${inbound} alternativa(s) de outros nós apontam para este nó. Altere o destino delas ou repita a remoção com ?force=true.`);
      }
      await tx.option.updateMany({ where: { nextStepId: id }, data: { nextStepId: null } });
      await tx.option.deleteMany({ where: { stepId: id } });
      await tx.step.delete({ where: { id } });
    });
    return res.status(200).json({ success: true, message: 'Nó removido com sucesso' });
  } catch (error) { return fail(res, error, 'remover o nó'); }
};

export const createOption = async (req: Request, res: Response) => {
  const body = optionCreateBody.safeParse(req.body ?? {});
  if (!body.success) return invalid(res);
  try {
    const newOption = await prisma.option.create({
      data: {
        stepId: body.data.stepId,
        nextStepId: body.data.nextStepId || null,
        text: body.data.text || body.data.texto || 'Nova Opção',
      },
    });
    return res.status(201).json({ success: true, data: newOption });
  } catch (error) { return fail(res, error, 'criar alternativa'); }
};

export const updateOption = async (req: Request, res: Response) => {
  const body = optionUpdateBody.safeParse(req.body ?? {});
  if (!body.success) return invalid(res);
  const data: { text?: string; nextStepId?: string | null } = {};
  const newText = body.data.text || body.data.texto;
  if (newText) data.text = newText;
  if (body.data.nextStepId !== undefined || body.data.proximoNoId !== undefined) {
    data.nextStepId = body.data.nextStepId || body.data.proximoNoId || null;
  }
  try {
    const updatedOption = await prisma.option.update({ where: { id: String(req.params.id) }, data });
    return res.status(200).json({ success: true, data: updatedOption });
  } catch (error) { return fail(res, error, 'atualizar alternativa'); }
};

export const deleteOption = async (req: Request, res: Response) => {
  try {
    await prisma.option.delete({ where: { id: String(req.params.id) } });
    return res.status(200).json({ success: true, message: 'Alternativa removida com sucesso' });
  } catch (error) { return fail(res, error, 'deletar alternativa'); }
};