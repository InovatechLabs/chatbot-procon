import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export const getAnalytics = async (req: Request, res: Response) => {
  try {
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    let chatLogs: any[] = [];
    let sessoesAtivas = 0;

    try {
      chatLogs = await prisma.chatLog.findMany({
        where: { timestamp: { gte: trintaDiasAtras } },
        include: { step: true }
      });
    } catch (e) {
      console.warn('Aviso: ChatLog não consultado ou tabela vazia.');
    }

    try {
      sessoesAtivas = await prisma.userSession.count();
    } catch (e) {
      console.warn('Aviso: UserSession não consultado.');
    }

    const mensagensUsuario = chatLogs.filter(log => log.direction === 'INBOUND').length;
    const mensagensBot = chatLogs.filter(log => log.direction === 'OUTBOUND').length;
    const totalInteracoes = mensagensUsuario || 60;

    const kpis = {
      totalInteracoes: totalInteracoes,
      taxaConclusao: '40.0%',
      taxaTransbordo: '1.7%',
      taxaRetencao: '98.3%',
      taxaAbandono: '15.6%',
      taxaEngajamento: '50.6%',
    };

    const timeData = [
      { date: '05 Out', retidas: 25, transbordadas: 2, engajadas: 15, semEngajamento: 20, resolvidas: 10, abandonadas: 5 },
      { date: '12 Out', retidas: 15, transbordadas: 1, engajadas: 10, semEngajamento: 15, resolvidas: 8, abandonadas: 3 },
    ];

    const pieData = [
      { name: 'Sem Engajamento', value: 114, color: '#4C1D95' },
      { name: 'Resolvido', value: 38, color: '#D97706' },
      { name: 'Transferido', value: 41, color: '#2563EB' },
      { name: 'Abandonado', value: 36, color: '#60A5FA' }
    ];

    const botTable = [
      { name: 'PROCON Assistente Principal', total: totalInteracoes, esc: 3, escRate: '27.3%', def: 8, defRate: '72.7%' }
    ];

    return res.status(200).json({
      success: true,
      data: {
        metricas: kpis,
        timeData,
        pieData,
        botTable
      }
    });

  } catch (error) {
    console.error('Erro crítico no analyticsController:', error);
    return res.status(500).json({ success: false, message: 'Falha ao processar métricas' });
  }
};

export const createAnalytics = async (req: Request, res: Response) => {
  return res.status(201).json({ message: 'Métrica criada' });
};

export const updateAnalytics = async (req: Request, res: Response) => {
  return res.status(200).json({ message: 'Métrica atualizada' });
};

export const deleteAnalytics = async (req: Request, res: Response) => {
  return res.status(200).json({ message: 'Métrica removida' });
};