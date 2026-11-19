ALTER TABLE "MessageReceipt"
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseUntil" TIMESTAMP(3);
ALTER TABLE "MessageReceipt" DROP CONSTRAINT "MessageReceipt_state_check";
ALTER TABLE "MessageReceipt" ADD CONSTRAINT "MessageReceipt_state_check"
  CHECK ("state" IN ('PENDING','PROCESSING','DONE','DEAD','SKIPPED'));
ALTER TABLE "MessageReceipt" ADD CONSTRAINT "MessageReceipt_lease_check"
  CHECK (("state" = 'PROCESSING' AND "leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL)
      OR ("state" <> 'PROCESSING' AND "leaseToken" IS NULL AND "leaseUntil" IS NULL));
CREATE INDEX "MessageReceipt_state_leaseUntil_idx" ON "MessageReceipt"("state", "leaseUntil");
CREATE INDEX "MessageReceipt_leaseToken_idx" ON "MessageReceipt"("leaseToken");
