import type { Request, Response } from 'express';
import { prisma } from '../../database/index.js';
import dotenv from 'dotenv';

dotenv.config();

export const FlowController = {
  // Adiciona uma nova etapa/menu
  async create(req: Request, res: Response) {
    try {
      const data = req.body;
      const newStep = await prisma.step.create({
        data,
      });
      return res.status(201).json(newStep);
    } catch (error) {
      console.error("Erro ao criar etapa:", error);
      return res.status(500).json({ error: "Erro interno ao criar etapa." });
    }
  },

  // Lista todas as etapas do fluxo
  async list(req: Request, res: Response) {
    try {
      const steps = await prisma.step.findMany({
        include: { options: true }
      });
      return res.status(200).json(steps);
    } catch (error) {
      console.error("Erro ao listar etapas:", error);
      return res.status(500).json({ error: "Erro interno ao listar etapas." });
    }
  },

  // Busca apenas uma etapa específica pelo ID
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const step = await prisma.step.findUnique({
        where: { id: String(id) }, 
      });
      
      if (!step) {
        return res.status(404).json({ error: "Etapa não encontrada." });
      }
      return res.status(200).json(step);
    } catch (error) {
      console.error("Erro ao buscar etapa:", error);
      return res.status(500).json({ error: "Erro interno ao buscar etapa." });
    }
  },

  // Atualiza uma etapa existente 
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = req.body;
      
      const updatedStep = await prisma.step.update({
        where: { id: String(id) },
        data,
      });
      return res.status(200).json(updatedStep);
    } catch (error) {
      console.error("Erro ao atualizar etapa:", error);
      return res.status(500).json({ error: "Erro interno ao atualizar etapa." });
    }
  },

  // DELETE: Exclui uma etapa do fluxo
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.step.delete({
        where: { id: String(id) },
      });
      return res.status(204).send();
    } catch (error) {
      console.error("Erro ao excluir etapa:", error);
      return res.status(500).json({ error: "Erro ao excluir etapa. Verifique se existem dependências." });
    }
  }
};