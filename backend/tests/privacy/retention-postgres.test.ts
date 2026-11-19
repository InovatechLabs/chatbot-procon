import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { retentionPlan } from '../../src/services/privacy/retention.js';

test('PostgreSQL: retenção preserva trabalho, vínculos e revisão; TTL é explícito e idempotente', { skip: !process.env.PRIVACY_TEST_DB_NAME }, async () => {
  const name = process.env.PRIVACY_TEST_DB_NAME!;
  assert.match(name, /^procon_privacy_test_[a-z0-9_]+$/);
  const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${name}`;
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  const prefix = randomUUID();
  const now = new Date('2026-11-18T12:00:00Z');
  const old = new Date(now.getTime() - 100 * 86400_000);
  const recent = new Date(now.getTime() - 86400_000);
  const sessions: string[] = [], receipts: string[] = [], outgoing: string[] = [];
  const phone = (suffix: string) => `${prefix}:${suffix}`;
  const receipt = async (state: string, suffix: string, processedAt: Date | null = old) => {
    const row = await db.messageReceipt.create({ data: { metaMessageId: phone(suffix), phoneNumber: 'fixture', phoneLookup: phone(suffix), state, processedAt, createdAt: old, ...(state === 'PROCESSING' ? { leaseToken: 'fixture-processing', leaseUntil: recent } : {}) } });
    receipts.push(row.id); return row;
  };
  const output = async (state: string, suffix: string, sentAt: Date | null = old, receiptId?: string) => {
    const row = await db.outgoingMessage.create({ data: { phoneNumber: 'fixture', phoneLookup: phone(suffix), state, sentAt, createdAt: old, receiptId: receiptId ?? null } });
    outgoing.push(row.id); return row;
  };
  const session = async (suffix: string, hash: string | null = phone(suffix)) => {
    const row = await db.userSession.create({ data: { phoneNumber: 'fixture', phoneLookup: hash, updatedAt: old } });
    sessions.push(row.id); return row;
  };
  try {
    const removableSession = await session('clean');
    await db.chatLog.create({ data: { sessionId: removableSession.id, phoneNumber: 'fixture', direction: 'INBOUND', messageText: 'Relato fictício' } });
    const missingHash = await session('legacy', null);
    const protectedSessions: string[] = [missingHash.id];
    for (const state of ['PENDING', 'PROCESSING', 'DEAD']) {
      await receipt(state, `receipt-${state}`);
      protectedSessions.push((await session(`receipt-${state}`)).id);
    }
    for (const state of ['PENDING', 'SENDING', 'DEAD', 'UNKNOWN']) {
      await output(state, `output-${state}`);
      protectedSessions.push((await session(`output-${state}`)).id);
    }
    const oldDone = await receipt('DONE', 'done');
    const oldSkipped = await receipt('SKIPPED', 'skipped');
    const freshDone = await receipt('DONE', 'fresh-done', recent);
    const noDate = await receipt('DONE', 'no-date', null);
    const linked = await receipt('DONE', 'linked');
    const blockedLinked = await receipt('DONE', 'blocked-linked');
    const sent = await output('SENT', 'linked', old, linked.id);
    const unresolved = await output('UNKNOWN', 'blocked-linked', old, blockedLinked.id);
    const freshSent = await output('SENT', 'fresh-sent', recent);
    const noSentDate = await output('SENT', 'no-sent-date', null);
    const leased = await output('SENT', 'leased');
    await db.outgoingMessage.update({ where: { id: leased.id }, data: { leaseToken: 'fixture-lease', leaseUntil: recent } });

    const disabled = await retentionPlan(db, {}, true, now);
    assert.equal(disabled.sessions + disabled.receipts + disabled.outgoing, 0);
    for (const policy of [{ receiptsDays: 0 }, { outgoingDays: -1 }, { receiptsDays: NaN }, { outgoingDays: 1.5 }]) {
      await assert.rejects(retentionPlan(db, policy, true, now));
    }
    const policy = { sessionsDays: 90, receiptsDays: 90, outgoingDays: 90 };
    const dry = await retentionPlan(db, policy, false, now);
    assert.equal(dry.receipts, 2); // Vínculos existentes continuam protegidos na simulação.
    assert.equal(dry.outgoing, 1); assert.equal(dry.sessions, 1);
    assert.ok(await db.messageReceipt.findUnique({ where: { id: oldDone.id } }));
    assert.ok(await db.userSession.findUnique({ where: { id: removableSession.id } }));
    const applied = await retentionPlan(db, policy, true, now);
    assert.equal(applied.receipts, 3); assert.equal(applied.outgoing, 1); assert.equal(applied.sessions, 1);
    for (const id of [oldDone.id, oldSkipped.id, linked.id]) assert.equal(await db.messageReceipt.findUnique({ where: { id } }), null);
    assert.equal(await db.outgoingMessage.findUnique({ where: { id: sent.id } }), null);
    assert.equal(await db.chatLog.count({ where: { sessionId: removableSession.id } }), 0);
    for (const id of protectedSessions) assert.ok(await db.userSession.findUnique({ where: { id } }));
    for (const id of [freshDone.id, noDate.id, blockedLinked.id]) assert.ok(await db.messageReceipt.findUnique({ where: { id } }));
    for (const id of [unresolved.id, freshSent.id, noSentDate.id, leased.id]) assert.ok(await db.outgoingMessage.findUnique({ where: { id } }));
    const repeated = await retentionPlan(db, policy, true, now);
    assert.equal(repeated.receipts + repeated.outgoing + repeated.sessions, 0);
    // Sem TTL de outbox, até uma saída SENT antiga preserva seu receipt.
    const retained = await receipt('DONE', 'retained');
    await output('SENT', 'retained', old, retained.id);
    await retentionPlan(db, { receiptsDays: 90 }, true, now);
    assert.ok(await db.messageReceipt.findUnique({ where: { id: retained.id } }));
    const lockedSession = await session('locked');
    await db.$transaction(async tx => {
      const locks = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(19781117, hashtext(${phone('locked')})) AS locked`;
      assert.equal(locks[0]?.locked, true);
      const lockedPlan = await retentionPlan(db, { sessionsDays: 90 }, true, now);
      assert.equal(lockedPlan.sessions, 0);
      assert.ok(await tx.userSession.findUnique({ where: { id: lockedSession.id } }));
    });
    assert.equal((await retentionPlan(db, { sessionsDays: 90 }, true, now)).sessions, 1);
  } finally {
    await db.outgoingMessage.deleteMany({ where: { id: { in: outgoing } } });
    await db.messageReceipt.deleteMany({ where: { id: { in: receipts } } });
    await db.userSession.deleteMany({ where: { id: { in: sessions } } });
    await db.$disconnect();
  }
});
