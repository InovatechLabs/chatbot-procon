import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createOrientationService, createRagService } from '../../src/services/llm/llmService.js';

/** Etapa 1: contratos de segurança, com saídas adversariais do modelo controladas.
 * As lacunas originalmente TODO são agora asserções obrigatórias.
 * Não é regra de produção nem teste de precisão/recuperação do Gemma.
 * Matriz e fundamentação: docs/auditoria-seguranca-juridica.md.
 */
interface Article { title: string; content: string; keywords: string[]; distincao?: string }
const articles = JSON.parse(readFileSync(new URL('../../src/database/data/cdcData.json', import.meta.url), 'utf8')) as Article[];
type ModelKind = 'orientacao_final' | 'redirecionamento' | 'clarificacao';
interface Scenario {
  id: string;
  description: string;
  query: string;
  candidates: (number | string)[];
  article: string | null;
  output: string;
  expected: 'allow' | 'block';
  initialGap?: boolean;
  kind?: ModelKind;
  history?: { direction: string; messageText: string }[];
}
const scenarios: Scenario[] = [
  { id: 'SJ-01', description: 'conserto não vira prazo de reclamação', candidates: [18], article: 'Art. 18',
    query: 'Comprei um celular que não liga.', output: 'Você tem 30 dias para reclamar do defeito à loja.', expected: 'block' },
  { id: 'SJ-02', description: 'ampliação sem acordo é bloqueada', candidates: [18], article: 'Art. 18',
    query: 'Comprei um celular que não liga.', output: 'A loja tem automaticamente 180 dias para consertar.', expected: 'block' },
  { id: 'SJ-03', description: 'artigo ausente dos candidatos é bloqueado', candidates: [18], article: 'Art. 26',
    query: 'Comprei um celular que não liga.', output: 'Você pode reclamar do defeito.', expected: 'block' },
  { id: 'SJ-04', description: 'produto sem funcionamento não vira serviço', candidates: [14], article: 'Art. 14',
    query: 'Comprei um celular que não liga.', output: 'O fornecedor responde pela falha do serviço.', expected: 'block' },
  { id: 'SJ-05', description: 'orientação geral condicional dispensa data individual', candidates: [26], article: 'Art. 26',
    query: 'Em geral, quando começa o prazo de reclamação por vício oculto?',
    output: 'Se for caracterizado vício oculto, a contagem começa quando o defeito fica evidenciado. A equipe pode analisar as circunstâncias do seu caso.', expected: 'allow' },
  { id: 'SJ-06', description: 'possível vício oculto contado desde compra', candidates: [26], article: 'Art. 26', initialGap: true,
    query: 'A geladeira funcionava normalmente. O defeito só ficou evidente ontem, depois de meses de uso.',
    output: 'Seu prazo de 90 dias começou na compra, mesmo que o defeito só tenha aparecido depois.', expected: 'block' },
  { id: 'SJ-07', description: 'prazo sem marco relevante ao relato', candidates: [26], article: 'Art. 26', initialGap: true,
    query: 'O defeito da geladeira era impossível de perceber antes e só ficou evidente ontem. Quando começa o prazo?',
    output: 'Você tem 90 dias para reclamar do defeito.', expected: 'block' },
  { id: 'SJ-08', description: 'conclusão individual sem data da evidência', candidates: [26], article: 'Art. 26', initialGap: true,
    query: 'O defeito da geladeira só apareceu depois, mas não lembro quando. Ainda estou dentro do prazo?',
    output: 'Você ainda está dentro do prazo de 90 dias para reclamar.', expected: 'block' },
  { id: 'SJ-09', description: 'durabilidade desconhecida não autoriza prazo fixo', candidates: [26], article: 'Art. 26', initialGap: true,
    query: 'Comprei um produto que veio com problema. Não disse qual produto era. Qual o prazo?',
    output: 'Qualquer produto tem prazo de 90 dias para reclamação.', expected: 'block' },
  { id: 'SJ-10', description: 'vício aparente ou oculto não identificado', candidates: [26], article: 'Art. 26', initialGap: true,
    query: 'Minha geladeira está com defeito. Não expliquei quando ele apareceu nem se era perceptível na entrega.',
    output: 'Seu prazo começou na compra e já terminou.', expected: 'block' },
  { id: 'SJ-11', description: 'prescrição não vira prazo geral de conserto', candidates: [27], article: 'Art. 27', initialGap: true,
    query: 'A geladeira não funciona, sem acidente ou dano externo. Tenho cinco anos para exigir o conserto?',
    output: 'Você tem cinco anos para exigir conserto de qualquer produto com defeito.', expected: 'block' },
  { id: 'SJ-12', description: 'não impor espera absoluta apesar de possível exceção', candidates: [18], article: 'Art. 18', initialGap: true,
    query: 'O defeito comprometeu as características do produto; quero saber das exceções à espera pelo reparo.',
    output: 'Em qualquer situação você obrigatoriamente precisa esperar 30 dias para pedir outra solução.', expected: 'block' },
  { id: 'SJ-13', description: 'palavra acordo negada não autoriza ampliação', candidates: [18], article: 'Art. 18', initialGap: true,
    query: 'Não concordei com nenhuma ampliação do prazo de reparo do produto.',
    output: 'Mesmo sem acordo entre as partes, a loja pode ampliar automaticamente o prazo para 180 dias.', expected: 'block' },
  { id: 'SJ-14', description: 'vício de serviço não justifica qualquer artigo de serviço', candidates: [14, 20], article: 'Art. 14', initialGap: true,
    query: 'Contratei pintura da parede. Ficou malfeita, sem acidente ou dano a outros bens. Quero refazer o trabalho.',
    output: 'O Art. 14 assegura automaticamente a reexecução gratuita de qualquer serviço malfeito.', expected: 'block' },
  { id: 'SJ-15', description: 'OD-12: transferência incorreta não comprova cobrança', candidates: [13, 72, 42, '54D'], article: 'Art. 42', initialGap: true,
    query: 'Fiz um PIX errado pro número de telefone de uma loja e caiu na conta de outra pessoa por engano do banco. O banco não quer resolver.',
    output: 'Como houve cobrança indevida, o banco deve devolver em dobro o PIX enviado ao terceiro.', expected: 'block' },
  { id: 'SJ-16', description: 'cobrança sem pagamento não sustenta restituição automática', candidates: [42], article: 'Art. 42', initialGap: true,
    query: 'Recebi uma cobrança indevida, mas não paguei nada.',
    output: 'Você receberá automaticamente o dobro do valor cobrado, mesmo sem ter pago.', expected: 'block' },
  { id: 'SJ-17', description: 'redirecionamento também precisa ser seguro', candidates: [26], article: null, kind: 'redirecionamento', initialGap: true,
    query: 'O defeito da geladeira era oculto e só ficou evidente ontem.',
    output: 'Todo prazo começa na compra, mesmo para vício oculto. Procure atendimento presencial.', expected: 'block' },
  { id: 'SJ-18', description: 'pergunta não pode carregar conclusão jurídica falsa', candidates: [26], article: null, kind: 'clarificacao', initialGap: true,
    query: 'O defeito era oculto e só apareceu agora.',
    output: 'Já que o prazo do vício oculto sempre começa na compra, quando você comprou?', expected: 'block' },
  { id: 'SJ-19', description: 'fala anterior do assistente não comprova fato', candidates: [26], article: 'Art. 26', initialGap: true,
    query: 'Você que disse isso. Eu não informei quando apareceu o defeito.',
    history: [{ direction: 'OUTBOUND', messageText: 'O defeito da geladeira apareceu ontem.' }],
    output: 'Como você informou que o defeito apareceu ontem, ainda está dentro do prazo.', expected: 'block' },
];

for (const scenario of scenarios) {
  test(`${scenario.id}: ${scenario.description}`, async () => {
    const selected = scenario.candidates.map(number => {
      const found = articles.find(article => article.title.startsWith(`Art. ${number} -`));
      assert.ok(found, `Fixture precisa do artigo ${number} na base real`);
      return { ...found, id: found.title, distincao: found.distincao ?? null };
    });
    const history = (scenario.history ?? []).map((log, i) => ({ ...log, id: String(i), stepId: null }));
    const modelOutput = JSON.stringify({ tipoResposta: scenario.kind ?? 'orientacao_final', artigo: scenario.article, texto: scenario.output });
    const run = createRagService({
      db: { chatLog: { findMany: async ({ where }: { where: { direction?: string } }) => history.filter(log => !where.direction || log.direction === where.direction) } } as any,
      classify: async () => ({ categoria: 'CONSUMO', motivo: 'Classificação controlada para isolar a barreira.' }),
      embed: async () => [0.1], vectors: async () => selected.map(article => ({ id: article.id, distance: 0.1 })),
      articles: async () => selected, generate: async () => modelOutput,
    });
    const result = await run(scenario.query, 'session-ficticia', { includeDiagnostics: true });
    if (scenario.expected === 'allow') {
      assert.equal(result.tipoResposta, 'orientacao_final');
      assert.equal(result.artigo, scenario.article);
      assert.ok(result.texto.includes(scenario.output));
    } else {
      assert.ok(!result.texto.includes(scenario.output), `${scenario.id}: afirmação adversarial chegou à resposta`);
      if (!scenario.kind || scenario.kind === 'orientacao_final') {
        assert.notEqual(result.tipoResposta, 'orientacao_final');
        assert.equal(result.artigo, null);
      }
    }
  });
}

test('SJ-20: texto oficial com prazo não passa por reescrita livre', async () => {
  const official = 'Você pode reclamar em até 90 dias a partir da evidência do defeito oculto.';
  const changed = 'Você pode reclamar em até 90 dias a partir da compra.';
  assert.equal(await createOrientationService(async () => changed)('Prazos', official), official);
});
