import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareLegalContext, loadLegalRuleCatalog } from '../../src/services/llm/legalKnowledge/context.js';
import { createRagService } from '../../src/services/llm/llmService.js';
import { articleReferences } from '../../src/services/llm/helpers/articleReference.js';

const source = JSON.parse(readFileSync(new URL('../../src/database/data/cdcData.json', import.meta.url), 'utf8'))
  .map((article: any) => ({ ...article, id: article.title, distincao: article.distincao ?? null }));
const articles = (numbers: (string | number)[]) => numbers.map(number => {
  const article = source.find((item: any) => item.title.startsWith(`Art. ${number} -`));
  assert.ok(article, `Artigo de teste ${number} ausente`); return article;
});
const catalog = loadLegalRuleCatalog();

test('candidatos tangenciais e palavras funcionais não ativam famílias sem tema no relato', () => {
  for (const query of [
    'A financeira não explicou os custos nem avaliou minha situação financeira.',
    'Tenho um contrato de adesão e não pude conhecer as cláusulas antes de pagar.',
    'Recebi uma cobrança de academia após cancelar a matrícula.',
  ]) {
    const result = prepareLegalContext({ catalog, mode: 'preview', citizenQuery: query, candidates: articles([18, 20, 26, 42]), articles: source });
    assert.ok(!result.diagnostics.selectedRules.some(id => /^(CDC18-|CDC20-|CDC26-)/.test(id)), query);
  }
});

test('transferência explícita preserva prioridade mesmo com seis fontes como limite', () => {
  const result = prepareLegalContext({ catalog, mode: 'preview', citizenQuery: 'Fiz PIX errado para uma loja e caiu na conta de terceiro. O banco não resolve.', candidates: articles([72, 13, 20, 22]), articles: source });
  assert.deepEqual(result.diagnostics.selectedRules, ['PIX-DESTINO-INCERTO']);
  assert.ok(result.diagnostics.addedArticles.includes('Art. 14'));
  assert.ok(result.articles.length <= 6);
});

test('plural preserva tema de danos e serviço de instalação não vira reparo de produto', () => {
  const damages = prepareLegalContext({ catalog, mode: 'preview', citizenQuery: 'Produto defeituoso causou danos à família e preciso saber o prazo para reparação.', candidates: articles([27, 12, 18, 14]), articles: source });
  assert.ok(damages.diagnostics.selectedRules.includes('CDC27-REPARACAO-DANOS'));
  const service = prepareLegalContext({ catalog, mode: 'preview', citizenQuery: 'O serviço de instalação deixou o aparelho com defeito, não funciona.', candidates: articles([18, 14, 20]), articles: source });
  assert.ok(service.diagnostics.selectedRules.includes('CDC20-VICIO-SERVICO'));
  assert.ok(!service.diagnostics.selectedRules.some(id => id.startsWith('CDC18-')));
});

test('pergunta sobre prazo de vício conserva família completa; simples entrega não a ativa', () => {
  const result = prepareLegalContext({ catalog, mode: 'preview', citizenQuery: 'Celular entregue com memória diferente da oferta.', candidates: articles([26, 18, 35]), articles: source });
  assert.ok(!result.diagnostics.selectedRules.some(id => id.startsWith('CDC26-')));
});

test('produção ignora rascunhos; prévia não altera revisão nem o catálogo', () => {
  const input = { catalog, citizenQuery: 'Prazo para reclamar de vício oculto na geladeira', candidates: articles([18]), articles: source };
  assert.equal(prepareLegalContext({ ...input, mode: 'approved' }).instructions, '');
  const preview = prepareLegalContext({ ...input, mode: 'preview' });
  assert.ok(preview.diagnostics.selectedRules.length > 0);
  assert.deepEqual(preview.diagnostics.draftRules, preview.diagnostics.selectedRules);
  assert.ok(catalog.rules.every(rule => rule.review.status === 'technical_draft'));
  assert.equal(prepareLegalContext({ ...input, mode: 'off', catalog: null }).instructions, '');
});

test('família de prazos inclui as quatro alternativas e recupera o texto faltante', () => {
  const context = prepareLegalContext({ catalog, mode: 'preview', citizenQuery: 'Qual o prazo para reclamar de vício oculto?', candidates: articles([18]), articles: source });
  const deadlines = context.diagnostics.selectedRules.filter(id => id.startsWith('CDC26-'));
  assert.equal(deadlines.length, 4);
  assert.ok(context.diagnostics.addedArticles.includes('Art. 26'));
  assert.ok(context.articles.some(article => article.title.startsWith('Art. 26 -')));
  assert.ok(context.instructions.includes('durable') && context.instructions.includes('non_durable'));
  assert.ok(context.instructions.includes('apparent') && context.instructions.includes('hidden'));
  assert.ok(context.diagnostics.contextCharacters <= 6000);
});

test('família parcialmente aprovada não escolhe uma única alternativa como regra geral', () => {
  const partial = structuredClone(catalog);
  const first = partial.rules.find(rule => rule.id.startsWith('CDC26-'))!;
  first.review = { status: 'approved', checkedOn: '2026-11-17', reviewedBy: 'Teste', reviewedOn: '2026-11-17' };
  const result = prepareLegalContext({ catalog: partial, mode: 'approved', citizenQuery: 'prazo defeito oculto', candidates: articles([26]), articles: source });
  assert.equal(result.instructions, '');
  assert.ok(result.diagnostics.omittedRules.some(rule => rule.reason === 'incomplete_family'));
});

test('não injeta referência cujo texto falta; orçamento não corta condições ou famílias', () => {
  const missing = prepareLegalContext({ catalog, mode: 'preview', citizenQuery: 'PIX para terceiro', candidates: articles([42]), articles: articles([42, 3]) });
  assert.ok(!missing.diagnostics.selectedRules.includes('PIX-DESTINO-INCERTO'));
  assert.ok(missing.diagnostics.omittedRules.some(rule => rule.id === 'PIX-DESTINO-INCERTO' && rule.reason === 'missing_source'));
  assert.ok(!missing.articles.some(article => article.title.startsWith('Art. 14 -')));
  const tiny = prepareLegalContext({ catalog, mode: 'preview', citizenQuery: 'prazo de reclamação por defeito', candidates: articles([26]), articles: source, limits: { maxCharacters: 1 } });
  assert.equal(tiny.instructions, ''); assert.deepEqual(tiny.diagnostics.selectedRules, []);
  assert.ok(tiny.diagnostics.omittedRules.some(rule => rule.reason === 'budget'));
});

test('distinção antiga é substituída só no contexto selecionado, sem mutar fontes', () => {
  const [original] = articles([20]);
  const before = original.distincao;
  const result = prepareLegalContext({ catalog, mode: 'preview', citizenQuery: 'Serviço de pintura malfeito', candidates: [original], articles: source });
  assert.ok(result.diagnostics.selectedRules.includes('CDC20-VICIO-SERVICO'));
  assert.equal(result.articles.find(article => article.id === original.id)!.distincao, null);
  assert.ok(result.diagnostics.quarantinedDistinctions.includes('Art. 20'));
  assert.equal(original.distincao, before);
});

test('anotação comprovadamente incorreta é isolada mesmo sem regras aprovadas', () => {
  const [original] = articles([20]);
  const before = original.distincao;
  for (const mode of ['approved', 'off'] as const) {
    const result = prepareLegalContext({ catalog, mode, citizenQuery: 'Serviço malfeito', candidates: [original], articles: source });
    assert.equal(result.instructions, '');
    assert.equal(result.articles[0]!.content, original.content);
    assert.equal(result.articles[0]!.distincao, null);
    assert.deepEqual(result.diagnostics.quarantinedDistinctions, ['Art. 20']);
  }
  assert.equal(original.distincao, before);
});

test('prévia exige diagnóstico explícito e modo off não carrega catálogo', async () => {
  await assert.rejects(createRagService()('Teste', 'session', { legalRulesMode: 'preview' }), /diagnósticos/);
  let catalogReads = 0;
  const run = createRagService({ db: { chatLog: { findMany: async () => [] } } as any,
    classify: async () => ({ categoria: 'CONSUMO', motivo: 'Fixture' }), embed: async () => [0.1],
    vectors: async () => [{ id: articles([42])[0].id, distance: 0.1 }], articles: async () => articles([42]),
    legalCatalog: () => { catalogReads++; throw Error('Não carregar'); },
    generate: async () => JSON.stringify({ tipoResposta: 'orientacao_final', artigo: 'Art. 42', texto: 'Guarde o comprovante.' }),
  });
  assert.equal((await run('cobrança', 'session', { legalRulesMode: 'off' })).tipoResposta, 'orientacao_final');
  assert.equal(catalogReads, 0);
});

test('RAG seleciona pelo relato original e permite somente artigos com texto incluído', async () => {
  const knowledge = articles([13, 72, 42, '54D', 3, 14]);
  let captured = '', allowed: (string | null)[] = [], calls = 0;
  const run = createRagService({ db: { chatLog: { findMany: async () => [] } } as any,
    classify: async () => ({ categoria: 'CONSUMO', motivo: 'Fixture', consultaBusca: 'conserto defeito na geladeira' }),
    embed: async () => [0.1], vectors: async () => knowledge.slice(0, 4).map((article: any) => ({ id: article.id, distance: 0.1 })),
    articles: async () => knowledge, legalCatalog: () => catalog,
    generate: async (prompt, schema: any) => { calls++; captured = prompt; allowed = schema.properties.artigo.enum;
      return JSON.stringify({ tipoResposta: 'redirecionamento', artigo: null, texto: 'O caso precisa de análise da equipe. Quer agendar?' }); },
  });
  const result = await run('Meu PIX foi para um terceiro por erro do banco.', 'session', { legalRulesMode: 'preview', includeDiagnostics: true });
  assert.equal(calls, 1);
  assert.ok(result.diagnostics?.regrasAuxiliares?.selectedRules.includes('PIX-DESTINO-INCERTO'));
  assert.ok(captured.includes('REGRAS_AUXILIARES_JSON'));
  assert.ok(captured.includes('não fatos confirmados'));
  for (const ref of allowed.filter(ref => ref !== null)) {
    assert.ok(captured.includes(`[LEI: ${knowledge.find((article: any) => articleReferences(article.title).includes(ref))!.title}]`));
  }
  assert.equal(result.tipoResposta, 'redirecionamento');
});
