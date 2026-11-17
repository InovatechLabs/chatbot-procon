CREATE TABLE "MessageReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sequence" BIGSERIAL NOT NULL UNIQUE,
  "metaMessageId" TEXT NOT NULL UNIQUE,
  "phoneNumber" TEXT NOT NULL,
  "phoneLookup" TEXT,
  "payload" TEXT,
  "state" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("state" IN ('PENDING','DONE','DEAD','SKIPPED')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT
);
CREATE INDEX "MessageReceipt_state_availableAt_idx" ON "MessageReceipt"("state", "availableAt");
CREATE INDEX "MessageReceipt_phoneLookup_sequence_idx" ON "MessageReceipt"("phoneLookup", "sequence");
CREATE TABLE "OutgoingMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sequence" BIGSERIAL NOT NULL UNIQUE,
  "receiptId" TEXT REFERENCES "MessageReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "phoneNumber" TEXT NOT NULL,
  "phoneLookup" TEXT,
  "payload" TEXT,
  "state" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("state" IN ('PENDING','SENDING','SENT','UNKNOWN','DEAD','SKIPPED')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "metaMessageId" TEXT UNIQUE,
  "deliveryStatus" TEXT,
  "lastError" TEXT
);
CREATE INDEX "OutgoingMessage_state_availableAt_idx" ON "OutgoingMessage"("state", "availableAt");
CREATE INDEX "OutgoingMessage_phoneLookup_sequence_idx" ON "OutgoingMessage"("phoneLookup", "sequence");
