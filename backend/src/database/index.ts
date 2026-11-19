import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { protectedPrisma } from '../services/privacy/protectedPrisma.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const rootPrisma = protectedPrisma(new PrismaClient({ adapter }));
const transaction = new AsyncLocalStorage<Prisma.TransactionClient>();

// Toda a unidade de conversa compartilha estado, reserva, feedback e outbox.
// Chamadas transacionais internas participam da transação externa, sem commit parcial.
export const prisma = new Proxy(rootPrisma, {
  get(base, key) {
    const active = transaction.getStore();
    if (active && key === '$transaction') return async (work: unknown) => {
      if (typeof work !== 'function') throw new Error('Transação aninhada exige callback.');
      return work(prisma);
    };
    const client = active ?? base;
    const value = Reflect.get(client, key);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
export const isInDatabaseTransaction = () => transaction.getStore() !== undefined;

export function inDatabaseTransaction<T>(work: () => Promise<T>, timeout = 15_000): Promise<T> {
  if (transaction.getStore()) throw new Error('Unidade de trabalho já iniciada.');
  return rootPrisma.$transaction(tx => transaction.run(tx, work), { isolationLevel: 'ReadCommitted', timeout, maxWait: 10_000 });
}
