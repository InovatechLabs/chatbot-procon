import type { ConversationContext } from './context.js';
import { MENU_OPTION } from '../whatsapp/messagePolicy.js';
import { MSG_MENU_EXPIRADO } from '../llm/helpers/fixedResponses.js';
export const ratingOptions = [
  { id: 'btn_rate_5', text: 'Ajudou' }, { id: 'btn_rate_3', text: 'Mais ou menos' }, { id: 'btn_rate_1', text: 'Não ajudou' },
];

export function createFeedbackHandler(context: ConversationContext) {
  const { d, update, atomicUpdate, say, showMenu, phone } = context;
  async function handleText(raw: string, n: string): Promise<boolean> {
    const flow = context.snapshot(); const s = context.session();
        if (flow.state.kind === 'FEEDBACK_COMMENT' && !raw.includes('?') && !/\b(comprei|contratei|cobraram|prazo|quero saber|como faco)\b/.test(n)) {
          const feedback = await d.db.sessionFeedback.findFirst({ where: { sessionId: s.id }, orderBy: { createdAt: 'desc' } });
          await atomicUpdate({ kind: 'READY' }, async tx => {
            if (feedback) await tx.sessionFeedback.update({ where: { id: feedback.id }, data: { comment: raw } });
          });
          await say('Obrigado pelo comentário! Para continuar, escreva sua dúvida ou digite *menu*.', [MENU_OPTION]); return true;
        }
    return false;
  }
  async function handleSelection(selected: string): Promise<boolean> {
    const flow = context.snapshot(); const s = context.session();
    if (selected === 'btn_feedback_sim' || selected === 'btn_evaluate') {
      if ((selected === 'btn_feedback_sim' && flow.state.kind !== 'POST_ANSWER') || (selected === 'btn_evaluate' && !['READY', 'POST_ANSWER', 'RATING'].includes(flow.state.kind))) { await say(MSG_MENU_EXPIRADO, flow.choices); return true; }
      if (selected === 'btn_feedback_sim') await context.event({ kind: 'USER_CONFIRMED_RESOLUTION' });
      await update({ kind: 'RATING' });
      await say('Se quiser, avalie como a orientação ajudou. Você também pode continuar pelo menu.', ratingOptions); return true;
    }
    if (selected === 'btn_feedback_nao') {
      if (flow.state.kind !== 'POST_ANSWER') { await say(MSG_MENU_EXPIRADO, flow.choices); return true; }
      await context.event({ kind: 'USER_REJECTED_RESOLUTION' });
      await update({ kind: 'SCHEDULE_OFFER' });
      await say('Se precisar, a equipe pode analisar seu caso presencialmente. Quer agendar?', [{ id: 'btn_agendar_sim', text: 'Agendar atendimento' }, MENU_OPTION]); return true;
    }
    if (selected.startsWith('btn_rate_')) {
      if (flow.state.kind !== 'RATING') { await say('Essa avaliação já foi concluída. Para continuar, digite *menu*.', flow.choices); return true; }
      const rating = Number(selected.replace('btn_rate_', ''));
      if (![1, 3, 5].includes(rating)) { await showMenu(); return true; }
      await atomicUpdate({ kind: 'READY' }, async tx => {
        await tx.sessionFeedback.create({ data: { sessionId: s.id, phoneNumber: phone, rating } });
        const { recordEvent } = await import('../analytics/events.js');
        await recordEvent(tx, { kind: 'RATING_SUBMITTED', sessionId: s.id, rating: rating as 1 | 3 | 5 });
      });
      await say('Obrigado pela avaliação! Você pode continuar pelo menu.', rating === 1 ? [{ id: 'btn_comment', text: 'Deixar comentário' }, MENU_OPTION] : [MENU_OPTION]); return true;
    }
    if (selected === 'btn_comment') {
      if (flow.state.kind !== 'READY') { await say(MSG_MENU_EXPIRADO, flow.choices); return true; }
      const feedback = await d.db.sessionFeedback.findFirst({ where: { sessionId: s.id }, orderBy: { createdAt: 'desc' } });
      if (!feedback || feedback.rating !== 1 || feedback.comment) { await say(MSG_MENU_EXPIRADO, flow.choices); return true; }
      await update({ kind: 'FEEDBACK_COMMENT' });
      await say('Escreva seu comentário sobre o atendimento. Se tiver outra dúvida, digite *menu* para continuar.', [MENU_OPTION]); return true;
    }
    return false;
  }
  return { handleText, handleSelection };
}
