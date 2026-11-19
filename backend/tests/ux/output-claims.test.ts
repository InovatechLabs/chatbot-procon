import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectLegalSafety } from '../../src/services/llm/legalKnowledge/safety.js';
import { articleReferences } from '../../src/services/llm/helpers/articleReference.js';
import { createRagService } from '../../src/services/llm/llmService.js';

const articles = JSON.parse(readFileSync(new URL('../../src/database/data/cdcData.json', import.meta.url), 'utf8')) as { title: string; content: string }[];
const sources = articles.flatMap(article => articleReferences(article.title).map(reference => ({ reference, content: article.content })));
const check = (text: string, article: string, query = 'Quero orientação geral sobre o problema.') => inspectLegalSafety({ text, article, kind: 'orientacao_final', citizenMessages: [query], sources });

test('recomendação adicional de arrependimento preserva prazo, não apenas canal da compra', () => {
  assert.ok(check('Você pode desistir da assinatura por arrependimento, conforme Art. 49, se contratou por telefone.', 'Art. 39').reasons.includes('prazo_arrependimento_omitido'));
  assert.equal(check('Na contratação por telefone, pode exercer arrependimento em sete dias contados da assinatura do contrato.', 'Art. 49').passed, true);
  assert.equal(check('O Art. 49 não se aplica aqui. Você pode pedir o cancelamento por descumprimento da oferta.', 'Art. 35').passed, true);
});

test('lista de soluções do art. 20 não pode excluir a terceira alternativa prevista', () => {
  for (const [text, reason] of [
    ['Você pode escolher entre refazer a limpeza do sofá ou pedir restituição do valor pago.', 'art20_abatimento_omitido'],
    ['Você pode solicitar alternativamente refazer o serviço ou um desconto proporcional.', 'art20_restituicao_omitida'],
    ['As opções são restituição do valor pago ou abatimento proporcional.', 'art20_reexecucao_omitida'],
  ]) assert.ok(check(text!, 'Art. 20').reasons.includes(reason!), text!);
});

test('sinônimos e reexecução sem custo não apagam as demais alternativas; foco específico não exige lista', () => {
  assert.equal(check('Você pode escolher entre refazer o serviço sem custo quando cabível, receber reembolso atualizado ou pedir desconto proporcional.', 'Art. 20').passed, true);
  assert.equal(check('Você pode pedir reexecução sem custo, quando cabível.', 'Art. 20', 'Posso pedir para refazerem o polimento?').passed, true);
  assert.equal(check('O Art. 20 não se aplica. A troca, restituição ou desconto por vício do produto dependem das condições legais.', 'Art. 18').passed, true);
});

test('negar alternativa não satisfaz sua presença em lista', () => {
  assert.ok(check('Você pode pedir reexecução ou restituição; não cabe abatimento.', 'Art. 20').reasons.includes('art20_abatimento_omitido'));
  assert.ok(check('Você pode pedir reexecução ou restituição; não é possível abatimento.', 'Art. 20').reasons.includes('art20_abatimento_omitido'));
});

test('falta de correção não vira infração de acesso, inclusive em condição com não corrigir', () => {
  for (const text of [
    'Se a empresa não corrigir os dados, pode cometer infração conforme o Art. 72.',
    'Se não fornecer as informações ou não corrigir os dados, pode cometer infração pelo Art. 72.',
  ]) assert.ok(check(text, 'Art. 43').reasons.includes('art72_correcao_atribuicao_incompativel'));
  assert.equal(check('A recusa de acesso aos registros pode caracterizar infração conforme o Art. 72.', 'Art. 43').passed, true);
  assert.equal(check('Impedir acesso pode configurar infração pelo Art. 72, não a mera falta de correção.', 'Art. 43').passed, true);
  assert.equal(check('O Art. 72 não é a previsão da falta de correção dos dados.', 'Art. 43').passed, true);
});

test('contraste de infrações usa referência próxima; não aprova artigo ausente da fonte', () => {
  const text = 'Infrações: Art. 72 trata de impedir acesso aos registros, Art. 73 trata de deixar de corrigir dados inexatos.';
  assert.ok(check(text, 'Art. 43').reasons.includes('referencia_textual_sem_fonte'));
  // Fonte fictícia de teste, sem alteração ou aprovação do corpus de produção.
  assert.equal(inspectLegalSafety({ text, article: 'Art. 43', kind: 'orientacao_final', citizenMessages: [],
    sources: [...sources, { reference: 'Art. 73', content: 'Não corrigir informação sabidamente inexata em cadastro constitui infração.' }] }).passed, true);
});

test('juros sobre restituição exigem fonte da afirmação; juros de crédito não emprestam fundamento', () => {
  assert.ok(check('Pelo Art. 35, você pode receber o valor de volta com juros.', 'Art. 35').reasons.includes('juros_restituicao_sem_fonte'));
  assert.ok(check('Você pode pedir restituição com juros conforme Art. 52.', 'Art. 35').reasons.includes('juros_restituicao_sem_fonte'));
  assert.equal(check('Você pode pedir restituição do valor pago com correção e juros conforme o Art. 42.', 'Art. 42', 'Paguei a cobrança indevida.').passed, true);
  assert.equal(check('Você pode quitar o crédito antecipadamente com redução dos juros.', 'Art. 52').passed, true);
  assert.equal(check('A restituição pode ser analisada; não há base para prometer juros.', 'Art. 35').passed, true);
  assert.ok(check('O Art. 42 não se aplica. Você pode receber o valor de volta com juros.', 'Art. 35').reasons.includes('juros_restituicao_sem_fonte'));
  assert.equal(check('O Art. 20 não se aplica. Você pode pedir restituição com juros.', 'Art. 42', 'Paguei a cobrança indevida.').passed, true);
});

test('indenização pessoal não é resultado garantido; direito de pedir e regra abstrata são preservados', () => {
  assert.ok(check('Você tem direito de cancelar e receber o dinheiro com indenização pelas perdas.', 'Art. 35').reasons.includes('indenizacao_resultado_nao_verificado'));
  assert.ok(check('Você tem o direito de cancelar e receber a quantia com indenização pelas perdas.', 'Art. 35').reasons.includes('indenizacao_resultado_nao_verificado'));
  assert.ok(check('Você receberá indenização pelos danos.', 'Art. 12').reasons.includes('indenizacao_resultado_nao_verificado'));
  assert.ok(check('Você receberá indenização sem análise e não depende de danos comprovados.', 'Art. 12').reasons.includes('indenizacao_resultado_nao_verificado'));
  assert.ok(check('Você tem direito de pedir reparação e a indenização é garantida, embora dependa de análise.', 'Art. 12').reasons.includes('indenizacao_resultado_nao_verificado'));
  assert.equal(check('Você tem direito de pedir indenização; a equipe avalia os danos.', 'Art. 12').passed, true);
  assert.equal(check('Se comprovados os danos, você pode pleitear indenização.', 'Art. 12').passed, true);
  assert.equal(check('A lei prevê restituição atualizada e perdas e danos, sujeitos à análise do caso.', 'Art. 35').passed, true);
});

test('cinco dias para comunicação de alteração não viram prazo para corrigir cadastro', () => {
  assert.ok(check('Você pode exigir a correção dos dados em até cinco dias úteis.', 'Art. 43').reasons.includes('art43_prazo_finalidade_incorreta'));
  assert.ok(check('Você pode exigir correção em cinco dias úteis e comunicar a alteração aos destinatários.', 'Art. 43').reasons.includes('art43_prazo_finalidade_incorreta'));
  assert.equal(check('Você pode exigir correção imediata. O arquivista deve comunicar a alteração aos destinatários em até cinco dias úteis.', 'Art. 43').passed, true);
  assert.equal(check('A correção deve ser comunicada aos destinatários em até cinco dias úteis.', 'Art. 43').passed, true);
  assert.equal(check('Os cinco dias úteis não são prazo para corrigir os dados.', 'Art. 43').passed, true);
  assert.equal(check('O dado estava errado há cinco dias. Você pode exigir correção imediata.', 'Art. 43').passed, true);
});

test('venda casada não garante cancelamento vinculado gratuito; arrependimento conserva sua hipótese', () => {
  assert.ok(check('Se desistir do serviço principal, o outro contrato também deve ser cancelado sem ônus.', 'Art. 39').reasons.includes('cancelamento_vinculado_nao_verificado'));
  assert.equal(check('Você pode contestar a contratação imposta e pedir análise do cancelamento.', 'Art. 39').passed, true);
  assert.equal(check('Na contratação por telefone, você pode desistir em 7 dias desde a assinatura; o contrato deve ser cancelado sem ônus.', 'Art. 49').passed, true);
});

test('contratar terceiro com ressarcimento não substitui opção do art. 35', () => {
  assert.ok(check('Pelo Art. 35, você pode contratar outro profissional e ser ressarcido pelos gastos.', 'Art. 35').reasons.includes('reexecucao_terceiro_referencia_incompativel'));
  assert.equal(check('Você pode exigir cumprimento da oferta, aceitar serviço equivalente ou rescindir com restituição atualizada.', 'Art. 35').passed, true);
  assert.equal(check('Quando cabível, a reexecução pode ser confiada a terceiros capacitados por conta e risco do fornecedor.', 'Art. 20').passed, true);
});

test('pipeline não envia a orientação descartada nem completa direitos com texto improvisado', async () => {
  const cases = [
    { article: 'Art. 39', refs: ['Art. 39', 'Art. 49'], text: 'Você pode cancelar por arrependimento do Art. 49 se contratou por telefone.', reason: 'prazo_arrependimento_omitido' },
    { article: 'Art. 20', refs: ['Art. 20'], text: 'Você pode escolher entre refazer o serviço e pedir restituição.', reason: 'art20_abatimento_omitido' },
    { article: 'Art. 43', refs: ['Art. 43', 'Art. 72'], text: 'Se não corrigir os dados, pode cometer infração conforme o Art. 72.', reason: 'art72_correcao_atribuicao_incompativel' },
    { article: 'Art. 35', refs: ['Art. 35'], text: 'Você pode receber o valor de volta com juros.', reason: 'juros_restituicao_sem_fonte' },
  ];
  for (const item of cases) {
    const knowledge = articles.filter(article => articleReferences(article.title).some(ref => item.refs.includes(ref))).map(article => ({ ...article, id: article.title, keywords: [], distincao: null }));
    const run = createRagService({ db: { chatLog: { findMany: async () => [] } } as any,
      classify: async () => ({ categoria: 'CONSUMO', motivo: 'Fixture' }), embed: async () => [1],
      vectors: async () => knowledge.map(row => ({ id: row.id, distance: 0.1 })), articles: async () => knowledge,
      generate: async () => JSON.stringify({ tipoResposta: 'orientacao_final', artigo: item.article, texto: item.text }),
    });
    const result = await run('Quero orientação sobre o problema.', 'fixture', { includeDiagnostics: true });
    assert.equal(result.tipoResposta, 'redirecionamento');
    assert.equal(result.artigo, null);
    assert.ok(result.diagnostics?.segurancaJuridica?.reasons.includes(item.reason));
    assert.ok(!result.texto.includes(item.text));
  }
});
