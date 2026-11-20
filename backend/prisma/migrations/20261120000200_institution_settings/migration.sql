CREATE TABLE "InstitutionSettings" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hours" TEXT NOT NULL,
    "referralMessage" TEXT NOT NULL,
    "appointmentMessage" TEXT NOT NULL,
    "unavailableMessage" TEXT NOT NULL,
    "rescheduleMessage" TEXT NOT NULL,
    "privacyMessage" TEXT NOT NULL,
    "queueMessage" TEXT NOT NULL,
    CONSTRAINT "InstitutionSettings_pkey" PRIMARY KEY ("id")
);

UPDATE "Step"
SET "message" = replace("message",
    'Olá! Sou o assistente virtual do PROCON de Jacareí.',
    'Olá! Assistente virtual — {{nome}}.')
WHERE "isStart" = true
  AND "title" = 'Menu Principal'
  AND "message" LIKE 'Olá! Sou o assistente virtual do PROCON de Jacareí.%';

UPDATE "Step"
SET "message" = replace("message",
    'fale com o PROCON de Jacareí pelo telefone/WhatsApp (12) 3955-9130 ou pelo e-mail procon@jacarei.sp.gov.br.',
    'fale com {{nome}} pelo telefone/WhatsApp {{telefone}} ou pelo e-mail {{email}}.')
WHERE "title" = 'Questao 8 - Ja abri reclamacao no PROCON';

UPDATE "Step"
SET "message" = replace("message",
    'ao PROCON de Jacareí: telefone/WhatsApp (12) 3955-9130.',
    'à equipe de {{nome}}: telefone/WhatsApp {{telefone}}.')
WHERE "title" = 'Questao 26 - Prazos e andamento da reclamacao no PROCON';
