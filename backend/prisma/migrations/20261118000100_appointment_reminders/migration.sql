-- Lembretes de agendamento: marca quando o lembrete foi enfileirado (um por agendamento)
-- e quando o cidadão confirmou presença pelo botão do lembrete.
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "reminderQueuedAt" TIMESTAMP(3);
