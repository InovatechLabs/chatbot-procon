ALTER TABLE "HumanHandoff" ADD COLUMN "id" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'WAITING' CHECK ("status" IN ('WAITING', 'ACTIVE', 'CLOSED', 'BOT')),
  ADD COLUMN "assigneeId" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
UPDATE "HumanHandoff" SET "id" = gen_random_uuid()::text;
ALTER TABLE "HumanHandoff" ALTER COLUMN "id" SET NOT NULL;
CREATE UNIQUE INDEX "HumanHandoff_id_key" ON "HumanHandoff"("id");
CREATE INDEX "HumanHandoff_status_requestedAt_idx" ON "HumanHandoff"("status", "requestedAt");

ALTER TABLE "MessageReceipt" ADD COLUMN "sourceAt" TIMESTAMP(3);
CREATE INDEX "MessageReceipt_phoneLookup_sourceAt_idx" ON "MessageReceipt"("phoneLookup", "sourceAt");
ALTER TABLE "OutgoingMessage" ADD COLUMN "humanAuthored" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "handoffVersion" INTEGER;

ALTER TABLE "ChatLog" ADD COLUMN "authorId" TEXT, ADD COLUMN "outgoingId" TEXT, ADD COLUMN "requestKey" TEXT;
ALTER TABLE "ChatLog" ADD CONSTRAINT "ChatLog_outgoingId_fkey" FOREIGN KEY ("outgoingId") REFERENCES "OutgoingMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ChatLog_outgoingId_key" ON "ChatLog"("outgoingId");
CREATE UNIQUE INDEX "ChatLog_requestKey_key" ON "ChatLog"("requestKey");
CREATE INDEX "ChatLog_phoneLookup_timestamp_id_idx" ON "ChatLog"("phoneLookup", "timestamp", "id");
