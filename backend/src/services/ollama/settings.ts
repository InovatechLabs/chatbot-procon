import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const generationSchema = z.object({
  model: z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/),
  thinkingEnabled: z.boolean(),
}).strict();

export type GenerationSettings = z.infer<typeof generationSchema>;

export const generationMutation = z.object({
  version: z.number().int().min(0).max(2_147_483_646),
  value: generationSchema,
}).strict();

export const defaultGeneration = (): GenerationSettings => ({
  model: process.env.OLLAMA_GENERATE_MODEL_NAME?.trim() ?? '',
  thinkingEnabled: process.env.LLM_ENABLE_THINKING === 'true',
});

export async function readGeneration(db: Pick<PrismaClient, 'aiSettings'>) {
  return await db.aiSettings?.findUnique({ where: { id: 'main' } })
    ?? { ...defaultGeneration(), version: 0, updatedAt: null };
}
