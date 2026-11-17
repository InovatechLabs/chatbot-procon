import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../src/database/index.js';
import { protectedPrisma } from '../src/services/privacy/protectedPrisma.js';
import { createConversationHandler } from '../src/controllers/webhook/conversation.js';
import { createRagService, DISCLAIMER } from '../src/services/llm/llmService.js';
import type { RagResult } from '../src/services/llm/llmService.js';
import { decodeSession } from '../src/services/conversation/state.js';
import { seedMenu } from '../prisma/seed/seed.js';

// Opt-in manual: usa as URLs de IA configuradas, mas nenhum telefone/dado de cidadão real.
const source = new URL(process.env.DATABASE_URL!);
const name = `procon_states_test_live_${randomBytes(8).toString('hex')}`;
const target = new URL(source); target.pathname = `/${name}`;
const admin = new Pool({ connectionString: source.toString() });
let created = false;
const db = protectedPrisma(new PrismaClient({ adapter: new PrismaPg({ connectionString: target.toString() }) }));
const phone = 'state-smoke-ficticio';
process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.DATA_LOOKUP_KEY = randomBytes(32).toString('base64');
const sent: string[] = [];
let result: RagResult | undefined;
let messageId = 0;
const rag = createRagService({ db }); // Recuperação consulta somente a base legal pública da instalação.
const overrides = {
  db,
  text: async (_phone: string, text: string) => { sent.push(text); },
  interactive: async (_phone: string, text: string) => { sent.push(text); },
  list: async (_phone: string, _title: string, text: string) => { sent.push(text); },
  pending: async () => null,
  answer: async (text: string, sessionId: string, options: { clarificationCount?: number } = {}) => {
    result = await rag(text, sessionId, { ...options, includeDiagnostics: true }); return result;
  },
};
const send = async (text: string, button = false) => {
  const handler = createConversationHandler(overrides); // Nova instância a cada turno.
  await handler({ id: `smoke-${++messageId}`, from: phone, type: button ? 'interactive' : 'text', ...(button ? { interactive: { type: 'button_reply', button_reply: { id: text } } } : { text: { body: text } }) });
  return db.userSession.findFirstOrThrow({ where: { phoneNumber: phone, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
};
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: target.toString() }, stdio: ['ignore', 'pipe', 'pipe'] });
  await seedMenu(db);
  console.log('Smoke real iniciado: banco descartável, menu oficial e mensagens fictícias; envio WhatsApp substituído por captura local.');
  const root = await db.step.findFirstOrThrow({ where: { isStart: true } });
  const edges = await db.option.findMany();
  const queue = [{ step: root.id, path: [] as string[] }]; const seen = new Set<string>();
  let path: string[] | undefined;
  while (queue.length) {
    const node = queue.shift()!;
    if (node.step === 'faq-01') { path = node.path; break; }
    if (seen.has(node.step)) continue;
    seen.add(node.step);
    for (const edge of edges.filter(edge => edge.stepId === node.step && edge.nextStepId)) queue.push({ step: edge.nextStepId!, path: [...node.path, edge.id] });
  }
  assert.ok(path?.length, 'Resposta oficial acessível pelo menu');
  await send('menu');
  for (const button of path) await send(button, true);
  const menuSession = await db.userSession.findFirstOrThrow({ where: { phoneNumber: phone, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
  assert.equal(decodeSession(menuSession).snapshot.state.kind, 'POST_ANSWER');
  console.log('Menu: navegação e estado POST_ANSWER OK; resposta:', sent.at(-1)?.includes(DISCLAIMER) ? 'reescrita pela IA' : 'fonte oficial preservada');
  await send('menu');
  for (const text of ['Cancelei um serviço e a empresa continua me cobrando, mesmo depois de confirmar o cancelamento.', 'Eu paguei essa cobrança depois do cancelamento. Posso pedir a devolução?']) {
    result = undefined;
    const session = await send(text);
    const answer = result as RagResult | undefined;
    assert.ok(answer && answer.tipoResposta !== 'fixa', 'O pipeline real deve responder sem falha técnica');
    const state = decodeSession(session).snapshot.state;
    assert.ok(['POST_ANSWER', 'SCHEDULE_OFFER', 'FREE_CHAT'].includes(state.kind));
    console.log(JSON.stringify({ etapa: 'chat livre', resposta: answer.tipoResposta, artigo: answer.artigo, estado: state.kind, descarte: answer.diagnostics?.motivoDescarte ?? null }));
  }
  console.log('Smoke real concluído: menu, conversa livre e continuação após recriar handler.');
} catch (error) {
  console.error('Smoke real não concluído:', error instanceof Error ? error.message.split('\n')[0] : 'erro'); process.exitCode = 1;
} finally {
  await db.$disconnect(); await prisma.$disconnect();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
