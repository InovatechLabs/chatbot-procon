import { prisma } from '../../database/index.js';
import { createConversationHandler } from '../../controllers/webhook/conversation.js';
import { canGroupText, decodeSession } from '../conversation/state.js';
import { normalize } from '../../utils/intents/intents.js';
import type { IncomingMessage } from '../../controllers/webhook/conversation.js';
import { DurableInbox, DurableOutbox, queueOutgoing } from './durableMessages.js';
import { configureMessageQueue } from './outgoingContext.js';
import { expireInactiveSessions } from '../analytics/inactivity.js';
import { CHAT_OPTION, handoffAllowed, waitingForHuman } from '../conversation/handoff.js';

export async function canGroupIncoming(message: IncomingMessage) {
  if (handoffAllowed(message.from) && await waitingForHuman(prisma, message.from)) return false;
  const session = await prisma.userSession.findFirst({ where: { phoneNumber: message.from, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
  if (session) {
    const decoded = decodeSession(session);
    if (decoded.invalid || !canGroupText(decoded.snapshot.state) || decoded.snapshot.choices.some(option => option.id === CHAT_OPTION.id)) return false;
  }
  if (!session?.currentStepId) return true;
  const options = await prisma.option.findMany({ where: { stepId: session.currentStepId } });
  return !options.some(option => normalize(option.text) === normalize(message.text?.body ?? ''));
}

export function startMessageWorkers() {
  configureMessageQueue(payload => queueOutgoing(payload));
  let stopping = false;
  const inbox = new DurableInbox({ handle: createConversationHandler(), canGroup: canGroupIncoming });
  const outbox = new DurableOutbox();
  const loop = async (work: () => Promise<boolean>) => {
    while (!stopping) {
      let progressed = false;
      try { progressed = await work(); }
      catch (error) { console.error('Worker de mensagens indisponível:', error instanceof Error ? error.name : 'erro'); }
      if (!progressed) await new Promise(resolve => { const timer = setTimeout(resolve, 1000); timer.unref(); });
    }
  };
  let sweptAt = 0;
  const sweep = async () => {
    if (Date.now() - sweptAt >= 60_000) { sweptAt = Date.now(); await expireInactiveSessions(); }
    return false;
  };
  const running = [loop(() => inbox.runOne()), loop(() => inbox.runOne()), loop(() => outbox.runOne()), loop(() => outbox.runOne()), loop(sweep)];
  return async () => { stopping = true; await Promise.allSettled(running); };
}
