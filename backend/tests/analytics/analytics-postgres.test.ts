import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

test('eventos funcionais: fluxo real, cálculo agregado, privacidade, expiração e permissões', { skip: !process.env.ANALYTICS_TEST_DB_NAME }, async t => {
  const name = process.env.ANALYTICS_TEST_DB_NAME!; assert.match(name, /^procon_analytics_test_[a-z0-9_]+$/);
  const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${name}`; process.env.DATABASE_URL = url.toString();
  const { prisma, rootPrisma, inDatabaseTransaction } = await import('../../src/database/index.js');
  const { recordEvent } = await import('../../src/services/analytics/events.js');
  const { getFunctionalAnalytics } = await import('../../src/services/analytics/analyticsService.js');
  const { expireInactiveSessions } = await import('../../src/services/analytics/inactivity.js');
  const { createConversationHandler } = await import('../../src/controllers/webhook/conversation.js');
  const { DurableInbox, persistIncoming } = await import('../../src/services/whatsapp/durableMessages.js');
  const { initialSnapshot, persistable } = await import('../../src/services/conversation/state.js');
  const clear = async () => {
    await prisma.conversationEvent.deleteMany(); await prisma.outgoingMessage.deleteMany(); await prisma.messageReceipt.deleteMany();
    await prisma.sessionFeedback.deleteMany(); await prisma.appointment.deleteMany(); await prisma.chatLog.deleteMany(); await prisma.userSession.deleteMany();
  };
  try {
    await t.test('menu, avaliação, pedido humano e reserva geram eventos atômicos sem reentrega duplicada', async () => {
      await clear();
      const root = await prisma.step.create({ data: { id: 'event-root', title: 'Início', message: 'Menu', isStart: true } });
      const category = await prisma.step.create({ data: { id: 'event-category', title: 'Direitos', message: 'Escolha' } });
      const question = await prisma.step.create({ data: { id: 'event-question', title: 'Garantia', message: 'Resposta oficial fictícia' } });
      await prisma.option.createMany({ data: [{ id: 'event-cat', stepId: root.id, text: 'Direitos', nextStepId: category.id }, { id: 'event-faq', stepId: category.id, text: 'Garantia', nextStepId: question.id }] });
      const day = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
      await prisma.scheduleSettings.update({ where: { id: 'main' }, data: { workDays: [0, 1, 2, 3, 4, 5, 6], minLeadMinutes: 0 } });
      const handle = createConversationHandler({ dates: async () => [{ dateStr: day, label: 'Data fictícia' }], rewrite: async () => 'Resposta oficial fictícia' });
      const inbox = new DurableInbox({ handle, canGroup: async () => false });
      let sequence = 0;
      const receive = async (value: string, button = false) => {
        const message = { id: `event-${++sequence}`, from: '5511999999911', type: button ? 'interactive' : 'text', ...(button ? { interactive: { type: 'button_reply', button_reply: { id: value } } } : { text: { body: value } }) };
        await persistIncoming([message]); assert.equal(await inbox.runOne(), true); return message;
      };
      await receive('menu');
      assert.equal(await prisma.conversationEvent.count({ where: { kind: 'CONVERSATION_STARTED' } }), 1, 'menu inicial não abre duas sessões');
      await receive('event-cat', true); await receive('event-faq', true);
      await receive('btn_feedback_sim', true); await receive('btn_rate_5', true);
      await receive('btn_rate_5', true);
      assert.equal(await prisma.conversationEvent.count({ where: { kind: 'RATING_SUBMITTED' } }), 1);
      await receive('quero falar com um atendente');
      await receive('btn_agendar_sim', true); await receive('btn_sch_cat_GERAL', true);
      await receive('Pessoa Fictícia'); await receive('sim'); await receive('52998224725');
      await receive(`btn_sch_date_${day}`, true);
      const last = await receive(`btn_sch_slot_${day}T12:00:00.000Z`, true);
      const before = await prisma.conversationEvent.count();
      await persistIncoming([last]); assert.equal(await inbox.runOne(), false);
      assert.equal(await prisma.conversationEvent.count(), before);
      const report = await getFunctionalAnalytics(7);
      assert.equal(report.metrics.positive, 1); assert.equal(report.metrics.resolutionRate, 100);
      assert.equal(report.metrics.humanRequests, 1); assert.equal(report.metrics.appointments, 1);
      assert.equal(report.metrics.schedulingRate, 100); assert.equal(report.metrics.csat, 100);
      assert.equal(report.topQuestions[0]!.label, 'Garantia');
      assert.ok(!JSON.stringify(report).includes('52998224725')); assert.ok(!JSON.stringify(report).includes('5511999999911'));
      assert.ok(!JSON.stringify(report).includes('Pessoa Fictícia')); assert.ok(!JSON.stringify(report).includes('sessionId'));
      const existing = await prisma.conversationEvent.count();
      await assert.rejects(inDatabaseTransaction(async () => { await recordEvent(prisma, { kind: 'TURN_RECEIVED', sessionId: 'rollback-ficticio' }); throw new Error('rollback'); }));
      assert.equal(await prisma.conversationEvent.count(), existing);
    });

    await t.test('denominadores, dias de Brasília e dados vazios são calculados de eventos reais', async () => {
      await clear();
      const when = new Date('2026-11-16T03:00:00Z'); let sequence = 0;
      const add = async (kind: string, sessionId: string | null, extra: Record<string, unknown> = {}) => prisma.conversationEvent.create({ data: { kind, sessionId, dedupKey: `fixture-${++sequence}`, occurredAt: when, ...extra } });
      await add('CONVERSATION_STARTED', 'A'); await add('TURN_RECEIVED', 'A');
      await add('ANSWER_PREPARED', 'A', { answerKind: 'MENU', occurredAt: new Date('2026-11-16T02:59:00Z') });
      await add('ANSWER_PREPARED', 'B', { answerKind: 'clarificacao' });
      await add('USER_CONFIRMED_RESOLUTION', 'A'); await add('USER_CONFIRMED_RESOLUTION', 'A'); await add('USER_REJECTED_RESOLUTION', 'B');
      await add('RATING_SUBMITTED', 'A', { rating: 5 }); await add('RATING_SUBMITTED', 'B', { rating: 3 });
      await add('SCHEDULE_OFFERED', 'A'); await add('SCHEDULE_OFFERED', 'B');
      await add('APPOINTMENT_CREATED', 'A'); await add('APPOINTMENT_CREATED', null, { source: 'PANEL' });
      await add('SCHEDULE_OFFERED', 'D', { occurredAt: new Date('2026-11-01T03:00:00Z') }); await add('APPOINTMENT_CREATED', 'D');
      await add('HANDOFF_REQUESTED', 'B'); await add('HANDOFF_REQUESTED', 'B');
      await add('CONVERSATION_ABANDONED', 'B', { stage: 'MENU' });
      const report = await getFunctionalAnalytics(7, new Date('2026-11-17T02:30:00Z'));
      assert.equal(report.metrics.sessions, 3); assert.equal(report.metrics.answers, 2);
      assert.equal(report.metrics.resolutionRate, 66.7); assert.equal(report.metrics.csat, 50); assert.equal(report.metrics.averageRating, 4);
      assert.equal(report.metrics.offers, 2); assert.equal(report.metrics.scheduled, 1); assert.equal(report.metrics.schedulingRate, 50);
      assert.equal(report.metrics.appointments, 3); assert.equal(report.metrics.humanRequests, 1);
      assert.equal(report.daily.find(row => row.date === '2026-11-15')!.answers, 1);
      assert.equal(report.daily.find(row => row.date === '2026-11-16')!.answers, 1);
      assert.equal(report.daily.length, 7); assert.equal(report.expiredByStage[0]!.count, 1);
      const empty = await getFunctionalAnalytics(7, new Date('2040-01-01T15:00:00Z'));
      assert.equal(empty.metrics.sessions, 0); assert.equal(empty.metrics.resolutionRate, null);
      assert.equal(empty.metrics.schedulingRate, null); assert.equal(empty.metrics.csat, null);
      assert.ok(empty.daily.every(row => row.sessions === 0 && row.answers === 0));
    });

    await t.test('inatividade respeita coleta de 24h, fila pendente e deduplicação da expiração', async () => {
      await clear(); const now = new Date();
      const seed = async (phone: string, hours: number, scheduling = false) => prisma.userSession.create({ data: { phoneNumber: phone, updatedAt: new Date(now.getTime() - hours * 3600_000), ...persistable({ ...initialSnapshot(), state: scheduling ? { kind: 'SCHEDULE_NAME', category: 'GERAL' } : { kind: 'MENU' } }) } });
      for (let index = 0; index < 55; index++) await seed(`55119999${String(index).padStart(5, '0')}`, 12, true);
      const expired = await seed('5511999999922', 1);
      const pending = await seed('5511999999933', 1);
      await persistIncoming([{ id: 'pending-event', from: pending.phoneNumber, type: 'text', text: { body: 'menu' } }]);
      assert.equal(await expireInactiveSessions(now), 1);
      assert.equal((await prisma.userSession.findUniqueOrThrow({ where: { id: expired.id } })).status, 'RESOLVED');
      assert.equal((await prisma.userSession.findUniqueOrThrow({ where: { id: pending.id } })).status, 'OPEN');
      assert.equal(await prisma.userSession.count({ where: { status: 'OPEN' } }), 56);
      assert.equal(await expireInactiveSessions(now), 0);
      assert.equal(await prisma.conversationEvent.count({ where: { kind: 'CONVERSATION_ABANDONED' } }), 1);
    });

    await t.test('relatório HTTP é restrito a ADMIN e valida filtros', async () => {
      const { createApp } = await import('../../src/app.js');
      const { createAuthService } = await import('../../src/services/auth/authService.js');
      const { hashPassword } = await import('../../src/services/auth/password.js');
      const password = 'Senha-ficticia-eventos-123'; const passwordHash = await hashPassword(password);
      const admin = await prisma.panelUser.create({ data: { username: 'analytics-admin', passwordHash, role: 'ADMIN' } });
      const staff = await prisma.panelUser.create({ data: { username: 'analytics-staff', passwordHash, role: 'ATTENDANT' } });
      const auth = createAuthService(prisma);
      const adminToken = (await auth.login(admin.username, password, 'test-analytics')).token;
      const staffToken = (await auth.login(staff.username, password, 'test-analytics')).token;
      const server = createApp(auth, { origins: ['http://localhost:5173'], secure: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
      try {
        const address = server.address(); if (!address || typeof address === 'string') throw new Error('Porta ausente');
        const request = (token = '', query = '') => fetch(`http://127.0.0.1:${address.port}/api/analytics${query}`, { headers: { Cookie: `procon_session=${token}` } });
        assert.equal((await request()).status, 401); assert.equal((await request(staffToken)).status, 403);
        assert.equal((await request(adminToken, '?days=7')).status, 200);
        assert.equal((await request(adminToken, '?days=900')).status, 400);
        assert.equal((await request(adminToken, '?days=7&phone=5511999999999')).status, 400);
      } finally { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.panelUser.deleteMany(); }
    });
  } finally { await clear(); await rootPrisma.$disconnect(); }
});
