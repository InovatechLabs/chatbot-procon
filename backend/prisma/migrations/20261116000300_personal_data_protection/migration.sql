ALTER TABLE "UserSession" ADD COLUMN "phoneLookup" TEXT, ADD COLUMN "cpfLookup" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "phoneLookup" TEXT, ADD COLUMN "cpfLookup" TEXT;
ALTER TABLE "ChatLog" ADD COLUMN "phoneLookup" TEXT;
ALTER TABLE "SessionFeedback" ADD COLUMN "phoneLookup" TEXT;
CREATE INDEX "UserSession_phoneLookup_status_createdAt_idx" ON "UserSession"("phoneLookup", "status", "createdAt");
CREATE INDEX "UserSession_cpfLookup_idx" ON "UserSession"("cpfLookup");
CREATE INDEX "Appointment_phoneLookup_idx" ON "Appointment"("phoneLookup");
CREATE INDEX "Appointment_cpfLookup_idx" ON "Appointment"("cpfLookup");
DROP INDEX IF EXISTS "Appointment_phoneNumber_idx";
