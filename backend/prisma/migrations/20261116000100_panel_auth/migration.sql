-- Migração aditiva: não altera dados de consumidores, menu ou agendamentos.
CREATE TABLE "PanelUser" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'ATTENDANT',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PanelUser_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PanelUser_role_check" CHECK ("role" IN ('ADMIN', 'ATTENDANT'))
);
CREATE UNIQUE INDEX "PanelUser_username_key" ON "PanelUser"("username");
CREATE TABLE "PanelSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PanelSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PanelSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PanelUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PanelSession_tokenHash_key" ON "PanelSession"("tokenHash");
CREATE INDEX "PanelSession_expiresAt_idx" ON "PanelSession"("expiresAt");
CREATE INDEX "PanelSession_userId_idx" ON "PanelSession"("userId");
CREATE TABLE "PanelLoginAttempt" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PanelLoginAttempt_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "PanelLoginAttempt_expiresAt_idx" ON "PanelLoginAttempt"("expiresAt");
