import type { IncomingMessage } from './conversation.js';
import { normalize, MENU_CMDS, EXIT_CMDS, YES, NO, isGreeting, isThanks, isCrisis, isHumanRequest, isAmbiguousServiceRequest, isLogistics, isScheduleChange } from '../../utils/intents/intents.js';

export const canDebounce = (message: IncomingMessage) => {
  if (message.type !== 'text') return false;
  const raw = message.text?.body ?? '';
  const n = normalize(raw);
  return !MENU_CMDS.has(n) && !EXIT_CMDS.has(n) && !YES.has(n) && !NO.has(n)
    && !/^\d+$/.test(n) && !isGreeting(n) && !isThanks(raw, n) && !isCrisis(n)
    && !isHumanRequest(n) && !isAmbiguousServiceRequest(n) && !isLogistics(n) && !isScheduleChange(n);
};

/** @deprecated Utilitário legado para fixtures. O webhook de produção usa DurableInbox
 * e locks PostgreSQL; esta classe não oferece durabilidade entre processos.
 */
export class MessageInbox {
  private queues = new Map<string, { message: IncomingMessage; resolve: () => void }[]>();
  private seen = new Map<string, number>();
  constructor(private handle: (message: IncomingMessage, hasNewerText: () => Promise<boolean>) => Promise<void>,
    private canGroup: (message: IncomingMessage) => Promise<boolean>, private debounceMs = 5000,
    private onError: (message: IncomingMessage, error: unknown) => Promise<void> = async () => {}) {}

  enqueue(message: IncomingMessage): Promise<void> {
    const now = Date.now();
    for (const [id, timestamp] of this.seen) if (now - timestamp > 600_000) this.seen.delete(id);
    if (message.id && this.seen.has(message.id)) return Promise.resolve();
    if (message.id) this.seen.set(message.id, now);
    if (this.seen.size > 10_000) this.seen.delete(this.seen.keys().next().value!);
    return new Promise(resolve => {
      const queue = this.queues.get(message.from);
      if (queue) queue.push({ message, resolve });
      else {
        this.queues.set(message.from, [{ message, resolve }]);
        void this.drain(message.from);
      }
    });
  }

  private async drain(phone: string) {
    const queue = this.queues.get(phone)!;
    while (queue.length) {
      const first = queue[0]!;
      let count = 1;
      try {
        if (canDebounce(first.message) && await this.canGroup(first.message)) {
          await new Promise(resolve => setTimeout(resolve, this.debounceMs));
          while (count < queue.length && canDebounce(queue[count]!.message) && await this.canGroup(queue[count]!.message)) count++;
        }
        const message = count > 1 ? { ...first.message, text: { body: queue.slice(0, count).map(item => item.message.text!.body).join('\n') } } : first.message;
        await this.handle(message, async () => {
          const next = queue[count]?.message;
          return !!next && canDebounce(next) && await this.canGroup(next);
        });
      } catch (error) {
        try { await this.onError(first.message, error); }
        catch (sendError) { console.error('Falha ao informar indisponibilidade:', sendError instanceof Error ? sendError.name : 'erro'); }
      } finally {
        queue.splice(0, count).forEach(item => item.resolve());
      }
    }
    this.queues.delete(phone);
  }
}
