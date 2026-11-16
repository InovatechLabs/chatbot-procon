import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { seedMenu } from '../../prisma/seed/seed.js';
import { updateMenuUx } from '../../prisma/seed/updateMenuUx.js';

test('seed preserva integralmente um menu já cadastrado', async () => {
  let writes = 0;
  const db: any = { $transaction: async (callback: any) => callback({
    step: { count: async () => 1, createMany: async () => { writes++; } },
    option: { count: async () => 1, createMany: async () => { writes++; } },
  }) };
  await seedMenu(db);
  assert.equal(writes, 0);
});

function migrationFixture() {
  return readFile(new URL('../../prisma/seed/menu-before-ux.json', import.meta.url), 'utf8').then(content => {
    const original = JSON.parse(content);
    let steps: any[] = original.steps.map((step: any) => ({ ...step, id: `db-${step.id}` }));
    let options: any[] = original.options.map((option: any, i: number) => ({ ...option, id: `db-option-${i}`, stepId: `db-${option.stepId}`, nextStepId: option.nextStepId ? `db-${option.nextStepId}` : null }));
    steps.find(step => step.id === 'db-faq-13').message = 'Texto revisado pela equipe local.';
    const tx: any = {
      step: {
        findMany: async () => steps.map(step => ({ ...step, options: options.filter(option => option.stepId === step.id).map(option => ({ ...option })) })),
        update: async ({ where, data }: any) => Object.assign(steps.find(step => step.id === where.id), data),
      },
      option: {
        delete: async ({ where }: any) => { options = options.filter(option => option.id !== where.id); },
        update: async ({ where, data }: any) => Object.assign(options.find(option => option.id === where.id), data),
        create: async ({ data }: any) => { options.push({ ...data }); },
        count: async ({ where }: any) => options.filter(option => option.stepId === where.stepId && (!('nextStepId' in where) || option.nextStepId === where.nextStepId)).length,
      },
    };
    const db: any = { $transaction: async (callback: any) => {
      const snapshot = structuredClone({ steps, options });
      try { return await callback(tx); }
      catch (error) { steps = snapshot.steps; options = snapshot.options; throw error; }
    } };
    return { db, state: () => ({ steps, options }) };
  });
}

test('atualizador simula e reverte toda a transação por padrão', async () => {
  const f = await migrationFixture();
  const before = structuredClone(f.state());
  const result = await updateMenuUx(false, f.db);
  assert.equal(result.aplicado, false);
  assert.ok(result.alteracoes.length > 0);
  assert.deepEqual(f.state(), before);
});

test('atualizador conserva texto do painel, IDs e respostas ao mover Q22', async () => {
  const f = await migrationFixture();
  const before = structuredClone(f.state());
  const result = await updateMenuUx(true, f.db);
  assert.equal(result.aplicado, true);
  assert.equal(f.state().steps.find(step => step.id === 'db-faq-13').message, 'Texto revisado pela equipe local.');
  assert.deepEqual(f.state().steps.map(step => step.id), before.steps.map(step => step.id));
  assert.equal(f.state().options.filter(option => option.nextStepId === 'db-faq-22').length, 1);
  assert.ok(f.state().options.some(option => option.stepId === 'db-garantia-conceitos' && option.text === 'Voltar'));
  const second = await updateMenuUx(true, f.db);
  assert.ok(!second.alteracoes.some(change => /^(TEXTO|RÓTULO|NOVA|LIGAÇÃO)/.test(change)), 'segunda execução não altera novamente');
});
