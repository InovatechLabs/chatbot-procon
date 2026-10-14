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
 * Valida se a string é um Nome Completo (pelo menos Nome + Sobrenome, apenas letras e acentos).
 */
export const validateFullName = (name: string): boolean => {
  const trimmed = name.trim();
  // Exige ao menos duas palavras de no mínimo 2 letras cada
  const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ]{2,}(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ]{2,})+$/;
  return trimmed.length >= 5 && nameRegex.test(trimmed);
};

/**
 * Valida e formata CPF utilizando o cálculo do Dígito Verificador (Módulo 11).
 */
export const cleanAndValidateCpf = (cpf: string): string | null => {
  const digits = cpf.replace(/\D/g, '');

  if (digits.length !== 11) return null;

  // Rejeita sequências de números iguais (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(digits)) return null;

  // Validação do 1º Dígito Verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(digits.charAt(9), 10)) return null;

  // Validação do 2º Dígito Verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(digits.charAt(10), 10)) return null;

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
};