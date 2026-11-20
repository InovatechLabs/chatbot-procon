CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "thinkingEnabled" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);
