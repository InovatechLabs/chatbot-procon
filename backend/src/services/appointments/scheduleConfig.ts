// Regras da grade de atendimento presencial.
// A documentação do projeto não define horários da unidade: ajuste estes valores com o PROCON.
export const SCHEDULE = {
  tzOffset: '-03:00',          // America/Sao_Paulo (sem horário de verão desde 2019)
  tzOffsetMinutes: -180,
  startHour: 9,                // primeiro horário: 09:00
  endHour: 17,                 // último atendimento termina às 17:00
  slotMinutes: 30,
  workDays: [1, 2, 3, 4, 5] as number[], // 0 = domingo ... 6 = sábado
  minLeadMinutes: 60,          // antecedência mínima para o cidadão agendar
};

export const HISTORY_LIMIT = 500; // máximo de mensagens devolvidas em /appointments/:id/history
