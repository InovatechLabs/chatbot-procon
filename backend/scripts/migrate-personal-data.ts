import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pathToFileURL } from 'node:url';
import { protectedFields } from '../src/services/privacy/protectedPrisma.js';
import { privacyKeys, encrypt, decrypt, encrypted, lookupHash } from '../src/services/privacy/crypto.js';

export async function migratePersonalData(db: PrismaClient, apply = false) {
  privacyKeys();
  const counts: Record<string, number> = {};
  for (const [model, fields] of Object.entries(protectedFields)) {
    const delegate = model.charAt(0).toLowerCase() + model.slice(1);
    let cursor: string | undefined;
    counts[model] = 0;
    for (;;) {
      const rows = await (db as any)[delegate].findMany({ orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!rows.length) break;
      const updates = [];
      for (const row of rows) {
        const data: Record<string, string | null> = {};
        for (const field of fields) {
          const stored = row[field];
          if (stored === null || stored === undefined) continue;
          const plain = encrypted(stored) ? decrypt(stored, `${model}.${field}`) : stored;
          if (!encrypted(stored)) data[field] = encrypt(plain, `${model}.${field}`);
          if (field === 'phoneNumber' || field === 'userCpf') {
            const target = field === 'phoneNumber' ? 'phoneLookup' : 'cpfLookup';
            const hash = lookupHash(field, plain);
            if (row[target] && row[target] !== hash) throw new Error('Chave de busca divergente: migração interrompida. Não substitua chaves existentes.');
            if (row[target] !== hash) data[target] = hash;
          }
        }
        if (Object.keys(data).length) {
          counts[model]!++;
          if (apply) updates.push((db as any)[delegate].update({ where: { id: row.id }, data: { ...data, ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}) } }));
        }
      }
      if (updates.length) await db.$transaction(updates);
      cursor = rows.at(-1).id;
    }
  }
  return counts;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try { console.log(process.argv.includes('--apply') ? 'Migração aplicada:' : 'Simulação (sem alterações):', await migratePersonalData(db, process.argv.includes('--apply'))); }
  catch { console.error('Migração não concluída. Verifique chaves e schema; nenhum dado pessoal será exibido.'); process.exitCode = 1; }
  finally { await db.$disconnect(); }
}
