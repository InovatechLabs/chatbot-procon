/**
 * Retorna os próximos N dias úteis (Segunda a Sexta-feira).
 */
export const getNextBusinessDays = (count: number = 3): { dateStr: string; label: string }[] => {
  const days: { dateStr: string; label: string }[] = [];
  const current = new Date();
  
  current.setDate(current.getDate() + 1);
  const weekDaysPt = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  while (days.length < count) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const label = `${weekDaysPt[dayOfWeek]} (${dd}/${mm})`;
      days.push({ dateStr, label });
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
};

/**
 * Valida e formata CPF para o padrão 000.000.000-00.
 */
export const cleanAndValidateCpf = (cpf: string): string | null => {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
};