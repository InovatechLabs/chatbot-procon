import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, isGreeting, isThanks, isCrisis, isHumanRequest, isLogistics, isScheduleChange, querSair } from '../../src/utils/intents/intents.js';
import { charLength, splitMessage, maskCpf, POST_ANSWER_OPTIONS } from '../../src/services/whatsapp/messagePolicy.js';
import { isSafeRewrite } from '../../src/services/llm/helpers/rewriteGuard.js';
import { buildMenuPath } from '../../src/services/whatsapp/menuPath.js';
import { buildMenu } from '../../prisma/seed/seed.js';

test('saudações e agradecimentos não engolem relatos nem perguntas', () => {
  for (const value of ['Bom dia!', 'oii', 'Boa tarde, tudo bem?']) assert.ok(isGreeting(normalize(value)), value);
  assert.equal(isGreeting(normalize('Oi, comprei um celular com defeito')), false);
  for (const value of ['obrigada', 'ok', 'Deus abençoe', '👍']) assert.ok(isThanks(value, normalize(value)), value);
  for (const value of ['ok, mas e o prazo?', 'obrigada, mas paguei', 'ok, e agora?']) assert.equal(isThanks(value, normalize(value)), false, value);
});

test('risco pessoal exige intenção e não expressões de raiva ou negações', () => {
  assert.ok(isCrisis(normalize('Vou me matar por causa das dívidas')));
  assert.ok(isCrisis(normalize('quero morrer')));
  assert.equal(isCrisis(normalize('esses golpistas vão me matar de raiva')), false);
  assert.equal(isCrisis(normalize('não quero me matar, quero resolver a dívida')), false);
});

test('pedido de pessoa, logística e mudança de agendamento não são nome', () => {
  assert.ok(isHumanRequest(normalize('Quero falar com atendente')));
  assert.ok(querSair(normalize('não tenho CPF'), 'não tenho CPF'));
  assert.ok(isLogistics(normalize('onde fica?')));
  assert.ok(isLogistics(normalize('qual o telefone do procon?')));
  assert.ok(isScheduleChange(normalize('preciso remarcar meu horário')));
  assert.equal(isScheduleChange(normalize('quero cancelar meu plano de telefone')), false);
});

test('mensagens longas preservam todo o conteúdo e caracteres Unicode', () => {
  const text = ('📅 Texto oficial com informações.\n').repeat(100);
  const parts = splitMessage(text);
  assert.ok(parts.length > 1);
  assert.ok(parts.every(part => charLength(part) <= 1024 && !part.includes('\ufffd')));
  assert.equal(parts.join(' ').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert.equal(maskCpf('123.456.789-00'), '***.456.789-**');
  assert.ok(POST_ANSWER_OPTIONS.every(option => charLength(option.text) <= 20));
});

test('reescrita rejeita prazo, artigo, percentual, valor ou ressalva alterados', () => {
  const official = 'Você pode reclamar em até 30 dias, conforme Art. 26. O PROCON avalia cada caso.';
  assert.ok(isSafeRewrite(official, official));
  assert.equal(isSafeRewrite(official, official.replace('30', '90')), false);
  assert.equal(isSafeRewrite(official, official.replace('26', '42')), false);
  assert.equal(isSafeRewrite(official, official.replace('até ', '')), false);
  assert.equal(isSafeRewrite(official, 'Entendi que você tem uma dúvida.'), false);
  assert.equal(isSafeRewrite('Até 30 dias ou 2 meses.', 'Até 2 dias ou 30 meses.'), false);
  assert.equal(isSafeRewrite('Pode pagar R$ 20,00 e 10%.', 'Pode pagar R$ 10,00 e 20%.'), false);
});

test('caminho do menu usa o percurso real do submenu compartilhado', () => {
  const edges = [
    { stepId: 'root', nextStepId: 'rights', text: 'Entender um direito' },
    { stepId: 'rights', nextStepId: 'contracts', text: 'Contratos' },
    { stepId: 'contracts', nextStepId: 'refund', text: 'Desisti da compra' },
    { stepId: 'rights', nextStepId: 'refund', text: 'Arrependimento' },
    { stepId: 'refund', nextStepId: 'answer', text: 'Quem paga o frete?' },
  ];
  const logs = [edges[4]!, edges[2]!, edges[1]!, edges[0]!].map(edge => ({ stepId: edge.stepId, messageText: edge.text }));
  assert.equal(buildMenuPath(edges[4]!, logs, edges), 'Entender um direito > Contratos > Desisti da compra > Quem paga o frete?');
});

test('menu inicial: limites da Meta, saída da garantia e nenhuma resposta perdida', async () => {
  const first = await buildMenu();
  const second = await buildMenu();
  assert.deepEqual(first, second, 'IDs estáveis entre execuções');
  assert.equal(new Set(first.options.map(option => option.id)).size, first.options.length);
  for (const step of first.steps) {
    const options = first.options.filter(option => option.stepId === step.id);
    assert.ok(charLength(step.message) <= 1024, step.title);
    assert.equal((step.message.match(/\*/g)?.length ?? 0) % 2, 0, `Asteriscos: ${step.title}`);
    assert.ok(options.length <= 10, step.title);
    assert.ok(options.every(option => charLength(option.text) <= (options.length <= 3 ? 20 : 24)), step.title);
    if (options.length && !step.isStart) assert.ok(options.some(option => /voltar|menu principal/i.test(option.text)), step.title);
    if (!options.length) assert.ok(first.options.some(option => option.nextStepId === step.id), `Resposta inacessível: ${step.title}`);
  }
  const hidden = first.steps.find(step => step.id === 'faq-18')!;
  assert.match(hidden.message, /30 dias/);
  assert.match(hidden.message, /90 dias/);
});
