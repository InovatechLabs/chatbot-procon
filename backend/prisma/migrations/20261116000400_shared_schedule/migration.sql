CREATE TABLE "ScheduleSettings" (
  "id" TEXT NOT NULL DEFAULT 'main' PRIMARY KEY,
  "capacity" INTEGER NOT NULL DEFAULT 1 CHECK ("capacity" BETWEEN 1 AND 1000),
  "startMinute" INTEGER NOT NULL DEFAULT 540,
  "endMinute" INTEGER NOT NULL DEFAULT 1020,
  "slotMinutes" INTEGER NOT NULL DEFAULT 30 CHECK ("slotMinutes" BETWEEN 5 AND 480),
  "minLeadMinutes" INTEGER NOT NULL DEFAULT 60 CHECK ("minLeadMinutes" BETWEEN 0 AND 10080),
  "workDays" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("id" = 'main'),
  CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" - "startMinute" >= "slotMinutes"),
  CHECK (cardinality("workDays") BETWEEN 1 AND 7 AND "workDays" <@ ARRAY[0,1,2,3,4,5,6])
);
-- Captura a capacidade anterior apenas na instalação; não volta a depender dos atendentes.
INSERT INTO "ScheduleSettings" ("id", "capacity", "updatedAt")
SELECT 'main', LEAST(1000, GREATEST(1, COUNT(*))), CURRENT_TIMESTAMP FROM "Attendant" WHERE "active" = true;
CREATE TABLE "ScheduleCapacity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "date" TEXT NOT NULL,
  "minute" INTEGER NOT NULL DEFAULT -1 CHECK ("minute" BETWEEN -1 AND 1439),
  "capacity" INTEGER NOT NULL CHECK ("capacity" BETWEEN 1 AND 1000)
);
CREATE UNIQUE INDEX "ScheduleCapacity_date_minute_key" ON "ScheduleCapacity"("date", "minute");
CREATE TABLE "ScheduleBlock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "startDate" TEXT,
  "endDate" TEXT,
  "weekDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "startMinute" INTEGER,
  "endMinute" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate"),
  CHECK (("startMinute" IS NULL AND "endMinute" IS NULL) OR ("startMinute" IS NOT NULL AND "endMinute" IS NOT NULL AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute")),
  CHECK ("weekDays" <@ ARRAY[0,1,2,3,4,5,6]),
  CHECK (cardinality("weekDays") > 0 OR ("startDate" IS NOT NULL AND "endDate" IS NOT NULL))
);
