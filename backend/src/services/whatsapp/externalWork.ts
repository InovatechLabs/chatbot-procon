import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { isInDatabaseTransaction } from '../../database/index.js';

type Outcome = { ok: true; value: unknown } | { ok: false; error: unknown };
export type ExternalWorkCache = Map<string, Outcome>;
const context = new AsyncLocalStorage<ExternalWorkCache>();

// Controle interno: o worker desfaz a preparação antes de executar a chamada.
// Nunca deve ser convertido em resposta de erro ao consumidor.
export class ExternalWorkRequired extends Error {
  constructor(readonly key: string, readonly execute: () => Promise<unknown>) {
    super('ExternalWorkRequired'); this.name = 'ExternalWorkRequired';
  }
  async resolve(cache: ExternalWorkCache) {
    try { cache.set(this.key, { ok: true, value: await this.execute() }); }
    catch (error) { cache.set(this.key, { ok: false, error }); }
  }
}

export const withExternalWorkCache = <T>(cache: ExternalWorkCache, work: () => Promise<T>) => context.run(cache, work);

/** A chave inclui todos os parâmetros reais; cache privado a uma única tentativa. */
export async function externalWork<T>(input: unknown, execute: () => Promise<T>): Promise<T> {
  if (!isInDatabaseTransaction()) return execute();
  const cache = context.getStore();
  if (!cache) throw new Error('ExternalWorkInsideTransaction');
  const key = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const previous = cache.get(key);
  if (previous) {
    if (!previous.ok) throw previous.error;
    return previous.value as T;
  }
  throw new ExternalWorkRequired(key, execute);
}
