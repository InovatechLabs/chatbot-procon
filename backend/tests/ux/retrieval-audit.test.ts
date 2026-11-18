import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRetrieval, expectedRank, summarizeRetrieval } from '../llm/retrieval-audit.js';

const knowledge = [{ id: 'Art. 43 - Cadastros', title: 'Art. 43 - Cadastros', content: 'Acesso a cadastro e correção de dados.', keywords: ['cadastro'], distincao: null }];
const input = { question: 'cadastro', history: [], expected: 'Art. 43', mode: 'approved' as const };

test('posição normaliza sufixo e reconhece artigo em documento composto', () => {
  assert.equal(expectedRank(['Art. 54G - Crédito'], 'Art. 54-G'), 1);
  assert.equal(expectedRank(['Art. 66 e 67 - Infrações'], 'Art. 67'), 1);
  assert.equal(expectedRank(['Art. 43 - Dados'], 'Art. 4'), null);
});

test('auditoria usa o pipeline real com gerador local, sem exigir classificação ou sessão', async () => {
  const limits: number[] = [];
  const audit = await auditRetrieval(input, knowledge, { embed: async () => [1], vectors: async (_vector, limit) => {
    limits.push(limit!); return [{ id: knowledge[0]!.id, distance: 0.1 }];
  } });
  assert.deepEqual(limits, [10, 20]);
  assert.equal(audit.ranks.productionTop4, 1);
  assert.equal(audit.finalContextContainsExpected, true);
  assert.equal(audit.lossStage, 'retained');
  assert.equal(audit.syntheticGeneratorCalls, 1);
  assert.equal(audit.gemmaCalls, 0);
});

test('porta vetorial bloqueia produção mesmo com acerto lexical; cenário hipotético não vira acerto', async () => {
  const audit = await auditRetrieval(input, knowledge, { embed: async () => [1], vectors: async () => [{ id: knowledge[0]!.id, distance: 0.9 }] });
  assert.equal(audit.ranks.lexicalOriginal, 1);
  assert.equal(audit.ranks.hypotheticalHybridPool, 1);
  assert.equal(audit.lossStage, 'vector_gate');
  assert.equal(audit.syntheticGeneratorCalls, 0);
  const summary = summarizeRetrieval([{ audit }, { error: 'FixtureFailure' }]);
  assert.equal(summary.total, 2);
  assert.equal(summary.errors, 1);
  assert.equal(summary.productionTop4Hits, 0);
  assert.equal(summary.hypotheticalRecallHits[20], 0);
});

test('fallback preserva a primeira tentativa e observa a consulta original realmente utilizada', async () => {
  const audit = await auditRetrieval({ ...input, recordedQuery: 'paráfrase', observedOriginalQuery: 'cadastro' }, knowledge, {
    embed: async query => [query === 'cadastro' ? 1 : 0],
    vectors: async vector => [{ id: knowledge[0]!.id, distance: vector === '[1]' ? 0.1 : 0.9 }],
  });
  assert.equal(audit.vectorAttempts.length, 2);
  assert.equal(audit.vectorAttempts[0]!.query, 'paráfrase');
  assert.equal(audit.usedQuery, 'cadastro');
  assert.equal(audit.ranks.productionTop4, 1);
});

test('artigo em sexto permanece fora do top4; expansão hipotética fica separada', async () => {
  const articles = Array.from({ length: 6 }, (_, i) => ({ id: `Art. ${i + 1} - Documento`, title: `Art. ${i + 1} - Documento`, content: 'Norma.', keywords: [], distincao: null }));
  const audit = await auditRetrieval({ ...input, question: 'zzz', expected: 'Art. 6' }, articles, {
    embed: async () => [1], vectors: async () => articles.map(article => ({ id: article.id, distance: 0.1 })),
  });
  assert.equal(audit.lossStage, 'fusion_top4_cut');
  assert.equal(audit.ranks.productionTop4, null);
  assert.equal(audit.ranks.hypotheticalHybridPool, 6);
  const summary = summarizeRetrieval([{ audit }]);
  assert.equal(summary.productionTop4Hits, 0);
  assert.equal(summary.hypotheticalRecallHits[4], 0);
  assert.equal(summary.hypotheticalRecallHits[6], 1);
  assert.equal(summary.meanReciprocalRankTop4, 0);
});
