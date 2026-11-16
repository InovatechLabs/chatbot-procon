import type { UserSession } from '@prisma/client';
import { prisma } from '../../database/index.js';
import { sendTextMessage, sendInteractiveMessage, sendListMessage } from '../../services/metaAPI.js';
import { answerWithRAG, generateOrientativeResponse } from '../../services/llm/llmService.js';
import type { RagResult } from '../../services/llm/llmService.js';
import { getPendingAppointment, getAvailableSlots, createAppointment } from '../../services/schedule/scheduleService.js';
import { sendDocumentCategoryList, handleDocumentCategorySelection, DOCUMENT_OPTIONS } from '../../services/documents/documentService.js';
import { cleanAndValidateCpf, getNextBusinessDays, validateFullName } from '../../utils/validators/index.js';
import { normalize, MENU_CMDS, EXIT_CMDS, YES, NO, isGreeting, isThanks, querSair, isCrisis, isHumanRequest, isLogistics, isScheduleChange, isPrivacyRequest } from '../../utils/intents/intents.js';
import { getRespostaFixa, MSG_AUDIO, MSG_ARQUIVO, MSG_MENU_EXPIRADO, MSG_NOME_INVALIDO, MSG_CPF_INVALIDO, MSG_SAIDA_AGENDAMENTO, MSG_ENCERRADO, MSG_AGENDAMENTO_INTERROMPIDO, MSG_DE_NADA, MSG_NAO_QUER_AGENDAR, MSG_CRISE } from '../../services/llm/helpers/fixedResponses.js';
import { MENU_OPTION, POST_ANSWER_OPTIONS, maskCpf, matchOption } from '../../services/whatsapp/messagePolicy.js';
import type { MenuOption } from '../../services/whatsapp/messagePolicy.js';
import { buildMenuPath } from '../../services/whatsapp/menuPath.js';
import { DOCUMENT_GUIDES } from '../../services/documents/documentGuides.js';
import { applyClarificationLimit, clarificationCount, clarificationState } from '../../services/llm/helpers/clarification.js';

const defaults = { db: prisma, text: sendTextMessage, interactive: sendInteractiveMessage, list: sendListMessage,
  answer: answerWithRAG, rewrite: generateOrientativeResponse, pending: getPendingAppointment,
  slots: getAvailableSlots, book: createAppointment, documents: sendDocumentCategoryList, document: handleDocumentCategorySelection };

export interface IncomingMessage {
  id: string; from: string; type: string;
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
const ratingOptions = [
  { id: 'btn_rate_5', text: 'Ajudou' }, { id: 'btn_rate_3', text: 'Mais ou menos' }, { id: 'btn_rate_1', text: 'Não ajudou' },
];
const pendingText = (scheduledAt: Date) => `Você já tem um atendimento marcado no PROCON de Jacareí: *${scheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}*. Só é possível manter um por vez.\n\nPara cancelar ou remarcar, fale com a equipe pelo telefone/WhatsApp (12) 3955-9130. Seu horário continua reservado.`;

export function createConversationHandler(overrides: Partial<typeof defaults> = {}) {
  const d = { ...defaults, ...overrides };
  const displayedOptions = new Map<string, MenuOption[]>();
  // A fila do webhook serializa os acessos a esta função por telefone.
  return async function handleMessage(message: IncomingMessage, hasNewerText: () => Promise<boolean> = async () => false) {
    if (message.type === 'reaction') return;
    const phone = message.from;
    let session = await d.db.userSession.findFirst({ where: { phoneNumber: phone, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
    const age = session ? (Date.now() - session.updatedAt.getTime()) / 60_000 : 0;
    const scheduling = session?.stepState?.startsWith('SCH_');
    if (session && age > (scheduling ? 1440 : 30)) {
      await d.db.userSession.update({ where: { id: session.id }, data: { status: 'RESOLVED', stepState: null, isChat: false, currentStepId: null } });
      session = null;
    }
    session = session
      ? await d.db.userSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } })
      : await d.db.userSession.create({ data: { phoneNumber: phone, status: 'OPEN', isChat: false } });
    let s: UserSession = session;
    const update = async (data: Parameters<typeof d.db.userSession.update>[0]['data']) => {
      s = await d.db.userSession.update({ where: { id: s.id }, data });
    };
    const log = (direction: string, messageText: string, stepId?: string) => d.db.chatLog.create({
      data: { sessionId: s.id, phoneNumber: phone, direction, messageText, ...(stepId ? { stepId } : {}) },
    });
    const say = async (text: string, options?: MenuOption[]) => {
      displayedOptions.set(s.id, options ?? []);
      if (displayedOptions.size > 2000) displayedOptions.delete(displayedOptions.keys().next().value!);
      if (options?.length) await d.interactive(phone, text, options);
      else await d.text(phone, text);
      await log('OUTBOUND', text);
    };
    const showMenu = async (newContext = false) => {
      if (newContext) {
        await update({ status: 'RESOLVED', isChat: false, currentStepId: null, stepState: null });
        s = await d.db.userSession.create({ data: { phoneNumber: phone, status: 'OPEN', isChat: false } });
      }
      const start = await d.db.step.findFirst({ where: { isStart: true }, include: { options: { orderBy: { id: 'asc' } } } });
      await update({ isChat: false, stepState: null, currentStepId: start?.id ?? null });
      if (start) await say(start.message, start.options);
      else await say('O menu está temporariamente indisponível. Você pode escrever sua dúvida ou procurar a equipe do PROCON.');
    };
    const fixed = async (category: string) => {
      const result = getRespostaFixa(category);
      const saved = { stepState: s.stepState, currentStepId: s.currentStepId, isChat: s.isChat };
      const savedOptions = displayedOptions.get(s.id);
      if (result) await render({ tipoResposta: 'fixa', artigo: null, ...result });
      if (saved.stepState?.startsWith('SCH_') && ['INFO_ATENDIMENTO', 'CANCELAR_REMARCAR'].includes(category)) {
        await update(saved);
        await say('Seu agendamento em andamento foi mantido. Para continuar, use a última opção solicitada. Para sair, digite *menu*.');
        if (savedOptions) displayedOptions.set(s.id, savedOptions);
      } else if (clarificationCount(saved.stepState) > 0 && category === 'INFO_ATENDIMENTO') {
        await update(saved);
        if (savedOptions) displayedOptions.set(s.id, savedOptions);
      }
    };
    const pendingNotice = async () => {
      const pending = await d.pending(phone);
      if (!pending) return false;
      await update({ stepState: null, currentStepId: null, isChat: false });
      await say(pendingText(pending.scheduledAt), [MENU_OPTION]);
      return true;
    };
    const startSchedule = async () => {
      if (await pendingNotice()) return;
      await update({ stepState: 'SCH_STEP_CAT_SELECT', currentStepId: null, isChat: false, userName: null, userCpf: null });
      await say('Para agendar atendimento presencial no PROCON de Jacareí, escolha o assunto. Se não encontrar, escolha Outros assuntos.\n\nPara sair, digite *menu*.', categories.map(c => ({ id: `btn_sch_cat_${c.key}`, text: c.text })));
    };
    async function render(result: RagResult) {
      const count = clarificationCount(s.stepState);
      result = applyClarificationLimit(result, count);
      let text = result.texto;
      if (result.tipoResposta === 'clarificacao') {
        await say(`${text}\n\nPara voltar às opções, digite *menu*.`, [MENU_OPTION]);
        await update({ stepState: clarificationState(count + 1), isChat: true });
      } else if (result.tipoResposta === 'orientacao_final') {
        await update({ stepState: 'POST_ANSWER', isChat: true });
        await say(text, POST_ANSWER_OPTIONS);
      } else {
        const wantsSchedule = result.tipoResposta === 'redirecionamento' || result.acoes?.includes('agendar');
        const pending = wantsSchedule ? await d.pending(phone) : null;
        const options: MenuOption[] = [];
        if (wantsSchedule && !pending) options.push({ id: 'btn_agendar_sim', text: 'Agendar atendimento' });
        options.push(MENU_OPTION);
        if (pending) {
          text = result.tipoResposta === 'redirecionamento' ? pendingText(pending.scheduledAt) : `${text}\n\n${pendingText(pending.scheduledAt)}`;
        }
        await update({ stepState: wantsSchedule && !pending ? 'AWAIT_AGENDAR' : null });
        await say(text, options);
      }
    }
    const answer = async (text: string) => {
      const entering = !s.isChat;
      const count = clarificationCount(s.stepState);
      await update({ isChat: true, currentStepId: null, stepState: count > 0 ? clarificationState(count) : null });
      if (entering) await say('Irei analisar sua dúvida. Para voltar às opções, digite *menu*.');
      const progress = setTimeout(() => { void d.text(phone, 'Estou consultando as orientações. Aguarde um momento.').catch(console.error); }, 4000);
      try {
        const result = await d.answer(text, s.id, { clarificationCount: count });
        // O complemento já está na fila e será analisado com este relato no histórico.
        // Evita mostrar uma pergunta/orientação que nasceu antes da informação nova.
        if (!await hasNewerText()) await render(result);
      }
      finally { clearTimeout(progress); }
    };
    const showDates = async (category: string, intro = '') => {
      // Só apresenta dias com vagas, sem repetir cinco dias lotados.
      const days = getNextBusinessDays(15);
      const freeDays = [];
      for (const day of days) {
        if ((await d.slots(day.dateStr)).length) freeDays.push(day);
        if (freeDays.length === 5) break;
      }
      if (!freeDays.length) {
        await update({ stepState: null });
        await say('Não encontrei vagas nos próximos 15 dias úteis. Para consultar novas datas, fale com o PROCON: (12) 3955-9130. Nenhum horário foi reservado.', [MENU_OPTION]);
        return;
      }
      await update({ stepState: `SCH_STEP_DATE:${category}`, currentStepId: null });
      const rows = freeDays.map(day => ({ id: `btn_sch_date_${day.dateStr}`, title: day.label }));
      displayedOptions.set(s.id, rows.map(row => ({ id: row.id, text: row.title })));
      await d.list(phone, 'Datas disponíveis', `${intro}Escolha o dia do atendimento. Para sair, digite *menu*.`, 'Ver datas', [{ title: 'Dias com vagas', rows }]);
    };
    const showSlots = async (category: string, date: string, page = 0) => {
      const slots = await d.slots(date);
      if (!slots.length) return showDates(category, 'As vagas dessa data foram preenchidas. ');
      const pages = Math.ceil(slots.length / 7);
      page = Math.min(Math.max(0, page), pages - 1);
      await update({ stepState: `SCH_STEP_SLOT:${category}:${date}:${page}`, currentStepId: null });
      const rows = slots.slice(page * 7, page * 7 + 7).map(slot => ({ id: `btn_sch_slot_${slot.dateTimeIso}`, title: slot.time, description: Number(slot.time.slice(0, 2)) < 12 ? 'Atendimento pela manhã' : 'Atendimento à tarde' }));
      if (page > 0) rows.push({ id: `btn_sch_page_${page - 1}`, title: 'Horários anteriores', description: 'Ver outra página' });
      if (page + 1 < pages) rows.push({ id: `btn_sch_page_${page + 1}`, title: 'Mais horários', description: 'Ver outra página' });
      rows.push({ id: 'btn_sch_dates', title: 'Outra data', description: 'Voltar à escolha do dia' });
      displayedOptions.set(s.id, rows.map(row => ({ id: row.id, text: row.title })));
      await d.list(phone, 'Horários disponíveis', `Dia ${date.split('-').reverse().join('/')} — página ${page + 1} de ${pages}. Escolha um horário. Para sair, digite *menu*.`, 'Ver horários', [{ title: 'Horários', rows }]);
    };

    if (scheduling && age > 30 && age <= 1440) await say('Vamos continuar seu agendamento de onde parou. Nenhum horário foi reservado ainda. Se preferir recomeçar, digite *menu*.');
    let selected = message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
    if (message.type === 'text') {
      const raw = message.text?.body.trim() ?? '';
      const n = normalize(raw);
      // Segurança e ajuda têm prioridade inclusive na coleta de dados e no feedback.
      if (isCrisis(n)) { await say(MSG_CRISE, [MENU_OPTION]); return; }
      if (isPrivacyRequest(n)) { await say('Para dúvidas sobre o uso dos seus dados ou para pedir que sejam apagados, fale com a equipe do PROCON pelo (12) 3955-9130 ou procon@jacarei.sp.gov.br. Por aqui não consigo excluir dados. Seu pedido precisa ser analisado pela equipe.', [MENU_OPTION]); return; }
      if (!s.stepState?.startsWith('SCH_STEP_CPF:') && /^[\d.\-\s]+$/.test(raw) && raw.replace(/\D/g, '').length === 11) {
        await say('Recebi uma sequência de 11 números. Se estava informando seu CPF para agendar, retome pelas opções abaixo. Para sua privacidade, esse número não será enviado à IA.', [{ id: 'btn_agendar_sim', text: 'Agendar atendimento' }, MENU_OPTION]);
        await update({ stepState: 'AWAIT_AGENDAR' }); return;
      }
      if (isScheduleChange(n) || (n === 'cancelar' && await d.pending(phone))) { await fixed('CANCELAR_REMARCAR'); return; }
      if (MENU_CMDS.has(n) || EXIT_CMDS.has(n)) {
        const wasScheduling = s.stepState?.startsWith('SCH_');
        await update({ status: 'RESOLVED', stepState: null, currentStepId: null, isChat: false });
        if (wasScheduling) await say(`${MSG_AGENDAMENTO_INTERROMPIDO} Para continuar depois, digite *menu*.`);
        if (EXIT_CMDS.has(n)) { if (!wasScheduling) await say(MSG_ENCERRADO); return; }
        s = await d.db.userSession.create({ data: { phoneNumber: phone, status: 'OPEN', isChat: false } });
        await showMenu(); return;
      }
      if (isHumanRequest(n) || isLogistics(n)) { await fixed('INFO_ATENDIMENTO'); return; }
      if (s.stepState?.startsWith('SCH_STEP_NAME:')) {
        if (querSair(n, raw)) { await say(MSG_SAIDA_AGENDAMENTO, [MENU_OPTION]); return; }
        if (!validateFullName(raw)) { await say(MSG_NOME_INVALIDO); return; }
        const category = s.stepState.split(':')[1]!;
        await update({ userName: raw, stepState: `SCH_STEP_NAME_CONFIRM:${category}` });
        await say(`O nome para o atendimento é *${raw}*?`, [{ id: 'btn_sch_name_yes', text: 'Sim, está certo' }, { id: 'btn_sch_name_no', text: 'Corrigir nome' }, MENU_OPTION]); return;
      }
      if (s.stepState?.startsWith('SCH_STEP_NAME_CONFIRM:')) {
        if (YES.has(n) || n === 'sim esta certo') selected = 'btn_sch_name_yes';
        else if (NO.has(n) || n === 'corrigir nome') selected = 'btn_sch_name_no';
        else { await say('Confirme o nome pelos botões ou digite *sim*, *não* ou *menu*.'); return; }
      } else if (s.stepState?.startsWith('SCH_STEP_CPF:')) {
        if (querSair(n, raw)) { await say(MSG_SAIDA_AGENDAMENTO, [MENU_OPTION]); return; }
        const cpf = cleanAndValidateCpf(raw);
        if (!cpf) { await say(MSG_CPF_INVALIDO); return; }
        const category = s.stepState.split(':')[1]!;
        await update({ userCpf: cpf });
        await showDates(category, 'CPF registrado. '); return;
      } else if (!selected) {
        if (s.stepState === 'FEEDBACK_COMMENT' && !raw.includes('?') && !/\b(comprei|contratei|cobraram|prazo|quero saber|como faco)\b/.test(n)) {
          const feedback = await d.db.sessionFeedback.findFirst({ where: { sessionId: s.id }, orderBy: { createdAt: 'desc' } });
          if (feedback) await d.db.sessionFeedback.update({ where: { id: feedback.id }, data: { comment: raw } });
          await update({ stepState: null });
          await say('Obrigado pelo comentário! Para continuar, escreva sua dúvida ou digite *menu*.', [MENU_OPTION]); return;
        }
        if (s.stepState === 'AWAIT_AGENDAR' && YES.has(n)) { await startSchedule(); return; }
        if (s.stepState === 'AWAIT_AGENDAR' && NO.has(n)) { await update({ stepState: null }); await say(MSG_NAO_QUER_AGENDAR, [MENU_OPTION]); return; }
        if (s.stepState === 'POST_ANSWER' && YES.has(n)) selected = 'btn_feedback_sim';
        else if (s.stepState === 'POST_ANSWER' && NO.has(n)) selected = 'btn_feedback_nao';
        else {
          let options: MenuOption[] = displayedOptions.get(s.id) ?? [];
          if (s.currentStepId) {
            const currentOptions = await d.db.option.findMany({ where: { stepId: s.currentStepId }, orderBy: { id: 'asc' } });
            if (currentOptions.length) options = currentOptions;
          }
          if (s.stepState === 'POST_ANSWER') options = POST_ANSWER_OPTIONS;
          if (s.stepState === 'AWAIT_AGENDAR') options = [{ id: 'btn_agendar_sim', text: 'Agendar atendimento' }, MENU_OPTION];
          if (s.stepState === 'SCH_STEP_CAT_SELECT') options = categories.map(c => ({ id: `btn_sch_cat_${c.key}`, text: c.text }));
          if (s.stepState === 'DOC_SELECT') options = DOCUMENT_OPTIONS;
          if (s.stepState === 'AWAIT_RATING') options = ratingOptions;
          selected = matchOption(raw, options, normalize)?.id;
        }
        if (!selected) {
          if (isGreeting(n)) { await showMenu(); return; }
          if (isThanks(raw, n)) { await say(MSG_DE_NADA, [MENU_OPTION]); return; }
          if (s.stepState?.startsWith('SCH_')) { await say('Para continuar o agendamento, use as opções da última mensagem. Para interromper, digite *menu*. Se precisar de ajuda, escreva *atendente*.'); return; }
          await log('INBOUND', raw);
          await answer(raw); return;
        }
      }
    } else if (message.type !== 'interactive') {
      await say(message.type === 'audio' ? MSG_AUDIO : ['image', 'document', 'video'].includes(message.type) ? MSG_ARQUIVO : 'Consigo ler mensagens de texto e seleções nas opções. Escreva sua dúvida ou digite *menu*.', [MENU_OPTION]); return;
    }

    if (!selected) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
    if (selected === 'btn_go_menu') { await showMenu(true); return; }
    if (selected === 'btn_agendar_sim') { await startSchedule(); return; }
    if (selected === 'btn_agendar_nao') { await update({ stepState: null }); await say(MSG_NAO_QUER_AGENDAR, [MENU_OPTION]); return; }
    if (selected === 'btn_feedback_sim' || selected === 'btn_evaluate') {
      if (selected === 'btn_feedback_sim' && s.stepState !== 'POST_ANSWER') { await say(MSG_DE_NADA, [MENU_OPTION]); return; }
      await update({ stepState: 'AWAIT_RATING' });
      await say('Se quiser, avalie como a orientação ajudou. Você também pode continuar pelo menu.', ratingOptions); return;
    }
    if (selected === 'btn_feedback_nao') {
      await update({ stepState: 'AWAIT_AGENDAR' });
      await say('Se precisar, a equipe pode analisar seu caso presencialmente. Quer agendar?', [{ id: 'btn_agendar_sim', text: 'Agendar atendimento' }, MENU_OPTION]); return;
    }
    if (selected.startsWith('btn_rate_')) {
      if (s.stepState !== 'AWAIT_RATING') { await say('Essa avaliação já foi concluída. Para continuar, digite *menu*.', [MENU_OPTION]); return; }
      const rating = Number(selected.replace('btn_rate_', ''));
      if (![1, 3, 5].includes(rating)) { await showMenu(); return; }
      await d.db.sessionFeedback.create({ data: { sessionId: s.id, phoneNumber: phone, rating } });
      await update({ stepState: null });
      await say('Obrigado pela avaliação! Você pode continuar pelo menu.', rating === 1 ? [{ id: 'btn_comment', text: 'Deixar comentário' }, MENU_OPTION] : [MENU_OPTION]); return;
    }
    if (selected === 'btn_comment') {
      const feedback = await d.db.sessionFeedback.findFirst({ where: { sessionId: s.id }, orderBy: { createdAt: 'desc' } });
      if (!feedback || feedback.rating !== 1) { await showMenu(); return; }
      await update({ stepState: 'FEEDBACK_COMMENT' });
      await say('Escreva seu comentário sobre o atendimento. Se tiver outra dúvida, digite *menu* para continuar.', [MENU_OPTION]); return;
    }
    if (selected.startsWith('doc_req_')) {
      await update({ isChat: false, stepState: null, currentStepId: null });
      const label = DOCUMENT_OPTIONS.find(option => option.id === selected)?.text;
      if (label) await log('INBOUND', label);
      const text = await d.document(phone, selected);
      if (typeof text === 'string') await log('OUTBOUND', text);
      return;
    }
    if (selected.startsWith('btn_sch_cat_')) {
      const category = selected.replace('btn_sch_cat_', '');
      if (s.stepState !== 'SCH_STEP_CAT_SELECT' || !categories.some(c => c.key === category)) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
      await update({ stepState: `SCH_STEP_NAME:${category}`, isChat: false });
      await say('Usaremos seu nome e CPF para registrar o agendamento e identificar seu atendimento. A conversa acontece pelo WhatsApp.\n\nDigite o nome e sobrenome da pessoa que será atendida. Para sair, digite *menu*.'); return;
    }
    if (selected === 'btn_sch_name_yes' || selected === 'btn_sch_name_no') {
      if (!s.stepState?.startsWith('SCH_STEP_NAME_CONFIRM:')) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
      const category = s.stepState.split(':')[1]!;
      const confirmed = selected === 'btn_sch_name_yes';
      await update({ stepState: `SCH_STEP_${confirmed ? 'CPF' : 'NAME'}:${category}` });
      await say(confirmed ? 'Digite o CPF da pessoa que será atendida, com 11 números. Usaremos esse dado para o agendamento. Para sair, digite *menu*.' : 'Digite novamente o nome e sobrenome. Para sair, digite *menu*.'); return;
    }
    if (selected.startsWith('btn_sch_date_')) {
      const date = selected.replace('btn_sch_date_', '');
      if (!s.stepState?.startsWith('SCH_STEP_DATE:') || !getNextBusinessDays(15).some(day => day.dateStr === date)) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
      await showSlots(s.stepState.split(':')[1]!, date); return;
    }
    if (selected === 'btn_sch_dates' || selected.startsWith('btn_sch_page_')) {
      if (!s.stepState?.startsWith('SCH_STEP_SLOT:')) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
      const [, category, date] = s.stepState.split(':');
      if (selected === 'btn_sch_dates') await showDates(category!);
      else {
        const page = Number(selected.replace('btn_sch_page_', ''));
        if (Number.isInteger(page)) await showSlots(category!, date!, page);
        else await showMenu();
      }
      return;
    }
    if (selected.startsWith('btn_sch_slot_')) {
      if (!s.stepState?.startsWith('SCH_STEP_SLOT:') || !s.userName || !s.userCpf) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
      const [, category, date, page] = s.stepState.split(':');
      const iso = selected.replace('btn_sch_slot_', '');
      const available = await d.slots(date!);
      // Botão antigo, de outra data ou de outra página não pode reservar um horário.
      if (!available.slice(Number(page ?? 0) * 7, Number(page ?? 0) * 7 + 7).some(slot => slot.dateTimeIso === iso)) { await say('Esse horário não está mais disponível. Escolha novamente.'); await showSlots(category!, date!); return; }
      try {
        const appointment = await d.book({ sessionId: s.id, categoryKey: category!, userName: s.userName, userCpf: s.userCpf, phoneNumber: phone, scheduledAtIso: iso, issueSummary: 'Solicitado pelo assistente virtual do PROCON de Jacareí' });
        await update({ stepState: null, currentStepId: null, isChat: false });
        const when = appointment.scheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' });
        await say(`Agendamento confirmado!\n\nData e horário: *${when}*\nNome: ${appointment.userName}\nCPF: ${maskCpf(appointment.userCpf)}\nAssunto: ${appointment.categoryName}\n\nLocal: ${process.env.PROCON_ENDERECO || 'Rua Capitão Joaquim Pinheiro do Prado, 222, Centro, Jacareí-SP'}.\n\nPara cancelar ou remarcar, fale com a equipe: (12) 3955-9130.`, [MENU_OPTION, { id: 'btn_evaluate', text: 'Avaliar atendimento' }]);
        const guide = appointment.documentGuide ?? DOCUMENT_GUIDES.find(item => item.categoryKey === category);
        if (guide) await say(`Documentos para o atendimento:\n${guide.requiredDocs.map((doc, i) => `${i + 1}. ${doc}`).join('\n')}\n\n${guide.observations ?? ''}\n\nPara continuar, digite *menu*.`, [MENU_OPTION]);
      } catch (error) {
        if (await pendingNotice()) return;
        console.error('Falha ao reservar horário:', error instanceof Error ? error.message : 'erro');
        await say('Não consegui reservar esse horário. Escolha uma nova vaga ou digite *menu* para sair.');
        await showSlots(category!, date!);
      }
      return;
    }
    const option = await d.db.option.findUnique({ where: { id: selected } });
    if (!option || option.stepId !== s.currentStepId) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
    await update({ isChat: false, stepState: null });
    await log('INBOUND', option.text, option.stepId);
    if (!option.nextStepId && normalize(option.text).includes('doc')) { await update({ currentStepId: null, stepState: 'DOC_SELECT' }); await d.documents(phone); return; }
    if (!option.nextStepId) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
    const step = await d.db.step.findUnique({ where: { id: option.nextStepId }, include: { options: { orderBy: { id: 'asc' } } } });
    if (!step) { await say(MSG_MENU_EXPIRADO); await showMenu(); return; }
    if (step.isStart) { await showMenu(true); return; }
    await update({ currentStepId: step.id, stepState: step.options.length ? null : 'POST_ANSWER' });
    if (step.options.length) { await say(step.message, step.options); return; }
    const [previous, edges] = await Promise.all([
      d.db.chatLog.findMany({ where: { sessionId: s.id, direction: 'INBOUND', stepId: { not: null } }, orderBy: { timestamp: 'desc' }, take: 50 }),
      d.db.option.findMany(),
    ]);
    const path = buildMenuPath(option, previous, edges);
    const rewritten = await d.rewrite(path || option.text, step.message);
    await say(rewritten, POST_ANSWER_OPTIONS);
  };
}
