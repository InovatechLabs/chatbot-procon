import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export const getNodes = async (req: Request, res: Response) => {
  try {
    const steps = await prisma.step.findMany({
      include: { options: true },
    });
    
    const nosFormatados = steps.map((no) => ({
      id: no.id,
      titulo: no.title,
      textoMensagem: no.message,
      tipo: 'pergunta',
      noPaiId: null,
      alternativas: no.options.map((opt) => ({
        id: opt.id,
        texto: opt.text,
        proximoNoId: opt.nextStepId,
      })),
    }));

    return res.status(200).json({ success: true, data: nosFormatados });
  } catch (error) {
    console.error('Erro ao buscar nós:', error);
    return res.status(500).json({ success: false, message: 'Falha ao buscar os nós do fluxo' });
  }
};

export const createNode = async (req: Request, res: Response) => {
  try {
    const { titulo, textoMensagem, isStart } = req.body;
    const newStep = await prisma.step.create({
      data: {
        title: titulo || 'Novo Nó',
        message: textoMensagem || 'Texto da mensagem',
        isStart: isStart ?? false,
      },
    });
    return res.status(201).json({ success: true, data: newStep });
  } catch (error) {
    console.error('Erro ao criar nó:', error);
    return res.status(500).json({ success: false, message: 'Falha ao criar o nó' });
  }
};

export const updateNode = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { titulo, textoMensagem, isStart } = req.body;
    const updatedStep = await prisma.step.update({
      where: { id },
      data: {
        title: titulo,
        message: textoMensagem,
        isStart,
      },
    });
    return res.status(200).json({ success: true, data: updatedStep });
  } catch (error) {
    console.error('Erro ao atualizar nó:', error);
    return res.status(500).json({ success: false, message: 'Falha ao atualizar o nó' });
  }
};

export const deleteNode = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.option.deleteMany({
      where: { stepId: id },
    });
    await prisma.step.delete({
      where: { id },
    });
    return res.status(200).json({ success: true, message: 'Nó removido com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar nó:', error);
    return res.status(500).json({ success: false, message: 'Falha ao remover o nó' });
  }
};

export const createOption = async (req: Request, res: Response) => {
  try {
    const { stepId, nextStepId, text, texto } = req.body;
    const newOption = await prisma.option.create({
      data: {
        stepId: String(stepId),
        nextStepId: nextStepId ? String(nextStepId) : null,
        text: String(text || texto || 'Nova Opção'),
      },
    });
    return res.status(201).json({ success: true, data: newOption });
  } catch (error) {
    console.error('Erro ao criar alternativa:', error);
    return res.status(500).json({ success: false, message: 'Falha ao criar alternativa' });
  }
};

export const updateOption = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { text, texto, nextStepId, proximoNoId } = req.body;
    
    const dataToUpdate: any = {};
    if (text || texto) dataToUpdate.text = String(text || texto);
    if (nextStepId !== undefined || proximoNoId !== undefined) {
      dataToUpdate.nextStepId = (nextStepId || proximoNoId) ? String(nextStepId || proximoNoId) : null;
    }

    const updatedOption = await prisma.option.update({
      where: { id },
      data: dataToUpdate,
    });
    return res.status(200).json({ success: true, data: updatedOption });
  } catch (error) {
    console.error('Erro ao atualizar alternativa:', error);
    return res.status(500).json({ success: false, message: 'Falha ao atualizar alternativa' });
  }
};

export const deleteOption = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.option.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Alternativa removida com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar alternativa:', error);
    return res.status(500).json({ success: false, message: 'Falha ao deletar alternativa' });
  }
};