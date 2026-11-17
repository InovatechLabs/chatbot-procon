import test from 'node:test';
import assert from 'node:assert/strict';
import { articleReferences, normalizeReference } from '../../src/services/llm/helpers/articleReference.js';
import { createRagService } from '../../src/services/llm/llmService.js';
import { parseClassification, classifyExplicitIntent, validateScopeEvidence, CLASSIFICATION_SCHEMA, classificationPrompt } from '../../src/services/llm/helpers/classifyReport.js';

test('suspeita de golpe não inventa identidade falsa a partir de falha de uma loja', () => {
 const result = { categoria: 'GOLPE_TERCEIRO' as const, motivo: 'Suspeita' };
 assert.equal(validateScopeEvidence(result, 'A empresa me enrolou, recebi metade da compra.', '').categoria, 'CONSUMO');
 assert.equal(validateScopeEvidence(result, 'Um falso funcionário me fez pagar.', '').categoria, 'GOLPE_TERCEIRO');
 assert.equal(validateScopeEvidence(result, 'Ele sumiu.', 'Assistente virtual: Era um vendedor falso?').categoria, 'AMBIGUO');
 assert.equal(validateScopeEvidence(result, 'Ele sumiu.', 'Cidadão: Paguei a um falso vendedor.').categoria, 'GOLPE_TERCEIRO');
});

test('triagem material e intencoes explicitas ficam separadas', () => {
 const parsed = { categoria: 'CONSUMO', motivo: 'Servico sem detalhes', perguntaEsclarecimento: 'Qual servico?', consultaBusca: 'servico' };
 assert.equal(parseClassification(parsed).categoria, 'CONSUMO');
 assert.equal(parseClassification(parsed).informacaoSuficiente, true);
 assert.equal(parseClassification({ ...parsed, categoria: 'AMBIGUO' }).informacaoSuficiente, false);
 assert.equal(parseClassification({ ...parsed, perguntaEsclarecimento: null }).informacaoSuficiente, true);
 assert.throws(() => parseClassification({ ...parsed, categoria: 'inventado' }));
 assert.equal(classifyExplicitIntent('quero morrer por causa dessas dividas'), 'RISCO_PESSOAL');
 assert.ok(CLASSIFICATION_SCHEMA.properties.categoria.enum.includes('AGENDAMENTO'));
 assert.ok(classificationPrompt('eu gostaria de agendar um atendimento', '').includes('AGENDAMENTO:'));
 const schedule = parseClassification({ categoria: 'AGENDAMENTO', motivo: 'Deseja atendimento presencial', consultaBusca: 'não usar', perguntaEsclarecimento: 'não usar' });
 assert.equal(schedule.categoria, 'AGENDAMENTO');
 assert.equal(schedule.informacaoSuficiente, true);
 assert.equal(schedule.consultaBusca, undefined);
 assert.equal(schedule.perguntaEsclarecimento, undefined);
 for (const phrase of ['quero agendar um atendimento', 'eu gostaria de agendar um atendimento', 'Eu queria marcar uma consulta, por favor!', 'Por favor, eu preciso agendar um atendimento no PROCON de Jacareí.']) {
   assert.equal(classifyExplicitIntent(phrase), null, 'pedido deve passar pelo classificador: ' + phrase);
 }
 for (const phrase of ['eu não gostaria de agendar um atendimento', 'não quero agendar um atendimento', 'eu gostaria de agendar um atendimento mas a loja não entregou meu produto', 'quero agendar um atendimento na oficina porque meu carro quebrou']) {
   assert.equal(classifyExplicitIntent(phrase), null, phrase);
 }
 assert.equal(classifyExplicitIntent('onde fica o Procon?'), 'INFO_ATENDIMENTO');
 assert.equal(classifyExplicitIntent('a loja me roubou, chegou produto diferente'), null);
 assert.equal(classifyExplicitIntent('o contrato exclui responsabilidade por danos'), null);
 assert.equal(classifyExplicitIntent('oi, a loja nao entregou minha geladeira'), null);
});

test('referências têm identidade independente de título, acentos e documento composto', () => {
  assert.deepEqual(articleReferences('Art. 18 - Vício do Produto — Garantia Legal'), ['Art. 18']);
  assert.deepEqual(articleReferences('Art. 66 e 67 - Infrações Penais'), ['Art. 66', 'Art. 67']);
  assert.deepEqual(articleReferences('Art. 54G - Crédito'), ['Art. 54-G']);
  assert.equal(normalizeReference('Art. 35, inciso I'), null);
});

const base: any = {
 db: { chatLog: { findMany: async () => [] } },
 classify: async () => ({ categoria: 'CONSUMO', motivo: 'teste' }),
 embed: async () => [0.1], vectors: async () => [{ id: 'law', distance: 0.1 }],
 articles: async () => [{ id: 'law', title: 'Art. 66 e 67 - Infrações Penais', content: 'Publicidade enganosa.', keywords: ['publicidade'], distincao: null }],
 generate: async () => JSON.stringify({ tipoResposta: 'orientacao_final', artigo: 'Art. 67', texto: 'Guarde a publicidade e procure o atendimento.' }),
};

test('consumo incompleto esclarece antes de buscar, sem nova classificação', async () => {
 const result = await createRagService({ ...base, classify: async () => { throw Error('não chamar'); }, embed: async () => { throw Error('não buscar'); } })('um serviço', 'session', {
 preClassification: { categoria: 'CONSUMO', motivo: 'falta natureza', informacaoSuficiente: false, perguntaEsclarecimento: 'Qual serviço você contratou?' }, includeDiagnostics: true });
 assert.equal(result.tipoResposta, 'clarificacao');
 assert.equal(result.texto, 'Qual serviço você contratou?');
});

test('schema restringe referências ao contexto e aceita artigo de documento composto', async () => {
 const result = await createRagService({ ...base, generate: async (_p: string, schema: any, options: any) => {
 assert.deepEqual(schema.properties.artigo.enum, ['Art. 66', 'Art. 67', null]);
 assert.equal(schema.properties.texto.maxLength, undefined);
 assert.equal(options.temperature, 0);
 return base.generate();
 } })('publicidade', 'session', { includeDiagnostics: true });
 assert.equal(result.artigo, 'Art. 67');
 assert.equal(result.diagnostics?.referenciaGerada, 'Art. 67');
});

test('sem proximidade na paráfrase, tenta o relato original mantendo o limiar', async () => {
 const queries: string[] = [];
 const result = await createRagService({ ...base,
  classify: async () => ({ categoria: 'CONSUMO', motivo: 'teste', consultaBusca: 'paráfrase' }),
  embed: async (query: string) => { queries.push(query); return [queries.length]; },
  vectors: async (vector: string) => [{ id: 'law', distance: vector === '[1]' ? 0.9 : 0.1 }],
 })('relato original', 'session', { includeDiagnostics: true });
 assert.deepEqual(queries, ['paráfrase', 'relato original']);
 assert.equal(result.artigo, 'Art. 67');
 assert.equal(result.diagnostics?.consultaBuscaUsada, 'relato original');
});

test('descarte distingue formato inválido de referência válida fora do contexto', async () => {
 for (const [artigo, reason] of [[ 'Art. 67, inciso I', 'referencia_formato_invalido' ], ['Art. 999', 'referencia_fora_candidatos']]) {
 const result = await createRagService({ ...base, generate: async () => JSON.stringify({ tipoResposta: 'orientacao_final', artigo, texto: 'Guarde os comprovantes.' }) })('publicidade', 'session', { includeDiagnostics: true });
 assert.equal(result.tipoResposta, 'redirecionamento');
 assert.equal(result.diagnostics?.motivoDescarte, reason);
 assert.equal(result.diagnostics?.referenciaGerada, artigo);
 }
});
