import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationHandler } from '../../src/controllers/webhook/conversation.js';
import { decodeSession } from '../../src/services/conversation/state.js';
import { getNextBusinessDays } from '../../src/utils/validators/index.js';
import { createRagService } from '../../src/services/llm/llmService.js';
import { parseClassification } from '../../src/services/llm/helpers/classifyReport.js';

function fixture(state: Record<string, unknown> = {}) {
  let session: any = { id: 'session', phoneNumber: '5512999999999', status: 'OPEN', isChat: false, currentStepId: null, stepState: null, userName: null, userCpf: null, updatedAt: new Date(), ...state };
  const sent: { text: string; options: any[] }[] = [];
  const logs: any[] = [];
  const feedback: any[] = [];
  const events: any[] = [];
  let aiCalls = 0, bookings = 0, documents = 0;
  const root = { id: 'root', message: 'Escolha uma opção', options: [{ id: 'rights', stepId: 'root', text: 'Entender um direito', nextStepId: 'answer' }], isStart: true };
  const steps: any[] = [root, { id: 'answer', message: 'Resposta oficial', title: 'Questao 1', options: [] }];
  const options: any[] = [...root.options];
  const db: any = {
    conversationEvent: { createMany: async ({ data }: any) => { for (const item of data) if (!events.some(event => event.dedupKey === item.dedupKey)) events.push(item); } },
    $transaction: async (work: any) => {
      const before = structuredClone({ session, feedback });
      try { return await work(db); }
      catch (error) { session = before.session; feedback.splice(0, feedback.length, ...before.feedback); throw error; }
    },
    userSession: {
      findFirst: async () => session.status === 'OPEN' ? { ...session } : null,
      findUnique: async () => ({ ...session }),
      findUniqueOrThrow: async () => ({ ...session }),
      update: async ({ data }: any) => { session = { ...session, ...data }; return { ...session }; },
      create: async ({ data }: any) => { session = { ...session, ...data, stepState: null }; return { ...session }; },
    },
    step: { findFirst: async () => root, findUnique: async ({ where }: any) => steps.find(step => step.id === where.id) },
    option: {
      findUnique: async ({ where }: any) => options.find(option => option.id === where.id),
      findMany: async (q: any) => options.filter(option => !q?.where?.stepId || option.stepId === q.where.stepId),
    },
    chatLog: {
      create: async ({ data }: any) => { const row = { id: String(logs.length), timestamp: new Date(), ...data }; logs.push(row); return row; },
      findMany: async (q: any) => logs.filter(log => (!q.where.direction || log.direction === q.where.direction) && (!q.where.stepId || log.stepId)).reverse().slice(0, q.take),
    },
    sessionFeedback: {
      create: async ({ data }: any) => { feedback.push({ id: 'feedback', ...data }); return feedback.at(-1); },
      findFirst: async () => feedback.at(-1),
      update: async ({ data }: any) => Object.assign(feedback.at(-1), data),
    },
  };
  const overrides: any = {
    dates: async () => getNextBusinessDays(15),
    db, text: async (_: string, text: string) => { sent.push({ text, options: [] }); },
    interactive: async (_: string, text: string, options: any[]) => { sent.push({ text, options }); },
    list: async (_: string, _title: string, text: string, _button: string, sections: any[]) => { sent.push({ text, options: sections.flatMap(section => section.rows) }); },
    answer: async () => { aiCalls++; return { tipoResposta: 'orientacao_final', texto: 'Orientação da IA', artigo: null }; },
    rewrite: async () => 'Resposta simplificada enviada', pending: async () => null,
    slots: async (date: string) => Array.from({ length: 16 }, (_, i) => ({ time: `${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, dateTimeIso: `${date}T${String(12 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00.000Z` })),
    book: async (data: any) => { bookings++; return { ...data, scheduledAt: new Date(data.scheduledAtIso), categoryName: 'Geral', documentGuide: null }; },
    documents: async () => { documents++; }, document: async () => {},
  };
  const handle = createConversationHandler(overrides);
  let id = 0;
  const text = (body: string) => handle({ id: String(++id), from: session.phoneNumber, type: 'text', text: { body } });
  const click = (selected: string) => handle({ id: String(++id), from: session.phoneNumber, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: selected } } });
  return { text, click, handle, sent, logs, feedback, steps, options, overrides,
    session: () => session, aiCalls: () => aiCalls, bookings: () => bookings, documents: () => documents };
}

test('agendamento reconhecido pelo classificador consulta pendência sem busca jurídica ou nova reserva', async () => {
  for (const phrase of ['quero agendar um atendimento', 'eu gostaria de agendar um atendimento']) {
    const f = fixture();
    let classifications = 0;
    f.overrides.pending = async () => ({ scheduledAt: new Date('2027-01-18T14:00:00-03:00') });
    f.overrides.answer = createRagService({ db: f.overrides.db,
      classify: async (question) => { classifications++; assert.equal(question, phrase); return parseClassification({ categoria: 'AGENDAMENTO', motivo: 'Pede para marcar atendimento' }); },
      embed: async () => { assert.fail('Agendamento não deve gerar embeddings'); },
      generate: async () => { assert.fail('Agendamento não deve gerar orientação jurídica'); },
    });
    const handle = createConversationHandler(f.overrides);
    await handle({ id: phrase, from: '5512999999999', type: 'text', text: { body: phrase } });
    assert.ok(f.sent.at(-1)!.text.includes('Você já tem um atendimento marcado'));
    assert.ok(f.sent.at(-1)!.text.includes('18/01/2027'));
    assert.ok(!f.sent.at(-1)!.options.some(option => option.id === 'btn_agendar_sim'));
    assert.equal(classifications, 1); assert.equal(f.bookings(), 0);
  }
});

test('pedido de agendamento oferece confirmação sem pendência e preserva coleta iniciada', async () => {
  const f = fixture();
  let classifications = 0;
  const handle = createConversationHandler({ ...f.overrides, answer: createRagService({ db: f.overrides.db,
    classify: async () => { classifications++; return parseClassification({ categoria: 'AGENDAMENTO', motivo: 'Pede atendimento' }); },
    embed: async () => { assert.fail('Agendamento não deve gerar embeddings'); },
    generate: async () => { assert.fail('Agendamento não deve gerar orientação jurídica'); },
  }) });
  const send = () => handle({ id: String(f.logs.length), from: '5512999999999', type: 'text', text: { body: 'eu gostaria de agendar um atendimento' } });
  await send();
  assert.equal(decodeSession(f.session()).snapshot.state.kind, 'SCHEDULE_OFFER');
  assert.ok(f.sent.at(-1)!.options.some(option => option.id === 'btn_agendar_sim'));
  await f.click('btn_agendar_sim');
  const before = f.session().stepState;
  await send();
  assert.equal(f.session().stepState, before);
  assert.ok(f.sent.at(-1)!.text.includes('agendamento'));
  assert.equal(classifications, 1); assert.equal(f.bookings(), 0);
});

test('resposta do menu mantém saídas, histórico real e follow-up contextualizado', async () => {
  const f = fixture({ currentStepId: 'root', isChat: true });
  await f.click('rights');
  assert.equal(f.session().isChat, false);
  assert.deepEqual(f.sent.at(-1)!.options.map(option => option.id), ['btn_feedback_sim', 'btn_go_menu', 'btn_agendar_sim']);
  assert.ok(f.logs.some(log => log.direction === 'OUTBOUND' && log.messageText === 'Resposta simplificada enviada'));
  await f.text('e se eu já paguei?');
  assert.equal(f.aiCalls(), 1);
  assert.ok(f.logs.some(log => log.messageText === 'Entender um direito'));
});

test('uma resposta da IA desatualizada não chega ao cidadão quando há complemento pendente', async () => {
  const f = fixture();
  const handle = createConversationHandler({ ...f.overrides, answer: async () => ({ tipoResposta: 'clarificacao', texto: 'Qual foi o problema com o celular?', artigo: null }) });
  await handle({ id: 'parte-1', from: '5512999999999', type: 'text', text: { body: 'Comprei um celular numa loja.' } }, async () => true);
  assert.ok(f.sent.every(message => !message.text.includes('Qual foi o problema')));
  assert.ok(f.logs.some(log => log.direction === 'INBOUND' && log.messageText === 'Comprei um celular numa loja.'));
  assert.ok(f.logs.every(log => log.direction !== 'OUTBOUND' || !log.messageText.includes('Qual foi o problema')));
  assertState(f, null);
});

test('duas perguntas sem prefixo persistem entre handlers; contato não zera o limite', async () => {
  const f = fixture();
  const counts: number[] = [];
  let round = 0;
  const overrides: any = { ...f.overrides, answer: async (_: string, _id: string, options: any) => {
    counts.push(options.clarificationCount);
    return { tipoResposta: 'clarificacao', texto: ['Qual serviço foi contratado?', 'O que deu errado?', 'Pergunta excedente?'][round++], artigo: null };
  } };
  const send = (handler: ReturnType<typeof createConversationHandler>, body: string) => handler({ id: String(round), from: '5512999999999', type: 'text', text: { body } });
  await send(createConversationHandler(overrides), 'Tive um problema.');
  assertState(f, 'AI_CLARIFY:1');
  assert.equal(f.sent.at(-1)!.text, 'Qual serviço foi contratado?\n\nPara voltar às opções, digite *menu*.');
  await send(createConversationHandler(overrides), 'Onde fica?');
  assertState(f, 'AI_CLARIFY:1');
  await send(createConversationHandler(overrides), 'Foi um contrato.');
  assertState(f, 'AI_CLARIFY:2');
  await send(createConversationHandler(overrides), 'Não sei explicar.');
  assert.deepEqual(counts, [0, 1, 2]);
  assertState(f, 'AWAIT_AGENDAR');
  assert.match(f.sent.at(-1)!.text, /equipe pode ouvir e analisar/);
  assert.ok(f.sent.every(message => !message.text.includes('Pergunta excedente')));
});

test('depois de duas perguntas ainda aceita orientação; menu reinicia o contador', async () => {
  const f = fixture({ isChat: true, stepState: 'AI_CLARIFY:2' });
  const answered = createConversationHandler({ ...f.overrides, answer: async () => ({ tipoResposta: 'orientacao_final', texto: 'Orientação com os detalhes suficientes.', artigo: null }) });
  await answered({ id: 'complete', from: '5512999999999', type: 'text', text: { body: 'A loja entregou um produto diferente do anúncio.' } });
  assertState(f, 'POST_ANSWER');
  const counts: number[] = [];
  const handler = createConversationHandler({ ...f.overrides, answer: async (_: string, _id: string, options: any) => {
    counts.push(options.clarificationCount);
    return { tipoResposta: 'clarificacao', texto: 'Qual serviço?', artigo: null };
  } });
  await handler({ id: 'new', from: '5512999999999', type: 'text', text: { body: 'Tenho outra dúvida sobre um serviço.' } });
  assertState(f, 'AI_CLARIFY:1');
  await handler({ id: 'menu', from: '5512999999999', type: 'text', text: { body: 'menu' } });
  assertState(f, null);
  await handler({ id: 'again', from: '5512999999999', type: 'text', text: { body: 'Tive um problema com um contrato.' } });
  assert.deepEqual(counts, [0, 0]);
  assertState(f, 'AI_CLARIFY:1');
});

test('número e rótulo do menu equivalem ao botão', async () => {
  for (const input of ['1', 'Entender um direito']) {
    const f = fixture({ currentStepId: 'root' });
    await f.text(input);
    assert.equal(f.aiCalls(), 0);
    assert.equal(f.sent.at(-1)!.text, 'Resposta simplificada enviada');
  }
});

test('rótulo pós-resposta também funciona por texto', async () => {
  const f = fixture({ currentStepId: 'root' });
  await f.click('rights');
  await f.text('Agendar atendimento');
  assertState(f, 'SCH_STEP_CAT_SELECT');
  assert.equal(f.aiCalls(), 0);
});

test('Documentos gerais com destino mostra a resposta, sem interceptação por doc', async () => {
  const f = fixture({ currentStepId: 'root' });
  f.options[0]!.text = 'Documentos gerais';
  await f.click('rights');
  assert.equal(f.documents(), 0);
  assert.equal(f.sent.at(-1)!.text, 'Resposta simplificada enviada');
});

test('botão inexistente ou de outro submenu sempre recupera o menu', async () => {
  for (const id of ['apagado', 'rights']) {
    const f = fixture({ currentStepId: 'outro' });
    await f.click(id);
    assert.match(f.sent[0]!.text, /conversa antiga/);
    assert.equal(f.session().currentStepId, 'root');
  }
});

test('recusa de agendamento não encerra nem força avaliação', async () => {
  const f = fixture({ stepState: 'AWAIT_AGENDAR' });
  await f.text('não, obrigado');
  assertState(f, null);
  assert.equal(f.session().status, 'OPEN');
  assert.ok(f.sent.at(-1)!.options.some(option => option.id === 'btn_go_menu'));
  assert.equal(f.feedback.length, 0);
});

test('pedido de humano não vira nome e logística preserva agendamento em andamento', async () => {
  const f = fixture({ stepState: 'SCH_STEP_NAME:GERAL' });
  await f.text('Quero falar com atendente');
  assert.equal(f.session().userName, null);
  assertState(f, 'SCH_STEP_NAME:GERAL');
  assert.equal(f.aiCalls(), 0);
  assert.ok(f.sent.some(message => message.text.includes('3955-9130')));
});

test('nome é confirmado antes de pedir CPF, e CPF não entra no chatLog', async () => {
  const f = fixture({ stepState: 'SCH_STEP_NAME:GERAL' });
  await f.text('Maria da Silva');
  assertState(f, 'SCH_STEP_NAME_CONFIRM:GERAL');
  await f.text('sim');
  assertState(f, 'SCH_STEP_CPF:GERAL');
  await f.text('529.982.247-25');
  assertState(f, 'SCH_STEP_DATE:GERAL');
  assert.ok(f.logs.every(log => !log.messageText.includes('529.982.247-25')));
});

test('retomada após 30 minutos preserva o estado; CPF fora da coleta não vai à IA', async () => {
  const f = fixture({ stepState: 'SCH_STEP_CPF:GERAL', updatedAt: new Date(Date.now() - 60 * 60_000) });
  await f.text('52998224725');
  assert.match(f.sent[0]!.text, /continuar seu agendamento/);
  assertState(f, 'SCH_STEP_DATE:GERAL');
  const expired = fixture();
  await expired.text('52998224725');
  assert.equal(expired.aiCalls(), 0);
});

test('todos os horários são acessíveis por paginação e confirmação mascara CPF', async () => {
  const date = getNextBusinessDays(1)[0]!.dateStr;
  const f = fixture({ stepState: 'SCH_STEP_DATE:GERAL', userName: 'Maria da Silva', userCpf: '529.982.247-25' });
  await f.click(`btn_sch_date_${date}`);
  assert.ok(f.sent.at(-1)!.options.length <= 10);
  assert.ok(f.sent.at(-1)!.options.some(option => option.id === 'btn_sch_page_1'));
  await f.click('btn_sch_page_1');
  await f.click('btn_sch_page_2');
  const lastSlot = f.sent.at(-1)!.options.find(option => option.id.startsWith('btn_sch_slot_'))!;
  await f.click(lastSlot.id);
  assert.equal(f.bookings(), 1);
  assert.ok(f.sent.some(message => /\*\*\*\.982\.247-\*\*/.test(message.text)));
  assert.ok(f.sent.every(message => !message.text.includes('529.982.247-25')));
  await f.click(lastSlot.id);
  assert.equal(f.bookings(), 1, 'toque duplicado não reserva novamente');
});

test('agenda cheia termina com contato e não repete as mesmas datas', async () => {
  const f = fixture({ stepState: 'SCH_STEP_CPF:GERAL' });
  // Dependências são funções: altera o mock antes de criar a segunda instância.
  const handle = createConversationHandler({ ...f.overrides, slots: async () => [] });
  await handle({ id: 'cpf', from: '5512999999999', type: 'text', text: { body: '52998224725' } });
  assert.match(f.sent.at(-1)!.text, /Não encontrei vagas/);
  assertState(f, null);
});

test('logística durante escolha do horário mantém a vaga em seleção e aceita número', async () => {
  const date = getNextBusinessDays(1)[0]!.dateStr;
  const f = fixture({ stepState: 'SCH_STEP_DATE:GERAL', userName: 'Maria da Silva', userCpf: '529.982.247-25' });
  await f.click(`btn_sch_date_${date}`);
  await f.text('onde fica?');
  assert.equal(decodeSession(f.session()).snapshot.state.kind, 'SCHEDULE_SLOT');
  await f.text('1');
  assert.equal(f.bookings(), 1);
  assert.equal(f.aiCalls(), 0);
});

test('nota antiga não é duplicada e comentário só é solicitado por botão', async () => {
  const f = fixture({ stepState: 'AWAIT_RATING' });
  await f.click('btn_rate_1');
  assertState(f, null);
  assert.equal(f.feedback.length, 1);
  await f.click('btn_rate_1');
  assert.equal(f.feedback.length, 1);
  await f.text('Como faço para cancelar meu plano?');
  assert.equal(f.aiCalls(), 1);
  assert.equal(f.feedback[0]!.comment, undefined);
});

test('reação é ignorada; áudio recebe explicação; crise tem prioridade na coleta', async () => {
  const f = fixture({ stepState: 'SCH_STEP_NAME:GERAL' });
  await f.handle({ id: 'reaction', from: '5512999999999', type: 'reaction' });
  assert.equal(f.sent.length, 0);
  await f.handle({ id: 'audio', from: '5512999999999', type: 'audio' });
  assert.match(f.sent.at(-1)!.text, /ouvir áudios/);
  await f.text('quero morrer');
  assert.match(f.sent.at(-1)!.text, /CVV/);
  assert.equal(f.aiCalls(), 0);
  assert.equal(f.session().userName, null);
});

function assertState(f: { session: () => any }, legacy: string | null) {
  assert.deepEqual(decodeSession(f.session()).snapshot.state, decodeSession({ ...f.session(), stepState: legacy }).snapshot.state);
}

test('reiniciar handler a cada mensagem preserva nome, CPF, datas e paginação por número', async () => {
  const f = fixture();
  const send = async (value: string, button = false) => createConversationHandler(f.overrides)({ id: `restart-${f.logs.length}`, from: '5512999999999', type: button ? 'interactive' : 'text', ...(button ? { interactive: { type: 'button_reply', button_reply: { id: value } } } : { text: { body: value } }) });
  await send('btn_agendar_sim', true);
  await send('btn_sch_cat_GERAL', true);
  await send('Maria da Silva'); await send('sim'); await send('52998224725');
  assert.equal(decodeSession(f.session()).snapshot.state.kind, 'SCHEDULE_DATE');
  await send('não entendi as opções');
  await send('1');
  assert.equal(decodeSession(f.session()).snapshot.state.kind, 'SCHEDULE_SLOT');
  await send('btn_sch_page_1', true);
  await send('onde fica?');
  await send('1');
  assert.equal(f.bookings(), 1); assert.equal(f.aiCalls(), 0);
});

test('estado desconhecido ou de versão futura recupera menu sem IA nem reserva', async () => {
  for (const stepState of ['SCH_STEP_DATE:categoria-inexistente', JSON.stringify({ version: 99 })]) {
    const f = fixture({ stepState, userName: 'Nome preservado' });
    await f.text('1');
    assert.equal(decodeSession(f.session()).snapshot.state.kind, 'MENU');
    assert.equal(f.session().userName, 'Nome preservado');
    assert.equal(f.aiCalls(), 0); assert.equal(f.bookings(), 0);
    assert.match(f.sent[0]!.text, /retomar/);
  }
});

test('falha na gravação da avaliação reverte também a transição de estado', async () => {
  const f = fixture({ stepState: 'AWAIT_RATING' });
  const create = f.overrides.db.sessionFeedback.create;
  f.overrides.db.sessionFeedback.create = async () => { throw new Error('falha simulada'); };
  await assert.rejects(f.click('btn_rate_5'));
  assert.equal(decodeSession(f.session()).snapshot.state.kind, 'RATING'); assert.equal(f.feedback.length, 0);
  f.overrides.db.sessionFeedback.create = create;
  await f.click('btn_rate_5');
  assert.equal(f.feedback.length, 1);
  assert.equal(decodeSession(f.session()).snapshot.state.kind, 'READY');
});

test('legado sem opções persistidas reapresenta horários antes de aceitar número', async () => {
  const date = getNextBusinessDays(1)[0]!.dateStr;
  const f = fixture({ stepState: `SCH_STEP_SLOT:GERAL:${date}:0`, userName: 'Maria da Silva', userCpf: '52998224725' });
  await f.text('1'); assert.equal(f.bookings(), 0);
  assert.ok(decodeSession(f.session()).snapshot.choices.length > 0);
  await createConversationHandler(f.overrides)({ id: 'after-restart', from: '5512999999999', type: 'text', text: { body: '1' } });
  assert.equal(f.bookings(), 1);
});

test('botões antigos de avaliação, documentos e agendar não apagam coleta em andamento', async () => {
  const f = fixture({ stepState: 'SCH_STEP_NAME_CONFIRM:GERAL', userName: 'Nome preservado' });
  for (const id of ['btn_feedback_nao', 'btn_feedback_sim', 'btn_evaluate', 'btn_agendar_sim', 'btn_agendar_nao', 'doc_req_GERAL', 'btn_comment', 'btn_rate_1']) {
    await f.click(id);
    assert.equal(decodeSession(f.session()).snapshot.state.kind, 'SCHEDULE_NAME_CONFIRM');
    assert.equal(f.session().userName, 'Nome preservado');
  }
  assert.equal(f.feedback.length, 0); assert.equal(f.documents(), 0); assert.equal(f.bookings(), 0);
});
