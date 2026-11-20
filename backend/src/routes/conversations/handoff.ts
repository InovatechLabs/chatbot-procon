import { Router } from 'express';
import { z } from 'zod';
import { AuthError, type AuthService } from '../../services/auth/authService.js';
import { sessionCookie } from '../auth/auth.js';
import { handoffEnabled } from '../../services/conversation/handoff.js';
import { botConversationHistory, changeHandoff, getHandoffAudio, handoffHistory, handoffStreamSnapshot, listBotConversations, listHandoffs, sendHandoffMessage } from '../../services/conversation/handoffControl.js';
import { charLength } from '../../services/whatsapp/messagePolicy.js';
import { downloadWhatsAppAudio } from '../../services/whatsapp/downloadAudio.js';

const version = z.number().int().min(1);
const cursor = z.uuid().optional();
const transition = z.object({ version }).strict();
const message = z.object({ version, requestId: z.uuid(), text: z.string().trim().min(1).max(8192).refine(text => charLength(text) <= 4096) }).strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AuthError(400, 'Dados de atendimento inválidos.');
  return result.data;
}

export function createHandoffRouter(auth: AuthService) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!handoffEnabled()) { res.status(404).json({ error: 'Atendimento por chat indisponível.' }); return; }
    next();
  });
  router.get('/', async (req, res) => {
    res.json(await listHandoffs(res.locals.panelUser, parse(cursor, req.query.cursor), parse(z.enum(['waiting', 'active', 'history']).optional(), req.query.view)));
  });
  router.get('/bot', async (req, res) => { res.json(await listBotConversations(parse(cursor, req.query.cursor))); });
  router.get('/bot/:id/messages', async (req, res) => { res.json(await botConversationHistory(parse(z.uuid(), req.params.id), parse(cursor, req.query.cursor))); });
  router.get('/events', (req, res) => {
    const selected = parse(cursor, req.query.selected);
    const selectedBot = parse(cursor, req.query.selectedBot);
    const cookie = sessionCookie(req.headers.cookie);
    res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    let closed = false;
    let revision: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    res.on('close', () => { closed = true; clearTimeout(timer); });
    const tick = async () => {
      try {
        const actor = await auth.current(cookie);
        if (closed) return;
        if (!actor || actor.mustChangePassword || !handoffEnabled()) {
          res.write(`event: access-changed\ndata: ${JSON.stringify({ reason: !actor || actor.mustChangePassword ? 'session' : 'feature' })}\n\n`);
          res.end();
          return;
        }
        const next = await handoffStreamSnapshot(actor, selected, selectedBot, req.query.watchBot === 'true');
        if (closed) return;
        // Um painel lento reconecta e refaz o snapshot em vez de acumular dados.
        const writable = next.revision !== revision
          ? res.write(`event: refresh\ndata: ${JSON.stringify({ waiting: next.waiting, latestRequestedAt: next.latestRequestedAt })}\n\n`)
          : res.write(': heartbeat\n\n');
        if (!writable) { res.end(); return; }
        revision = next.revision;
        timer = setTimeout(() => void tick(), 2500);
      } catch { if (!closed) res.end(); }
    };
    void tick();
  });
  router.get('/:id/messages', async (req, res) => {
    res.json(await handoffHistory(parse(z.uuid(), req.params.id), res.locals.panelUser, parse(cursor, req.query.cursor)));
  });
  router.get('/:id/messages/:messageId/audio', async (req, res) => {
    const id = parse(z.uuid(), req.params.id);
    const messageId = parse(z.uuid(), req.params.messageId);
    const mediaId = await getHandoffAudio(id, messageId, res.locals.panelUser);
    const controller = new AbortController();
    res.once('close', () => controller.abort());
    const { body, mime } = await downloadWhatsAppAudio(mediaId, controller.signal);
    if (controller.signal.aborted) return;
    const actor = await auth.current(sessionCookie(req.headers.cookie));
    if (!actor) throw new AuthError(401, 'Entre no painel para continuar.');
    if (actor.mustChangePassword) throw new AuthError(403, 'Altere a senha temporária antes de acessar o painel.');
    await getHandoffAudio(id, messageId, actor);
    res.set({ 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff' }).send(body);
  });
  router.post('/:id/messages', async (req, res) => {
    res.status(202).json(await sendHandoffMessage(parse(z.uuid(), req.params.id), res.locals.panelUser, parse(message, req.body)));
  });
  for (const change of ['claim', 'close', 'return'] as const) {
    router.post(`/:id/${change}`, async (req, res) => {
      res.json(await changeHandoff(parse(z.uuid(), req.params.id), res.locals.panelUser, parse(transition, req.body).version, change));
    });
  }
  return router;
}
