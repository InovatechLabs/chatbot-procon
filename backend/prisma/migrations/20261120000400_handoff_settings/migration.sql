CREATE TABLE "HandoffSettings" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "periods" JSONB NOT NULL,
    "queueMessage" TEXT NOT NULL,
    "closedMessage" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HandoffSettings_pkey" PRIMARY KEY ("id")
);
