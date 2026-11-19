-- Compatibilidade com bases existentes e reconstrução limpa. Não editar migrações anteriores.
BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
DO $$ BEGIN CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'NO_SHOW'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Step" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isStart" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Option" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "nextStepId" TEXT,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserSession" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "userName" TEXT,
    "userCpf" TEXT,
    "isChat" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "currentStepId" TEXT,
    "stepState" TEXT,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stepId" TEXT,

    CONSTRAINT "ChatLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeBase" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT[],
    "distincao" TEXT,
    "embedding" vector(1024),

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DocumentGuide" (
    "id" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "requiredDocs" TEXT[],
    "observations" TEXT,

    CONSTRAINT "DocumentGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Attendant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Appointment" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "userName" TEXT,
    "userCpf" TEXT,
    "citizenName" TEXT,
    "subject" TEXT,
    "categoryName" TEXT,
    "issueSummary" TEXT,
    "notes" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "sessionId" TEXT,
    "documentGuideId" TEXT,
    "attendantId" TEXT,
    "agentNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SessionFeedback" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "reviewedByAgent" BOOLEAN NOT NULL DEFAULT false,
    "agentFeedback" TEXT,
    "resolvedAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentGuide_categoryKey_key" ON "DocumentGuide"("categoryKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Appointment_scheduledAt_idx" ON "Appointment"("scheduledAt");

-- CreateIndex

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Appointment_attendantId_scheduledAt_idx" ON "Appointment"("attendantId", "scheduledAt");


DROP INDEX IF EXISTS "UserSession_phoneNumber_key";
ALTER TABLE "UserSession"
  ADD COLUMN IF NOT EXISTS "userName" TEXT,
  ADD COLUMN IF NOT EXISTS "userCpf" TEXT,
  ADD COLUMN IF NOT EXISTS "isChat" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS "stepState" TEXT,
  ADD COLUMN IF NOT EXISTS "rating" INTEGER,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ChatLog" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "ChatLog" WHERE "sessionId" IS NULL) THEN
    RAISE EXCEPTION 'Historico legado sem sessionId: exige vinculacao revisada antes de migrar; nenhum registro sera excluido.';
  END IF;
END $$;
ALTER TABLE "ChatLog" ALTER COLUMN "sessionId" SET NOT NULL;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Option_stepId_fkey' AND conrelid = '"Option"'::regclass) THEN ALTER TABLE "Option" ADD CONSTRAINT "Option_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Option_nextStepId_fkey' AND conrelid = '"Option"'::regclass) THEN ALTER TABLE "Option" ADD CONSTRAINT "Option_nextStepId_fkey" FOREIGN KEY ("nextStepId") REFERENCES "Step"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserSession_currentStepId_fkey' AND conrelid = '"UserSession"'::regclass) THEN ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_currentStepId_fkey" FOREIGN KEY ("currentStepId") REFERENCES "Step"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatLog_sessionId_fkey' AND conrelid = '"ChatLog"'::regclass) THEN ALTER TABLE "ChatLog" ADD CONSTRAINT "ChatLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatLog_stepId_fkey' AND conrelid = '"ChatLog"'::regclass) THEN ALTER TABLE "ChatLog" ADD CONSTRAINT "ChatLog_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_sessionId_fkey' AND conrelid = '"Appointment"'::regclass) THEN ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_documentGuideId_fkey' AND conrelid = '"Appointment"'::regclass) THEN ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_documentGuideId_fkey" FOREIGN KEY ("documentGuideId") REFERENCES "DocumentGuide"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_attendantId_fkey' AND conrelid = '"Appointment"'::regclass) THEN ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionFeedback_sessionId_fkey' AND conrelid = '"SessionFeedback"'::regclass) THEN ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

COMMIT;
