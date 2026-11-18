ALTER TABLE "RetentionSettings"
  ADD COLUMN "lastRunAt" TIMESTAMP(3),
  ADD COLUMN "lastRunVersion" INTEGER,
  ADD COLUMN "lastRunCounts" JSONB;
-- A autorização anterior era somente manual. Exigir ativação explícita para
-- o novo comportamento automático, preservando todos os prazos cadastrados.
UPDATE "RetentionSettings" SET "approved" = false, "version" = "version" + 1,
  "updatedAt" = CURRENT_TIMESTAMP WHERE "approved" = true;
