import type { Request, Response } from 'express';
import { analyticsQuery, getFunctionalAnalytics } from '../../../services/analytics/analyticsService.js';

export const getAnalytics = async (req: Request, res: Response) => {
  const parsed = analyticsQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Use days=7, 30 ou 90.' });
  try {
    const data = await getFunctionalAnalytics(Number(parsed.data.days));
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Falha ao consultar métricas:', error instanceof Error ? error.name : 'erro');
    return res.status(503).json({ success: false, message: 'Não foi possível consultar as métricas. Tente novamente.' });
  }
};
