CREATE TABLE "ConversationEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dedupKey" TEXT NOT NULL UNIQUE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('CONVERSATION_STARTED','TURN_RECEIVED','CATEGORY_SELECTED','QUESTION_SELECTED','ANSWER_PREPARED','USER_CONFIRMED_RESOLUTION','USER_REJECTED_RESOLUTION','SCHEDULE_OFFERED','APPOINTMENT_CREATED','CONVERSATION_ABANDONED','CONVERSATION_ENDED','HANDOFF_REQUESTED','RATING_SUBMITTED')),
  "sessionId" TEXT,
  "stepId" TEXT,
  "optionId" TEXT,
  "categoryKey" TEXT,
  "stage" TEXT,
  "answerKind" TEXT,
  "rating" INTEGER CHECK ("rating" BETWEEN 1 AND 5),
  "source" TEXT NOT NULL DEFAULT 'WHATSAPP' CHECK ("source" IN ('WHATSAPP','PANEL')),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ConversationEvent_occurredAt_kind_idx" ON "ConversationEvent"("occurredAt", "kind");
CREATE INDEX "ConversationEvent_sessionId_occurredAt_idx" ON "ConversationEvent"("sessionId", "occurredAt");
