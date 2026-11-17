import type { PrismaClient } from '@prisma/client';
import { decrypt, encrypt, lookupHash } from './crypto.js';

export const protectedFields: Record<string, readonly string[]> = {
  MessageReceipt: ['phoneNumber', 'payload'],
  OutgoingMessage: ['phoneNumber', 'payload'],
  ScheduleBlock: ['note'],
  UserSession: ['phoneNumber', 'userName', 'userCpf'],
  ChatLog: ['phoneNumber', 'messageText'],
  Appointment: ['phoneNumber', 'userName', 'userCpf', 'citizenName', 'subject', 'categoryName', 'issueSummary', 'notes', 'agentNotes'],
  SessionFeedback: ['phoneNumber', 'comment', 'agentFeedback', 'resolvedAction'],
};
const relations: Record<string, Record<string, string>> = {
  UserSession: { chatLogs: 'ChatLog', appointments: 'Appointment', feedbacks: 'SessionFeedback', currentStep: 'Step' },
  ChatLog: { session: 'UserSession', step: 'Step' },
  Appointment: { session: 'UserSession' }, SessionFeedback: { session: 'UserSession' },
  Step: { activeSessions: 'UserSession', chatLogs: 'ChatLog' }, Attendant: { appointments: 'Appointment' }, DocumentGuide: { appointments: 'Appointment' },
};
const hashField = (field: string) => field === 'phoneNumber' ? 'phoneLookup' : 'cpfLookup';
function filterValue(field: 'phoneNumber' | 'userCpf', value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return lookupHash(field, value);
  if (Array.isArray(value)) return value.map(v => filterValue(field, v));
  if (typeof value !== 'object' || Object.keys(value).some(key => !['equals', 'in', 'notIn', 'not'].includes(key))) throw new Error('Filtro incompatível com identificador protegido.');
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, filterValue(field, v)]));
}
function where(model: string, input: any): any {
  if (!input || typeof input !== 'object' || input instanceof Date) return input;
  if (Array.isArray(input)) return input.map(item => where(model, item));
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (['AND', 'OR', 'NOT', 'is', 'isNot', 'some', 'every', 'none'].includes(key)) return [key, where(model, value)];
    if (relations[model]?.[key]) return [key, where(relations[model]![key]!, value)];
    if ((key === 'phoneNumber' || key === 'userCpf') && protectedFields[model]?.includes(key)) return [hashField(key), filterValue(key, value)];
    if (protectedFields[model]?.includes(key)) throw new Error('Busca textual em campo criptografado não é permitida.');
    return [key, value];
  }));
}
export function protectData(model: string, input: any): any {
  if (Array.isArray(input)) return input.map(row => protectData(model, row));
  const data = { ...input };
  for (const [key, value] of Object.entries(data)) {
    if (key === 'phoneLookup' || key === 'cpfLookup') throw new Error('Índices pessoais são gerados pelo servidor.');
    if (relations[model]?.[key] && value && typeof value === 'object' && Object.keys(value).some(op => !['connect', 'disconnect'].includes(op))) throw new Error('Use o repositório do modelo para gravar dados pessoais; escrita aninhada não é permitida.');
    if (!protectedFields[model]?.includes(key) || value === undefined) continue;
    const plain = value && typeof value === 'object' && 'set' in value ? (value as any).set : value;
    if (plain !== null && typeof plain !== 'string') throw new Error('Valor inválido em campo protegido.');
    data[key] = plain === null ? null : encrypt(plain, `${model}.${key}`);
    if (key === 'phoneNumber' || key === 'userCpf') data[hashField(key)] = plain === null ? null : lookupHash(key, plain);
  }
  return data;
}
function result(model: string, row: any): any {
  if (!row || typeof row !== 'object' || row instanceof Date) return row;
  if (Array.isArray(row)) return row.map(item => result(model, item));
  const output = { ...row };
  delete output.phoneLookup; delete output.cpfLookup;
  for (const field of protectedFields[model] ?? []) if (typeof output[field] === 'string') output[field] = decrypt(output[field], `${model}.${field}`);
  for (const [field, related] of Object.entries(relations[model] ?? {})) if (output[field]) output[field] = result(related, output[field]);
  return output;
}
function selection(model: string, args: any) {
  for (const type of ['select', 'include']) if (args[type]) for (const [field, value] of Object.entries(args[type])) {
    const related = relations[model]?.[field];
    if (related && value && typeof value === 'object') args[type][field] = prepare(related, 'findMany', value);
  }
}
export function prepare(model: string, operation: string, input: any) {
  const args = structuredClone(input ?? {});
  if (args.where) args.where = where(model, args.where);
  if (args.cursor) args.cursor = where(model, args.cursor);
  if (protectedFields[model]) {
    // Agregações/ordenação por texto pessoal não possuem semântica sobre ciphertext.
    const serialized = JSON.stringify([args.orderBy, args.by, args.having, args._min, args._max]);
    if (protectedFields[model]!.some(field => serialized.includes(`"${field}"`))) throw new Error('Ordenação/agregação pessoal não suportada.');
  }
  for (const key of ['data', 'create', 'update']) if (args[key]) args[key] = protectData(model, args[key]);
  selection(model, args);
  return args;
}
export function protectedPrisma(client: PrismaClient): PrismaClient {
  return client.$extends({ name: 'personal-data-protection', query: { $allModels: {
    async $allOperations({ model, operation, args, query }) {
      const output = await query(prepare(model, operation, args));
      return result(model, output);
    },
  } } }) as unknown as PrismaClient;
}
