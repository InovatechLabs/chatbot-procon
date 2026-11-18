import test from 'node:test';
import assert from 'node:assert/strict';
import { rankHybridCandidates, expandRetrievalContext, renderRetrievedArticles } from '../../src/services/llm/helpers/retrievalSelection.js';
import { createRagService } from '../../src/services/llm/llmService.js';

const article = (n: number, content = 'Texto normativo.') => ({ id: `Art. ${n} - Documento`, title: `Art. ${n} - Documento`, content, keywords: [], distincao: null });
const shared = [article(1), article(3), article(4), article(5)];
const vectorOnly = article(2), lexicalOnly = article(6);
const ranking = rankHybridCandidates([shared[0]!, vectorOnly, ...shared.slice(1)], [lexicalOnly, ...shared], [lexicalOnly, ...shared]);
const expand = (current = shared, candidates = [vectorOnly, lexicalOnly], auxiliaryCharacters = 0, displacedReferences: string[] = []) =>
  expandRetrievalContext({ ranking, current, candidates, auxiliaryCharacters, displacedReferences });

test('consenso mantém quatro primeiras fontes; evidência forte de um canal pode ser resgatada', () => {
  assert.deepEqual(ranking.baseIds, shared.map(row => row.id));
  const result = expand();
  assert.deepEqual(result.articles.slice(0, 4), shared);
  assert.equal(result.articles.length, 6);
  assert.ok(result.diagnostics.addedIds.includes(vectorOnly.id));
  assert.ok(result.diagnostics.addedIds.includes(lexicalOnly.id));
  assert.equal(shared.length, 4, 'não mutar contexto original');
});

test('fonte auxiliar ocupa vaga antes de resgates; não expulsa fonte nem corta texto', () => {
  const auxiliary = article(7, 'Condição complementar essencial.');
  const result = expand([...shared, auxiliary]);
  assert.equal(result.articles.length, 6);
  assert.ok(result.articles.includes(auxiliary));
  assert.equal(result.diagnostics.addedIds.length, 1);
  assert.ok(result.diagnostics.omitted.some(row => row.reason === 'document_limit'));
});

test('orçamento de caracteres recusa artigo inteiro e continua tentando outro candidato', () => {
  const large = { ...lexicalOnly, content: 'X'.repeat(13000) };
  const result = expand(shared, [vectorOnly, large], 30);
  assert.ok(!result.articles.some(row => row.id === lexicalOnly.id));
  assert.ok(result.articles.some(row => row.id === vectorOnly.id));
  assert.ok(result.diagnostics.omitted.some(row => row.id === lexicalOnly.id && row.reason === 'character_limit'));
  assert.ok(result.diagnostics.finalCharacters <= 12000);
  assert.equal(large.content.length, 13000);
});

test('contexto existente acima do orçamento é preservado; nenhum resgate aumenta seu tamanho', () => {
  const existing = [article(1, 'X'.repeat(13000)), ...shared.slice(1)];
  const result = expand(existing);
  assert.deepEqual(result.articles, existing);
  assert.equal(result.diagnostics.existingContextOverBudget, true);
  assert.equal(result.diagnostics.addedIds.length, 0);
});

test('não reinclui referência que o contexto auxiliar removeu deliberadamente', () => {
  const result = expand(shared, [vectorOnly, lexicalOnly], 0, ['Art. 6']);
  assert.ok(!result.articles.includes(lexicalOnly));
  assert.ok(result.diagnostics.omitted.some(row => row.reason === 'displaced_by_auxiliary'));
});

test('resgate não fabrica fonte ausente; renderização e orçamento retiram keywords do texto legal', () => {
  const result = expand(shared, []);
  assert.equal(result.articles.length, 4);
  assert.ok(result.diagnostics.omitted.every(row => row.reason === 'missing_source'));
  const empty = expand(shared, [{ ...vectorOnly, content: ' \n ' }]);
  assert.equal(empty.articles.length, 4);
  assert.ok(empty.diagnostics.omitted.every(row => row.reason === 'missing_source'));
  assert.equal(renderRetrievedArticles([article(1, 'Lei. (PALAVRAS-CHAVE PARA BUSCA: exemplo)')]), '[LEI: Art. 1 - Documento]\nLei.');
});

test('fonte resgatada entra no schema e mantém a quarentena de anotação antiga', async () => {
  const invalidNote = 'Serviço não entregue deve usar o Art. 23.';
  const rescued = { ...article(20), distincao: invalidNote };
  const lexical = { ...lexicalOnly, content: 'topic', keywords: ['topic'] };
  const primary = shared.map(row => ({ ...row, content: 'topic', keywords: ['topic'] }));
  const vectors = [primary[0]!, rescued, ...primary.slice(1)];
  const run = createRagService({
    db: { chatLog: { findMany: async () => [] } } as any,
    classify: async () => ({ categoria: 'CONSUMO', motivo: 'Fixture' }),
    embed: async () => [1], vectors: async () => vectors.map(row => ({ id: row.id, distance: 0.1 })),
    articles: async () => [lexical, ...primary, rescued],
    generate: async (prompt, schema: any) => {
      assert.ok(schema.properties.artigo.enum.includes('Art. 20'));
      assert.ok(!prompt.includes(invalidNote));
      return JSON.stringify({ tipoResposta: 'redirecionamento', artigo: null, texto: 'Procure análise da equipe.' });
    },
  });
  const result = await run('topic', 'fixture', { includeDiagnostics: true });
  assert.equal(result.tipoResposta, 'redirecionamento');
  assert.ok(result.diagnostics?.selecaoRecuperacao?.addedIds.includes(rescued.id));
  assert.ok(result.diagnostics?.regrasAuxiliares?.quarantinedDistinctions.includes('Art. 20'));
  assert.equal(rescued.distincao, invalidNote, 'não altera o registro fonte');
});
