import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { citizenEvidence, inspectLegalSafety } from '../../src/services/llm/legalKnowledge/safety.js';
import { createRagService, createOrientationService } from '../../src/services/llm/llmService.js';
import { articleReferences } from '../../src/services/llm/helpers/articleReference.js';

const articles = JSON.parse(readFileSync(new URL('../../src/database/data/cdcData.json', import.meta.url), 'utf8')) as { title: string; content: string }[];
const sources = articles.flatMap(article => articleReferences(article.title).map(reference => ({ reference, content: article.content })));
const check = (text: string, article: string | null, query = '', kind: 'orientacao_final' | 'clarificacao' | 'redirecionamento' = 'orientacao_final') =>
  inspectLegalSafety({ text, article, kind, citizenMessages: [query], sources });

test('arrependimento não substitui recebimento por entrega prevista; crédito não vira cobrança', () => {
  assert.ok(check('Você pode desistir em 7 dias contados da data em que deveria ter chegado.', 'Art. 49').reasons.includes('marco_arrependimento_sem_recebimento'));
  assert.equal(check('Para compra online, você pode desistir em 7 dias a contar do recebimento efetivo do produto.', 'Art. 49').passed, true);
  assert.ok(check('O emissor pode lançar o valor como cobrança em confiança.', 'Art. 54-G').reasons.includes('credito_em_confianca_sentido_invertido'));
  assert.equal(check('O emissor pode lançar o valor como crédito em confiança durante a apuração.', 'Art. 54-G').passed, true);
});

test('pagamento condicional não é substituído por mera cobrança indevida ou cláusula abusiva', () => {
  for (const text of [
    'Se a cláusula for abusiva, você pode ter direito à repetição do indébito, recebendo de volta o valor cobrado indevidamente, conforme Art. 42.',
    'Você pode ter direito à devolução do valor cobrado pelo banco. Art. 42.',
  ]) assert.ok(check(text, 'Art. 51', 'A academia me cobrou após o cancelamento.').reasons.includes('pagamento_nao_confirmado_para_restituicao'));
  assert.equal(check('Se você pagou uma cobrança indevida, pode pedir a restituição. Art. 42.', 'Art. 42', 'A academia me cobrou após o cancelamento.').passed, true);
  assert.equal(check('Você pode pedir a restituição do valor cobrado. Art. 42.', 'Art. 42', 'Paguei a cobrança indevida.').passed, true);
});

test('dano e autoria são necessários também quando o artigo principal é o 27', () => {
  assert.ok(check('Para indenização, o prazo é de 5 anos desde o conhecimento do defeito e de quem é responsável.', 'Art. 27').reasons.includes('marco_reparacao_danos_nao_verificado'));
  assert.equal(check('Para indenização, o prazo é de 5 anos desde o conhecimento do dano e de quem o causou.', 'Art. 27').passed, true);
});

test('prazo de danos não vira prazo de vício pela presença de referência complementar', () => {
  assert.equal(check('O prazo para buscar reparação por dano é de 5 anos desde o conhecimento do dano e da autoria. Se for apenas vício de funcionamento, o prazo para reclamar é outro, conforme o Art. 26.', 'Art. 27').passed, true);
  assert.equal(check('Para avaliar seu prazo para reclamar, que pode chegar a 5 anos a partir do conhecimento do dano e da autoria, procure a equipe.', 'Art. 12').passed, true);
});

test('não recebimento não autoriza substituir marco nem omiti-lo', () => {
  assert.ok(check('Você tem 7 dias a partir do recebimento ou, no seu caso, da data da compra, já que o produto não chegou.', 'Art. 49', 'A encomenda não chegou.').reasons.includes('marco_arrependimento_substituido'));
  assert.ok(check('Para compras online, você tem 7 dias para desistir.', 'Art. 49').reasons.includes('marco_arrependimento_omitido'));
  assert.equal(check('Em compras online, o prazo de 7 dias conta do recebimento efetivo. Se o produto não chegou, procure avaliar o descumprimento da oferta pelo Art. 35.', 'Art. 49', 'A encomenda não chegou.').passed, true);
  assert.ok(check('Você tem até 7 dias para desistir da compra e receber seu dinheiro de volta.', 'Art. 49').reasons.includes('marco_arrependimento_omitido'));
  assert.equal(check('Você tem 7 dias contados de quando recebeu o produto.', 'Art. 49').passed, true);
  assert.ok(check('Restam 3 dias para você desistir.', 'Art. 49').reasons.includes('conclusao_individual_prazo_nao_verificada'));
});

test('possibilidade de restituição individual também exige pagamento conhecido ou condicional', () => {
  assert.ok(check('O PROCON pode avaliar a possibilidade de repetição do indébito, que é o valor pago indevidamente.', 'Art. 42', 'Apareceu uma cobrança no cartão.').reasons.includes('pagamento_nao_confirmado_para_restituicao'));
  assert.equal(check('Se você pagou, o PROCON pode avaliar a possibilidade de repetição do indébito.', 'Art. 42', 'Apareceu uma cobrança no cartão.').passed, true);
});

test('captura de avaliação observa resposta antes do descarte sem vazar para diagnóstico normal', async () => {
  const source = articles.find(article => article.title.startsWith('Art. 42 -'))!;
  const generated = { tipoResposta: 'orientacao_final', artigo: 'Art. 42', texto: 'Você pode ter direito à devolução do valor cobrado.' };
  const run = createRagService({ db: { chatLog: { findMany: async () => [] } } as any,
    classify: async () => ({ categoria: 'CONSUMO', motivo: 'Fixture' }), embed: async () => [0.1],
    vectors: async () => [{ id: 'source', distance: 0.1 }], articles: async () => [{ ...source, id: 'source', keywords: [], distincao: null }],
    generate: async () => JSON.stringify(generated),
  });
  let captured: unknown;
  const result = await run('Apareceu uma cobrança.', 'fixture', { includeDiagnostics: true, onGeneratedForEvaluation: value => { captured = value; } });
  assert.deepEqual(captured, generated);
  assert.equal(result.tipoResposta, 'clarificacao');
  assert.ok(!JSON.stringify(result.diagnostics).includes(generated.texto));
  await assert.rejects(run('Fixture', 'fixture', { onGeneratedForEvaluation: () => {} }), /diagnósticos/);
});

test('prazos inventados em algarismos, por extenso e outras unidades não ganham suporte das keywords', () => {
  for (const text of ['A loja tem 48 horas para sanar o vício.', 'A empresa tem quarenta e oito horas para consertar.', 'O prazo do fornecedor é de noventa e dois dias.', 'A empresa tem duas semanas para o reparo.', 'A garantia legal do Art. 18 é de 90 dias.']) {
    assert.equal(check(text, 'Art. 18').passed, false, text);
  }
});

test('regras condicionais completas não exigem datas nem são confundidas com cálculo individual', () => {
  for (const text of [
    'Para bens duráveis com vício aparente, o prazo para reclamar é de 90 dias desde a entrega. Se o vício for oculto, começa quando o defeito fica evidenciado.',
    'Se for caracterizado vício oculto, a contagem não começa na compra; começa na evidência do defeito.',
    'Para vícios ocultos em produtos não duráveis, a contagem é de 30 dias desde a evidência do defeito.',
  ]) assert.equal(check(text, 'Art. 26', 'Explique o prazo para vício oculto.').passed, true, text);
});

test('não basta espalhar os marcos certos pelo texto se as relações estão invertidas ou negadas', () => {
  for (const text of [
    'Para vícios ocultos em bens duráveis, o prazo de 90 dias começa na entrega, não na evidência do defeito.',
    'Para vícios ocultos, o prazo começa na entrega. Para vícios aparentes, começa na evidência do defeito.',
    'A evidência do defeito não é o marco inicial para vício oculto. Conte da compra.',
  ]) assert.equal(check(text, 'Art. 26', 'O defeito só ficou evidente agora.').passed, false, text);
});

test('orientação de conserto é permitida; a exceção não autoriza uma ampliação automática', () => {
  assert.equal(check('O fornecedor tem até 30 dias para sanar o vício; há exceções legais à espera.', 'Art. 18').passed, true);
  assert.equal(check('Os 30 dias são para consertar, não para reclamar do defeito.', 'Art. 18').passed, true);
  assert.equal(check('O prazo não se amplia automaticamente para 180 dias; depende de acordo entre as partes e das condições legais.', 'Art. 18').passed, true);
  assert.equal(check('O prazo é de 180 dias porque o fornecedor não concordou com acordo.', 'Art. 18').passed, false);
});

test('declaração posterior corrige histórico; pergunta e fala do assistente não viram fato', () => {
  assert.equal(citizenEvidence(['Recebi uma cobrança indevida.', 'Corrigindo: não houve cobrança.']).collection, 'denied');
  assert.equal(citizenEvidence(['Não paguei.', 'Depois paguei a cobrança.']).payment, 'reported');
  assert.equal(citizenEvidence(['Será que fui cobrado?']).collection, 'unknown');
  assert.equal(citizenEvidence(['Você disse que houve cobrança. Eu não informei isso.']).collection, 'unknown');
});

test('PIX não transforma todo assunto bancário em caso bloqueado; cobrança concreta e teoria continuam possíveis', () => {
  assert.equal(check('Você pode contestar a cobrança e guardar o protocolo.', 'Art. 42', 'Não fiz PIX. Recebi uma cobrança indevida no cartão.').passed, true);
  assert.equal(check('Se houve cobrança indevida e pagamento excessivo, pode haver repetição em dobro, salvo engano justificável.', 'Art. 42', 'Em geral, explique o Art. 42 e a diferença para PIX.').passed, true);
  assert.equal(check('O banco deve devolver seu PIX em dobro.', 'Art. 42', 'Transferi para uma chave errada, sem cobrança.').passed, false);
});

test('perguntas e encaminhamentos também rejeitam fundamento ausente e cálculo não verificado', () => {
  assert.equal(check('Pelo Art. 999, seu prazo venceu. Procure atendimento.', null, '', 'redirecionamento').passed, false);
  assert.equal(check('Seu prazo já terminou; você quer agendar?', null, '', 'clarificacao').passed, false);
  assert.equal(check('Em que data o defeito ficou evidente?', null, '', 'clarificacao').passed, true);
});

test('a pergunta do próprio classificador passa pela barreira antes da busca', async () => {
  const result = await createRagService({ db: { chatLog: { findMany: async () => [] } } as any,
    classify: async () => ({ categoria: 'AMBIGUO', motivo: 'Fixture', perguntaEsclarecimento: 'Seu prazo já venceu; quando comprou?' }),
    embed: async () => { assert.fail('A busca não deve ser chamada.'); },
  })('Tenho um problema.', 'fixture', { includeDiagnostics: true });
  assert.equal(result.tipoResposta, 'clarificacao');
  assert.ok(!result.texto.includes('venceu'));
  assert.ok(result.diagnostics?.segurancaJuridica?.reasons.length);
});

test('texto oficial com prazo conserva integralmente a fonte sem chamada extra ao modelo', async () => {
  let calls = 0;
  const rewrite = createOrientationService(async () => { calls++; return 'Texto alterado'; });
  const original = 'A contagem do prazo depende da identificação do marco legal aplicável.';
  assert.equal(await rewrite('Dúvidas', original), original);
  assert.equal(calls, 0);
});

test('a ressalva precisa ter o sentido correto, não apenas estar presente no texto', () => {
  assert.equal(check('Você pode receber em dobro, caso haja engano justificável.', 'Art. 42', 'Paguei uma cobrança indevida.').passed, false);
  assert.equal(check('Se houve cobrança e pagamento excessivo, pode haver repetição em dobro, salvo engano justificável.', 'Art. 42', 'Explique a regra em geral.').passed, true);
});

test('restituição individual não presume pagamento desconhecido; orientação de contestação permanece possível', () => {
  assert.equal(check('Você tem direito à repetição do indébito, recebendo o valor que pagou indevidamente.', 'Art. 42', 'Apareceu uma cobrança depois do cancelamento.').passed, false);
  assert.equal(check('Você pode contestar a cobrança e guardar o protocolo.', 'Art. 42', 'Apareceu uma cobrança depois do cancelamento.').passed, true);
});

test('não oculto explícito permite explicar a hipótese aparente sem inventar outra', () => {
  assert.equal(check('Para vícios aparentes em bens duráveis, o prazo é de 90 dias desde a entrega.', 'Art. 26', 'O espelho chegou rachado, visível no recebimento. Não é defeito oculto.').passed, true);
});

test('tipo não final não serve para enviar prazo quantificado sem validar orientação', () => {
  assert.equal(check('Já que a loja tem quarenta e oito horas para reparar, quando você entregou?', null, '', 'clarificacao').passed, false);
  assert.equal(check('Você tem dois anos para reclamar. Procure o atendimento.', null, '', 'redirecionamento').passed, false);
});

test('negação sobre outra ação não apaga cobrança ou pagamento expressamente declarados', () => {
  const evidence = citizenEvidence(['Recebi uma cobrança indevida, mas não reconheci a origem.', 'Paguei a fatura, mas a empresa não deu baixa.']);
  assert.equal(evidence.collection, 'reported'); assert.equal(evidence.payment, 'reported');
});

test('contradição explícita de escopo veta orientação sem alterar a categoria do classificador', () => {
  assert.equal(check('Você pode usar o CDC para exigir troca.', 'Art. 18', 'Comprei uma bicicleta de um vizinho que não vende nada profissionalmente.').scopeVeto, 'private');
  assert.equal(check('Conteste como cobrança indevida de consumo.', 'Art. 42', 'Recebi uma cobrança de IPTU da prefeitura.').scopeVeto, 'tax');
  assert.equal(check('O contrato é abusivo pelo CDC.', 'Art. 25', 'Aluguel de imóvel: o dono não devolveu meu depósito.').scopeVeto, 'lease');
  assert.equal(check('Você pode reclamar do serviço malfeito.', 'Art. 20', 'A oficina cobrou pelo serviço com ISS na nota e o serviço ficou malfeito.').scopeVeto, null);
  assert.equal(check('Você pode reclamar do serviço.', 'Art. 20', 'Meu vizinho atua profissionalmente como técnico e o serviço ficou malfeito.').scopeVeto, null);
});

test('veto de escopo usa resposta oficial e conserva diagnóstico do classificador', async () => {
  const source = articles.find(article => article.title.startsWith('Art. 42 -'))!;
  const run = createRagService({ db: { chatLog: { findMany: async () => [] } } as any,
    classify: async () => ({ categoria: 'CONSUMO', motivo: 'Erro de triagem simulado' }),
    embed: async () => [0.1], vectors: async () => [{ id: 'source', distance: 0.1 }],
    articles: async () => [{ ...source, id: 'source', keywords: [], distincao: null }],
    generate: async () => JSON.stringify({ tipoResposta: 'orientacao_final', artigo: 'Art. 42', texto: 'Conteste a cobrança como relação de consumo.' }),
  });
  const result = await run('Recebi uma cobrança de IPTU da prefeitura.', 'fiction', { includeDiagnostics: true });
  assert.equal(result.tipoResposta, 'fixa'); assert.equal(result.artigo, null);
  assert.deepEqual(result.acoes, ['menu']);
  assert.equal(result.diagnostics?.classificacaoUsada.categoria, 'CONSUMO', 'não esconder erro de categoria no benchmark');
  assert.ok(result.texto.includes('órgão'));
});

test('duração com numeral explicativo usa a mesma quantidade, sem aceitar anotação contraditória', () => {
  assert.equal(check('Notifique a administradora do cartão com antecedência de pelo menos 10 dias da data de vencimento da fatura.', 'Art. 54-G').passed, true);
  assert.equal(check('O prazo é de 10 (quinze) dias.', 'Art. 54-G').passed, false);
  assert.equal(check('O prazo é de 1.5 anos.', 'Art. 27').passed, false);
});

test('prazo complementar precisa estar em fonte recuperada e preservar dano e autoria', () => {
  const correct = 'O prazo para buscar reparação é de cinco anos a partir do momento em que você souber do dano e quem o causou.';
  assert.equal(check(correct, 'Art. 12', 'O produto explodiu e me feriu.').passed, true);
  assert.equal(inspectLegalSafety({ text: correct, article: 'Art. 12', kind: 'orientacao_final', citizenMessages: ['O produto explodiu e me feriu.'], sources: sources.filter(source => source.reference !== 'Art. 27') }).passed, false);
  assert.equal(check(correct.replace('do dano', 'do defeito'), 'Art. 12').passed, false);
});

test('quantidades de artigos distintos respeitam a fonte citada em cada afirmação', () => {
  const correct = 'O Art. 18 trata de até 30 dias para sanar o vício. O Art. 26 prevê 90 dias para reclamar de vícios aparentes em bens duráveis, desde a entrega.';
  assert.equal(check(correct, 'Art. 26').passed, true);
  assert.equal(check(correct.replace('até 30 dias', 'até 90 dias'), 'Art. 26').passed, false);
});

test('negação de automatismo não é interpretada como promessa de restituição', () => {
  assert.equal(check('A restituição em dobro não é automática e depende das condições legais, salvo engano justificável.', 'Art. 42', 'Explique a regra em geral.').passed, true);
});

test('reescrita financeira não inverte ressalva mesmo conservando palavras e referência', async () => {
  const original = 'Pode haver devolução em dobro, salvo engano justificável. Art. 42.';
  const changed = 'Pode haver dobro se há engano justificável, salvo revisão. Art.42.';
  assert.equal(await createOrientationService(async () => changed)('Cobrança', original), original);
});

test('marco em linguagem cotidiana é reconhecido sem promover diagnóstico categórico do modelo', () => {
  assert.equal(check('Se for caracterizado vício oculto em produto durável, o prazo é de 90 dias a partir de quando você percebeu o defeito.', 'Art. 26', 'O defeito só apareceu ontem.').passed, true);
  const decision = check('Se apareceu depois, trata-se de um vício oculto. Para produto durável, o prazo é de 90 dias a partir de quando você percebeu o defeito.', 'Art. 26', 'O defeito só apareceu ontem.');
  assert.ok(decision.reasons.includes('enquadramento_vicio_oculto_nao_confirmado'));
  assert.ok(!decision.reasons.includes('marco_vicio_oculto_omitido'));
});
