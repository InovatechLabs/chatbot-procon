import { readInstitution, renderInstitution, type Institution } from '../../services/institution/settings.js';
import { readGeneration, type GenerationSettings } from '../../services/ollama/settings.js';
import type { UserSession } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/index.js';
import { sendTextMessage, sendInteractiveMessage, sendListMessage } from '../../services/metaAPI.js';
import { answerWithRAG, generateOrientativeResponse } from '../../services/llm/llmService.js';
import type { RagResult } from '../../services/llm/llmService.js';
import { getPendingAppointment, getAvailableSlots, getScheduleDates, createAppointment } from '../../services/schedule/scheduleService.js';
import { sendDocumentCategoryList, handleDocumentCategorySelection, DOCUMENT_OPTIONS } from '../../services/documents/documentService.js';
import { normalize, MENU_CMDS, EXIT_CMDS, YES, NO, isGreeting, isThanks, isCrisis, isHumanRequest, isAmbiguousServiceRequest, isLogistics, isScheduleChange, isPrivacyRequest } from '../../utils/intents/intents.js';
import { getRespostaFixa, MSG_AUDIO, MSG_ARQUIVO, MSG_MENU_EXPIRADO, MSG_ENCERRADO, MSG_AGENDAMENTO_INTERROMPIDO, MSG_DE_NADA, MSG_NAO_QUER_AGENDAR, MSG_CRISE } from '../../services/llm/helpers/fixedResponses.js';
import { MENU_OPTION, POST_ANSWER_OPTIONS, matchOption } from '../../services/whatsapp/messagePolicy.js';
import type { MenuOption } from '../../services/whatsapp/messagePolicy.js';
import { buildMenuPath } from '../../services/whatsapp/menuPath.js';
import { createFeedbackHandler, ratingOptions } from '../../services/conversation/feedback.js';
import { createSchedulingHandler } from '../../services/conversation/scheduling.js';
import { applyClarificationLimit } from '../../services/llm/helpers/clarification.js';
import { decodeSession, initialSnapshot, isScheduling, clarificationRounds, transition, persistable, withChoices } from '../../services/conversation/state.js';
import type { ConversationState } from '../../services/conversation/state.js';
import { recordEvent } from '../../services/analytics/events.js';
import type { EventInput } from '../../services/analytics/events.js';
import { ExternalWorkRequired } from '../../services/whatsapp/externalWork.js';
import { CHAT_OPTION, IN_PERSON_OPTION, LEAVE_QUEUE_OPTION, cancelWaitingHandoff, handoffAllowed, queuePosition, requestHuman, waitingForHuman } from '../../services/conversation/handoff.js';

const defaults = { db: prisma, text: sendTextMessage, interactive: sendInteractiveMessage, list: sendListMessage,
  answer: answerWithRAG, rewrite: generateOrientativeResponse, pending: getPendingAppointment,
  slots: getAvailableSlots, dates: getScheduleDates, book: createAppointment, documents: sendDocumentCategoryList, document: handleDocumentCategorySelection, handoffEnabled: handoffAllowed };
export type ConversationDependencies = typeof defaults;

export interface IncomingMessage {
  id: string; from: string; type: string;
  audio?: { id: string };
  timestamp?: string;
  text?: { body: string };
  interactive?: { type: string; button_reply?: { id: string }; list_reply?: { id: string } };
}

const categories = [
  { key: 'CARTAO_SEGURO', text: 'Seguro em cartão' },
  { key: 'EMPRESTIMO_FOLHA', text: 'Empréstimo em folha' },
  { key: 'INSS_RMC_RCC', text: 'Descontos no INSS' },
  { key: 'CONTRATO_CANCELAMENTO', text: 'Contratos e cancelamento' },
  { key: 'GARANTIA_VICIO', text: 'Produto com problema' },
  { key: 'GERAL', text: 'Outros assuntos' },
];
const pendingText = (scheduledAt: Date, institution: Institution) => `Você já tem um atendimento marcado — ${institution.name}: *${scheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}*. Só é possível manter um por vez.\n\nPara cancelar ou remarcar, fale com a equipe pelo telefone/WhatsApp ${institution.phone}. Seu horário continua reservado.`;

export function createConversationHandler(overrides: Partial<typeof defaults> = {}) {
  const d = { ...defaults, ...overrides };
  // A fila do webhook serializa os acessos a esta função por telefone.
  return async function handleMessage(message: IncomingMessage, hasNewerText: () => Promise<boolean> = async () => false, turnGeneration?: GenerationSettings) {
    if (message.type === 'reaction') return;
    const phone = message.from;
    const institution = await readInstitution(d.db);
    const allowHandoff = d.handoffEnabled(phone);
    let session = await d.db.userSession.findFirst({ where: { phoneNumber: phone, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
    const age = session ? (Date.now() - session.updatedAt.getTime()) / 60_000 : 0;
    const scheduling = !!session && isScheduling(decodeSession(session).snapshot.state);
    if (session && age > (scheduling ? 1440 : 30)) {
      await recordEvent(d.db, { kind: decodeSession(session).snapshot.state.kind === 'READY' ? 'CONVERSATION_ENDED' : 'CONVERSATION_ABANDONED', sessionId: session.id, stage: decodeSession(session).snapshot.state.kind }, `expiry:${session.id}`);
      await d.db.userSession.update({ where: { id: session.id }, data: persistable({ ...initialSnapshot(), state: { kind: 'FINISHED' } }) });
      session = null;
    }
    const freshSession = !session;
    session = session
      ? await d.db.userSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } })
      : await d.db.userSession.create({ data: { phoneNumber: phone, ...persistable(initialSnapshot()) } });
    let s: UserSession = session;
    if (freshSession) await recordEvent(d.db, { kind: 'CONVERSATION_STARTED', sessionId: s.id }, `start:${s.id}`);
    const decoded = decodeSession(s);
    let flow = decoded.snapshot;
    const event = (input: Omit<EventInput, 'sessionId'>) => recordEvent(d.db, { ...input, sessionId: s.id });
    await event({ kind: 'TURN_RECEIVED', stage: flow.state.kind });
    type Changes = Partial<Pick<UserSession, 'userName' | 'userCpf' | 'currentStepId' | 'isChat'>>;
    const update = async (state: ConversationState, changes: Changes = {}, keepChoices = false) => {
      let next = transition(flow, state, { currentStepId: changes.currentStepId === undefined ? flow.context.currentStepId : changes.currentStepId, isChat: changes.isChat ?? flow.context.isChat });
      if (keepChoices) next = withChoices(next, flow.choices);
      s = await d.db.userSession.update({ where: { id: s.id, stepState: s.stepState }, data: { ...changes, ...persistable(next) } });
      flow = next;
    };
    const atomicUpdate = async (state: ConversationState, work: (tx: Prisma.TransactionClient) => Promise<void>) => {
      const next = transition(flow, state);
      const updated = await d.db.$transaction(async tx => {
        const result = await tx.userSession.update({ where: { id: s.id, stepState: s.stepState }, data: persistable(next) });
        await work(tx); return result;
      });
      s = updated; flow = next;
    };
    const choices = async (options: MenuOption[]) => {
      const next = withChoices(flow, options);
      s = await d.db.userSession.update({ where: { id: s.id, stepState: s.stepState }, data: persistable(next) });
      flow = next;
    };
    const newSession = async () => {
      flow = initialSnapshot();
      s = await d.db.userSession.create({ data: { phoneNumber: phone, ...persistable(flow) } });
      await recordEvent(d.db, { kind: 'CONVERSATION_STARTED', sessionId: s.id }, `start:${s.id}`);
    };
    const refresh = async () => {
      s = await d.db.userSession.findUniqueOrThrow({ where: { id: s.id } });
      const current = decodeSession(s);
      if (current.invalid) throw new Error('Não foi possível retomar a conversa.');
      flow = current.snapshot;
    };
    const log = (direction: string, messageText: string, stepId?: string, outgoingId?: string, audioMediaId?: string) => d.db.chatLog.create({
      data: { sessionId: s.id, phoneNumber: phone, direction, messageText, ...(stepId ? { stepId } : {}), ...(outgoingId ? { outgoingId } : {}), ...(audioMediaId ? { audioMediaId } : {}) },
    });
    const say = async (text: string, options?: MenuOption[]) => {
      await choices(options ?? flow.choices);
      const submission = options?.length ? await d.interactive(phone, text, options) : await d.text(phone, text);
      await log('OUTBOUND', text, undefined, submission?.queued === true ? submission.id : undefined);
      if (options?.some(option => option.id === 'btn_agendar_sim')) await event({ kind: 'SCHEDULE_OFFERED', stage: flow.state.kind });
    };
    const showMenu = async (newContext = false, intro = '') => {
      if (newContext) {
        await event({ kind: 'CONVERSATION_ENDED', stage: flow.state.kind });
        await update({ kind: 'FINISHED' });
        await newSession();
      }
      const start = await d.db.step.findFirst({ where: { isStart: true }, include: { options: { orderBy: { id: 'asc' } } } });
      await update({ kind: 'MENU' }, { currentStepId: start?.id ?? null, isChat: false });
      if (start) await say(`${intro}${renderInstitution(start.message, institution)}${allowHandoff ? '\n\nPara falar com a equipe por aqui, digite *atendente*.' : ''}`, start.options);
      else await say(`${intro}O menu está temporariamente indisponível. Você pode escrever sua dúvida ou procurar a equipe do PROCON.`);
    };
    const fixed = async (category: string) => {
      const result = getRespostaFixa(category, institution);
      if (!result) return;
      const preserveSchedule = isScheduling(flow.state) && ['INFO_ATENDIMENTO', 'CANCELAR_REMARCAR'].includes(category);
      if (preserveSchedule || (clarificationRounds(flow.state) > 0 && category === 'INFO_ATENDIMENTO')) {
        const savedOptions = flow.choices;
        await say(result.texto, savedOptions);
        if (preserveSchedule) await say('Seu agendamento em andamento foi mantido. Para continuar, use a última opção solicitada. Para sair, digite *menu*.', savedOptions);
        return;
      }
      await render({ tipoResposta: 'fixa', artigo: null, ...result });
    };
    const pendingNotice = async () => {
      const pending = await d.pending(phone);
      if (!pending) return false;
      await update({ kind: 'READY' }, { currentStepId: null, isChat: false });
      await say(pendingText(pending.scheduledAt, institution), [MENU_OPTION]);
      return true;
    };
    const startSchedule = async () => {
      if (await pendingNotice()) return;
      await update({ kind: 'SCHEDULE_CATEGORY' }, { userName: null, userCpf: null });
      await say(`Para agendar atendimento presencial — ${institution.name}, escolha o assunto. Se não encontrar, escolha Outros assuntos.\n\nPara sair, digite *menu*.`, categories.map(c => ({ id: `btn_sch_cat_${c.key}`, text: c.text })));
    };
    const enterHumanQueue = async () => {
      if (!await requestHuman(d.db, phone)) return;
      await event({ kind: 'HANDOFF_REQUESTED', stage: flow.state.kind });
      const position = await queuePosition(d.db, phone);
      await say(`${renderInstitution(institution.queueMessage, institution)}\n\n*Posição na fila: ${position}*\nDigite *posição* para consultar sua posição na fila ou *sair da fila* para cancelar.`, [LEAVE_QUEUE_OPTION]);
    };
    const confirmChannel = async () => say('Como você prefere ser atendido pelo PROCON?', [CHAT_OPTION, IN_PERSON_OPTION, MENU_OPTION]);
    const selectChannel = async (id: string) => {
      if (id === CHAT_OPTION.id) await enterHumanQueue();
      else if (isScheduling(flow.state)) await say('Seu agendamento já está em andamento. Digite *menu* se quiser recomeçar.', [MENU_OPTION]);
      else await startSchedule();
    };
    async function render(result: RagResult) {
      const count = clarificationRounds(flow.state);
      result = applyClarificationLimit(result, count, institution);
      let text = result.texto;
      await event({ kind: 'ANSWER_PREPARED', answerKind: result.tipoResposta });
      if (result.tipoResposta === 'clarificacao') {
        await say(`${text}\n\nPara voltar às opções, digite *menu*.`, [MENU_OPTION]);
        await update({ kind: 'FREE_CHAT', clarifications: Math.min(count + 1, 2) }, {}, true);
      } else if (result.tipoResposta === 'orientacao_final') {
        await update({ kind: 'POST_ANSWER' }, { isChat: true });
        await say(text, POST_ANSWER_OPTIONS);
      } else {
        const wantsSchedule = result.tipoResposta === 'redirecionamento' || result.acoes?.includes('agendar');
        const pending = wantsSchedule ? await d.pending(phone) : null;
        const options: MenuOption[] = [];
        if (wantsSchedule && !pending) options.push({ id: 'btn_agendar_sim', text: 'Agendar atendimento' });
        options.push(MENU_OPTION);
        if (pending) {
          text = result.tipoResposta === 'redirecionamento' ? pendingText(pending.scheduledAt, institution) : `${text}\n\n${pendingText(pending.scheduledAt, institution)}`;
        }
        await update({ kind: wantsSchedule && !pending ? 'SCHEDULE_OFFER' : 'READY' });
        await say(text, options);
      }
    }
    const answer = async (text: string) => {
      const entering = !s.isChat;
      const count = clarificationRounds(flow.state);
      await update({ kind: 'FREE_CHAT', clarifications: count });
      if (entering && !allowHandoff) await say('Irei analisar sua dúvida. Para voltar às opções, digite *menu*.');

      let result: RagResult;
      try {
        const generation = turnGeneration ?? await readGeneration(d.db);
        result = await d.answer(text, s.id, { clarificationCount: count, institution, generation });
      }
      catch (err) {
        if (err instanceof ExternalWorkRequired) throw err;
        console.error('Erro ao gerar resposta com RAG:', err);
        await say(renderInstitution(institution.unavailableMessage, institution), [MENU_OPTION]);
        return;
      }
      // O complemento já está na fila e será analisado com este relato no histórico.
      if (await hasNewerText()) return;
      if (allowHandoff && result.atendimento === 'chat') await enterHumanQueue();
      else if (allowHandoff && result.atendimento === 'confirmar_canal') await confirmChannel();
      else await render(result);
    };
    const human = allowHandoff ? await waitingForHuman(d.db, phone) : null;
    if (human) {
      // Continua registrando mensagens sem reativar o bot, inclusive após expirar a sessão.
      const selection = message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
      const text = message.type === 'text' ? message.text?.body : selection === LEAVE_QUEUE_OPTION.id ? LEAVE_QUEUE_OPTION.text : selection ? `[Opção selecionada] ${selection}` : `[Mensagem do tipo ${message.type}]`;
      if (message.type === 'audio') await log('INBOUND', 'Áudio do consumidor', undefined, undefined, message.audio?.id);
      else if (text) await log('INBOUND', text);
      const command = message.type === 'text' ? normalize(text ?? '') : '';
      if (isCrisis(command)) await say(MSG_CRISE, []);
      else if (human.status === 'WAITING') {
        if (selection === LEAVE_QUEUE_OPTION.id || /^(?:sair da fila|cancelar (?:a )?fila|cancelar atendimento por chat)$/.test(command)) {
          if (await cancelWaitingHandoff(d.db, phone)) await showMenu(true, 'Você saiu da fila de atendimento por chat.\n\n');
        } else if (/^posicao(?: na fila)?$/.test(command)) {
          await say(`Sua posição atual na fila é *${await queuePosition(d.db, phone)}*.`, [LEAVE_QUEUE_OPTION]);
        }
      }
      return;
    }
    const context = { institution, snapshot: () => flow, session: () => s, phone, d, update, atomicUpdate, choices, say, showMenu, pendingNotice, refresh, event };
    const schedulingHandler = createSchedulingHandler(context);
    const feedbackHandler = createFeedbackHandler(context);
    if (decoded.invalid) {
      await say('Não consegui retomar sua última etapa. Vamos voltar ao menu; nenhum novo horário foi reservado.');
      await showMenu(); return;
    }
    if (decoded.legacy) s = await d.db.userSession.update({ where: { id: s.id }, data: persistable(flow) });
    if (scheduling && age > 30 && age <= 1440) {
      const savedChoices = flow.choices;
      await say('Vamos continuar seu agendamento de onde parou. Nenhum horário foi reservado ainda. Se preferir recomeçar, digite *menu*.', savedChoices);
    }
    let selected = message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
    if (selected === LEAVE_QUEUE_OPTION.id) return;
    if (message.type === 'text') {
      const raw = message.text?.body.trim() ?? '';
      const n = normalize(raw);
      // Segurança e ajuda têm prioridade inclusive na coleta de dados e no feedback.
      if (isCrisis(n)) { await say(MSG_CRISE, [MENU_OPTION]); return; }
      if (isPrivacyRequest(n)) { await say(renderInstitution(institution.privacyMessage, institution), [MENU_OPTION]); return; }
      if (flow.state.kind !== 'SCHEDULE_CPF' && /^[\d.\-\s]+$/.test(raw) && raw.replace(/\D/g, '').length === 11) {
        await say('Recebi uma sequência de 11 números. Se estava informando seu CPF para agendar, retome pelas opções abaixo. Para sua privacidade, esse número não será enviado à IA.', [{ id: 'btn_agendar_sim', text: 'Agendar atendimento' }, MENU_OPTION]);
        await update({ kind: 'SCHEDULE_OFFER' }); return;
      }
      if (isScheduleChange(n) || (n === 'cancelar' && await d.pending(phone))) { await fixed('CANCELAR_REMARCAR'); return; }
      if (MENU_CMDS.has(n) || EXIT_CMDS.has(n)) {
        if (freshSession && MENU_CMDS.has(n)) { await showMenu(); return; }
        await event({ kind: 'CONVERSATION_ENDED', stage: flow.state.kind });
        const wasScheduling = isScheduling(flow.state);
        await update({ kind: 'FINISHED' });
        if (wasScheduling) await say(`${MSG_AGENDAMENTO_INTERROMPIDO} Para continuar depois, digite *menu*.`);
        if (EXIT_CMDS.has(n)) { if (!wasScheduling) await say(MSG_ENCERRADO); return; }
        await newSession();
        await showMenu(); return;
      }
      if (isHumanRequest(n) || isLogistics(n)) {
        if (isHumanRequest(n)) {
          if (allowHandoff) { await log('INBOUND', raw); await enterHumanQueue(); return; }
          await event({ kind: 'HANDOFF_REQUESTED', stage: flow.state.kind });
        }
        await fixed('INFO_ATENDIMENTO'); return;
      }
      if (allowHandoff && isAmbiguousServiceRequest(n)) { await log('INBOUND', raw); await confirmChannel(); return; }
      if (allowHandoff && flow.choices.some(option => option.id === CHAT_OPTION.id)) {
        const channel = matchOption(raw, flow.choices, normalize);
        if (channel?.id === CHAT_OPTION.id || channel?.id === IN_PERSON_OPTION.id) {
          await log('INBOUND', raw);
          await selectChannel(channel.id);
          return;
        }
      }
      // Formato legado ou gravação interrompida antes de salvar as opções: não adivinhar
      // a correspondência de um número com datas/horários que não conhecemos.
      if (/^\d+$/.test(n) && !flow.choices.length && await schedulingHandler.reoffer()) return;
      const collection = await schedulingHandler.handleText(raw, n);
      if (collection.handled) return;
      selected = collection.selection ?? selected;
      if (!selected) {
        if (await feedbackHandler.handleText(raw, n)) return;
        if (flow.state.kind === 'SCHEDULE_OFFER' && YES.has(n)) { await startSchedule(); return; }
        if (flow.state.kind === 'SCHEDULE_OFFER' && NO.has(n)) { await update({ kind: 'READY' }); await say(MSG_NAO_QUER_AGENDAR, [MENU_OPTION]); return; }
        if (flow.state.kind === 'POST_ANSWER' && YES.has(n)) selected = 'btn_feedback_sim';
        else if (flow.state.kind === 'POST_ANSWER' && NO.has(n)) selected = 'btn_feedback_nao';
        else {
          let options: MenuOption[] = flow.choices;
          if (s.currentStepId) {
            const currentOptions = await d.db.option.findMany({ where: { stepId: s.currentStepId }, orderBy: { id: 'asc' } });
            if (currentOptions.length) options = currentOptions;
          }
          if (flow.state.kind === 'POST_ANSWER') options = POST_ANSWER_OPTIONS;
          if (flow.state.kind === 'SCHEDULE_OFFER') options = [{ id: 'btn_agendar_sim', text: 'Agendar atendimento' }, MENU_OPTION];
          if (flow.state.kind === 'SCHEDULE_CATEGORY') options = categories.map(c => ({ id: `btn_sch_cat_${c.key}`, text: c.text }));
          if (flow.state.kind === 'DOCUMENT_CATEGORY') options = DOCUMENT_OPTIONS;
          if (flow.state.kind === 'RATING') options = ratingOptions;
          selected = matchOption(raw, options, normalize)?.id;
        }
        if (!selected) {
          if (isGreeting(n)) { await showMenu(); return; }
          if (isThanks(raw, n)) { await say(MSG_DE_NADA, [MENU_OPTION]); return; }
          if (isScheduling(flow.state)) { await say('Para continuar o agendamento, use as opções da última mensagem. Para interromper, digite *menu*. Se precisar de ajuda, escreva *atendente*.'); return; }
          await log('INBOUND', raw);
          await answer(raw); return;
        }
      }
    } else if (message.type !== 'interactive') {
      await say(message.type === 'audio' ? `${MSG_AUDIO}${allowHandoff ? '\n\nSe preferir explicar por áudio, digite *atendente* para falar com a equipe. Envie o áudio depois de entrar na fila.' : ''}` : ['image', 'document', 'video'].includes(message.type) ? MSG_ARQUIVO : 'Consigo ler mensagens de texto e seleções nas opções. Escreva sua dúvida ou digite *menu*.', [MENU_OPTION]); return;
    }

    if (!selected) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
    if (selected === CHAT_OPTION.id || selected === IN_PERSON_OPTION.id) {
      if (!allowHandoff || !flow.choices.some(option => option.id === selected)) { await say(MSG_MENU_EXPIRADO, flow.choices); return; }
      await log('INBOUND', selected === CHAT_OPTION.id ? CHAT_OPTION.text : IN_PERSON_OPTION.text);
      await selectChannel(selected);
      return;
    }
    if (selected === 'btn_go_menu') { await showMenu(true); return; }
    if (selected === 'btn_agendar_sim') {
      if (isScheduling(flow.state)) { await say('Seu agendamento já está em andamento. Continue pela última solicitação ou digite *menu* para recomeçar.', flow.choices); return; }
      await startSchedule(); return;
    }
    if (selected === 'btn_agendar_nao') {
      if (flow.state.kind !== 'SCHEDULE_OFFER') { await say(MSG_MENU_EXPIRADO, flow.choices); return; }
      await update({ kind: 'READY' }); await say(MSG_NAO_QUER_AGENDAR, [MENU_OPTION]); return;
    }
    if (await feedbackHandler.handleSelection(selected)) return;
    if (selected.startsWith('doc_req_')) {
      if (flow.state.kind !== 'DOCUMENT_CATEGORY') { await say(MSG_MENU_EXPIRADO, flow.choices); return; }
      await update({ kind: 'READY' }, { isChat: false, currentStepId: null });
      const label = DOCUMENT_OPTIONS.find(option => option.id === selected)?.text;
      if (label) await log('INBOUND', label);
      const text = await d.document(phone, selected, institution);
      if (typeof text === 'string') await log('OUTBOUND', text);
      return;
    }
    if (await schedulingHandler.handleSelection(selected)) return;
    const option = await d.db.option.findUnique({ where: { id: selected } });
    if (!option || option.stepId !== s.currentStepId) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
    await update({ kind: 'MENU' }, { isChat: false });
    await log('INBOUND', option.text, option.stepId);
    if (!option.nextStepId && normalize(option.text).includes('doc')) { await update({ kind: 'DOCUMENT_CATEGORY' }, { currentStepId: null }); await d.documents(phone, institution); return; }
    if (!option.nextStepId) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
    const step = await d.db.step.findUnique({ where: { id: option.nextStepId }, include: { options: { orderBy: { id: 'asc' } } } });
    if (!step) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
    if (step.isStart) { await showMenu(true); return; }
    await event({ kind: step.options.length ? 'CATEGORY_SELECTED' : 'QUESTION_SELECTED', stepId: step.id, optionId: option.id });
    await update({ kind: step.options.length ? 'MENU' : 'POST_ANSWER' }, { currentStepId: step.id });
    const menuText = renderInstitution(step.message, institution);
    if (step.options.length) { await say(menuText, step.options); return; }
    if (menuText !== step.message) {
      await event({ kind: 'ANSWER_PREPARED', answerKind: 'MENU', stepId: step.id });
      await say(menuText, POST_ANSWER_OPTIONS);
      return;
    }
    const [previous, edges] = await Promise.all([
      d.db.chatLog.findMany({ where: { sessionId: s.id, direction: 'INBOUND', stepId: { not: null } }, orderBy: { timestamp: 'desc' }, take: 50 }),
      d.db.option.findMany(),
    ]);
    const path = buildMenuPath(option, previous, edges);
    const rewritten = await d.rewrite(path || option.text, step.message, turnGeneration ?? await readGeneration(d.db));
    await event({ kind: 'ANSWER_PREPARED', answerKind: 'MENU', stepId: step.id });
    await say(rewritten, POST_ANSWER_OPTIONS);
  };
}
