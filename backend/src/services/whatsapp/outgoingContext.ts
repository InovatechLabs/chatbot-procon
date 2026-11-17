import { AsyncLocalStorage } from 'node:async_hooks';
export type MetaPayload = { to: string; [key: string]: unknown };
export type MessageSender = (payload: MetaPayload) => Promise<unknown>;
const context = new AsyncLocalStorage<MessageSender>();
let durableSender: MessageSender | undefined;
export const configureMessageQueue = (sender: MessageSender) => { durableSender = sender; };
export const withMessageSender = <T>(sender: MessageSender, work: () => Promise<T>) => context.run(sender, work);
export function messageSender(): MessageSender | undefined { return context.getStore() ?? durableSender; }
