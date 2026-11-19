CREATE TABLE "RetentionSettings" (
  "id" TEXT NOT NULL DEFAULT 'main' PRIMARY KEY CHECK ("id" = 'main'),
  "sessionsDays" INTEGER CHECK ("sessionsDays" BETWEEN 1 AND 36500),
  "appointmentsDays" INTEGER CHECK ("appointmentsDays" BETWEEN 1 AND 36500),
  "receiptsDays" INTEGER CHECK ("receiptsDays" BETWEEN 1 AND 36500),
  "outgoingDays" INTEGER CHECK ("outgoingDays" BETWEEN 1 AND 36500),
  "approved" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,
  CHECK (NOT "approved" OR "sessionsDays" IS NOT NULL OR "appointmentsDays" IS NOT NULL OR "receiptsDays" IS NOT NULL OR "outgoingDays" IS NOT NULL)
);
INSERT INTO "RetentionSettings" ("id", "updatedAt") VALUES ('main', CURRENT_TIMESTAMP);
