import { cleanAndValidateCpf, validateFullName } from '../../utils/validators/index.js';
import { querSair, YES, NO } from '../../utils/intents/intents.js';
import { MENU_OPTION, maskCpf } from '../whatsapp/messagePolicy.js';
import { MSG_MENU_EXPIRADO, MSG_NOME_INVALIDO, MSG_CPF_INVALIDO, MSG_SAIDA_AGENDAMENTO } from '../llm/helpers/fixedResponses.js';
import { DOCUMENT_GUIDES } from '../documents/documentGuides.js';
import { categorySchema } from './state.js';
import type { ScheduleCategory } from './state.js';
import type { ConversationContext } from './context.js';

export function createSchedulingHandler(context: ConversationContext) {
  const { d, update, choices, say, showMenu, pendingNotice, phone } = context;
    const showDates = async (category: ScheduleCategory, intro = '') => {
      // Só apresenta dias com vagas, sem repetir cinco dias lotados.
      const days = await d.dates();
      const freeDays = [];
      for (const day of days) {
        if ((await d.slots(day.dateStr)).length) freeDays.push(day);
        if (freeDays.length === 5) break;
      }
      if (!freeDays.length) {
        await update({ kind: 'READY' });
        await say('Não encontrei vagas nos próximos 90 dias. Para consultar novas datas, fale com o PROCON: (12) 3955-9130. Nenhum horário foi reservado.', [MENU_OPTION]);
        return;
      }
      await update({ kind: 'SCHEDULE_DATE', category });
      const rows = freeDays.map(day => ({ id: `btn_sch_date_${day.dateStr}`, title: day.label }));
      await choices(rows.map(row => ({ id: row.id, text: row.title })));
      await d.list(phone, 'Datas disponíveis', `${intro}Escolha o dia do atendimento. Para sair, digite *menu*.`, 'Ver datas', [{ title: 'Dias com vagas', rows }]);
    };
    const showSlots = async (category: ScheduleCategory, date: string, page = 0) => {
      const slots = await d.slots(date);
      if (!slots.length) return showDates(category, 'As vagas dessa data foram preenchidas. ');
      const pages = Math.ceil(slots.length / 7);
      page = Math.min(Math.max(0, page), pages - 1);
      await update({ kind: 'SCHEDULE_SLOT', category, date, page });
      const rows = slots.slice(page * 7, page * 7 + 7).map(slot => ({ id: `btn_sch_slot_${slot.dateTimeIso}`, title: slot.time, description: slot.durationMin ? `${slot.durationMin} min · Atendimento presencial` : 'Atendimento presencial' }));
      if (page > 0) rows.push({ id: `btn_sch_page_${page - 1}`, title: 'Horários anteriores', description: 'Ver outra página' });
      if (page + 1 < pages) rows.push({ id: `btn_sch_page_${page + 1}`, title: 'Mais horários', description: 'Ver outra página' });
      rows.push({ id: 'btn_sch_dates', title: 'Outra data', description: 'Voltar à escolha do dia' });
      await choices(rows.map(row => ({ id: row.id, text: row.title })));
      await d.list(phone, 'Horários disponíveis', `Dia ${date.split('-').reverse().join('/')} — página ${page + 1} de ${pages}. Escolha um horário. Para sair, digite *menu*.`, 'Ver horários', [{ title: 'Horários', rows }]);
    };


  async function handleText(raw: string, n: string): Promise<{ handled: boolean; selection?: string }> {
    const state = context.snapshot().state;
    if (state.kind === 'SCHEDULE_NAME') {
      if (querSair(n, raw)) { await say(MSG_SAIDA_AGENDAMENTO, [MENU_OPTION]); return { handled: true }; }
      if (!validateFullName(raw)) { await say(MSG_NOME_INVALIDO); return { handled: true }; }
      await update({ kind: 'SCHEDULE_NAME_CONFIRM', category: state.category }, { userName: raw });
      await say(`O nome para o atendimento é *${raw}*?`, [{ id: 'btn_sch_name_yes', text: 'Sim, está certo' }, { id: 'btn_sch_name_no', text: 'Corrigir nome' }, MENU_OPTION]);
      return { handled: true };
    }
    if (state.kind === 'SCHEDULE_NAME_CONFIRM') {
      if (YES.has(n) || n === 'sim esta certo') return { handled: false, selection: 'btn_sch_name_yes' };
      if (NO.has(n) || n === 'corrigir nome') return { handled: false, selection: 'btn_sch_name_no' };
      await say('Confirme o nome pelos botões ou digite *sim*, *não* ou *menu*.'); return { handled: true };
    }
    if (state.kind === 'SCHEDULE_CPF') {
      if (querSair(n, raw)) { await say(MSG_SAIDA_AGENDAMENTO, [MENU_OPTION]); return { handled: true }; }
      const cpf = cleanAndValidateCpf(raw);
      if (!cpf) { await say(MSG_CPF_INVALIDO); return { handled: true }; }
      await update(state, { userCpf: cpf });
      await showDates(state.category, 'CPF registrado. '); return { handled: true };
    }
    return { handled: false };
  }

  async function handleSelection(selected: string): Promise<boolean> {
    const flow = context.snapshot(); const s = context.session();
    if (selected.startsWith('btn_sch_cat_')) {
      const category = categorySchema.safeParse(selected.replace('btn_sch_cat_', ''));
      if (flow.state.kind !== 'SCHEDULE_CATEGORY' || !category.success) { await say(MSG_MENU_EXPIRADO); await showMenu(); return true; }
      await update({ kind: 'SCHEDULE_NAME', category: category.data });
      await context.event({ kind: 'CATEGORY_SELECTED', categoryKey: category.data });
      await say('Usaremos seu nome e CPF para registrar o agendamento e identificar seu atendimento. A conversa acontece pelo WhatsApp.\n\nDigite o nome e sobrenome da pessoa que será atendida. Para sair, digite *menu*.'); return true;
    }
    if (selected === 'btn_sch_name_yes' || selected === 'btn_sch_name_no') {
      if (flow.state.kind !== 'SCHEDULE_NAME_CONFIRM') { await say(MSG_MENU_EXPIRADO); await showMenu(); return true; }
      const category = flow.state.category;
      const confirmed = selected === 'btn_sch_name_yes';
      await update({ kind: confirmed ? 'SCHEDULE_CPF' : 'SCHEDULE_NAME', category });
      await say(confirmed ? 'Digite o CPF da pessoa que será atendida, com 11 números. Usaremos esse dado para o agendamento. Para sair, digite *menu*.' : 'Digite novamente o nome e sobrenome. Para sair, digite *menu*.'); return true;
    }
    if (selected.startsWith('btn_sch_date_')) {
      const date = selected.replace('btn_sch_date_', '');
      if (flow.state.kind !== 'SCHEDULE_DATE' || !(await d.dates()).some(day => day.dateStr === date)) { await say(MSG_MENU_EXPIRADO); await showMenu(); return true; }
      await showSlots(flow.state.category, date); return true;
    }
    if (selected === 'btn_sch_dates' || selected.startsWith('btn_sch_page_')) {
      if (flow.state.kind !== 'SCHEDULE_SLOT') { await say(MSG_MENU_EXPIRADO); await showMenu(); return true; }
      const { category, date } = flow.state;
      if (selected === 'btn_sch_dates') await showDates(category!);
      else {
        const page = Number(selected.replace('btn_sch_page_', ''));
        if (Number.isInteger(page)) await showSlots(category!, date!, page);
        else await showMenu();
      }
      return true;
    }
    if (selected.startsWith('btn_sch_slot_')) {
      if (flow.state.kind !== 'SCHEDULE_SLOT' || !s.userName || !s.userCpf) { await say(MSG_MENU_EXPIRADO); await showMenu(); return true; }
      const { category, date, page } = flow.state;
      const iso = selected.replace('btn_sch_slot_', '');
      const available = await d.slots(date!);
      // Botão antigo, de outra data ou de outra página não pode reservar um horário.
      if (!available.slice(Number(page ?? 0) * 7, Number(page ?? 0) * 7 + 7).some(slot => slot.dateTimeIso === iso)) { await say('Esse horário não está mais disponível. Escolha novamente.'); await showSlots(category!, date!); return true; }
      try {
        const appointment = await d.book({ sessionId: s.id, categoryKey: category!, userName: s.userName, userCpf: s.userCpf, phoneNumber: phone, scheduledAtIso: iso, issueSummary: 'Solicitado pelo assistente virtual do PROCON de Jacareí' });
        await context.refresh();
        await update({ kind: 'READY' }, { currentStepId: null, isChat: false });
        const when = appointment.scheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' });
        await say(`Agendamento confirmado!\n\nData e horário: *${when}*\nNome: ${appointment.userName}\nCPF: ${maskCpf(appointment.userCpf)}\nAssunto: ${appointment.categoryName}\n\nLocal: ${process.env.PROCON_ENDERECO || 'Rua Capitão Joaquim Pinheiro do Prado, 222, Centro, Jacareí-SP'}.\n\nPara cancelar ou remarcar, fale com a equipe: (12) 3955-9130.`, [MENU_OPTION, { id: 'btn_evaluate', text: 'Avaliar atendimento' }]);
        const guide = appointment.documentGuide ?? DOCUMENT_GUIDES.find(item => item.categoryKey === category);
        if (guide) await say(`Documentos para o atendimento:\n${guide.requiredDocs.map((doc, i) => `${i + 1}. ${doc}`).join('\n')}\n\n${guide.observations ?? ''}\n\nPara continuar, digite *menu*.`, [MENU_OPTION]);
      } catch (error) {
        if (await pendingNotice()) return true;
        console.error('Falha ao reservar horário:', error instanceof Error ? error.name : 'erro');
        await say('Não consegui reservar esse horário. Escolha uma nova vaga ou digite *menu* para sair.');
        await showSlots(category!, date!);
      }
      return true;
    }
    return false;
  }
  async function reoffer(): Promise<boolean> {
    const state = context.snapshot().state;
    if (state.kind === 'SCHEDULE_DATE') { await showDates(state.category, 'Confira as opções disponíveis novamente. '); return true; }
    if (state.kind === 'SCHEDULE_SLOT') { await showSlots(state.category, state.date, state.page); return true; }
    return false;
  }
  return { handleText, handleSelection, reoffer };
}
