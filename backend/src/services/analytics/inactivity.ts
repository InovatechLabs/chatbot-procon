import { rootPrisma } from '../../database/index.js';
import { decodeSession, initialSnapshot, isScheduling, persistable } from '../conversation/state.js';
import { recordEvent } from './events.js';

export async function expireInactiveSessions(now = new Date()) {
  return rootPrisma.$transaction(async tx => {
    const schedulingPattern = '"kind"\\s*:\\s*"SCHEDULE_(CATEGORY|NAME|NAME_CONFIRM|CPF|DATE|SLOT)"|^SCH_STEP_';
    const rows = await tx.$queryRaw<{ id: string; phoneLookup: string | null; updatedAt: Date; status: string; stepState: string | null; currentStepId: string | null; isChat: boolean }[]>`
      SELECT "id", "phoneLookup", "updatedAt", "status", "stepState", "currentStepId", "isChat"
      FROM "UserSession" WHERE "status" = 'OPEN' AND "updatedAt" < ${new Date(now.getTime() - 30 * 60_000)}
      AND ("updatedAt" < ${new Date(now.getTime() - 1440 * 60_000)} OR COALESCE("stepState", '') !~ ${schedulingPattern})
      AND NOT EXISTS (SELECT 1 FROM "MessageReceipt" r WHERE r."phoneLookup" = "UserSession"."phoneLookup" AND r."state" NOT IN ('DONE','SKIPPED'))
      ORDER BY "updatedAt" LIMIT 50 FOR UPDATE SKIP LOCKED`;
    let closed = 0;
    for (const row of rows) {
      const flow = decodeSession(row).snapshot;
      if (now.getTime() - row.updatedAt.getTime() <= (isScheduling(flow.state) ? 1440 : 30) * 60_000 || !row.phoneLookup) continue;
      const lock = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(19781117, hashtext(${row.phoneLookup})) AS locked`;
      if (!lock[0]?.locked) continue;
      await recordEvent(tx, { kind: flow.state.kind === 'READY' ? 'CONVERSATION_ENDED' : 'CONVERSATION_ABANDONED', sessionId: row.id, stage: flow.state.kind }, `expiry:${row.id}`);
      await tx.userSession.update({ where: { id: row.id }, data: persistable({ ...initialSnapshot(), state: { kind: 'FINISHED' } }) });
      closed++;
    }
    return closed;
  }, { timeout: 15_000 });
}
