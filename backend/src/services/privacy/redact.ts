/** Minimização determinística; não é detector universal de dados pessoais em texto livre. */
export function redactIdentifiers(text: string, known: (string | null | undefined)[] = []) {
  let safe = text;
  for (const item of known.filter((value): value is string => Boolean(value && value.length >= 3)).sort((a, b) => b.length - a.length)) {
    safe = safe.replace(new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[DADO PESSOAL]');
  }
  return safe
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{5}-\d{3}\b/g, '[CEP]')
    .replace(/(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g, '[CNPJ]')
    .replace(/(?<!\d)\d{3}[. \t]*\d{3}[. \t]*\d{3}[- \t]*\d{2}(?!\d)/g, '[CPF/TELEFONE]')
    .replace(/(?<!\d)(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]*\d{4}(?!\d)/g, '[TELEFONE]')
    .replace(/(?<!\d)(?:\d[ .-]?){14,19}(?!\d)/g, '[IDENTIFICADOR]')
    .replace(/\b(?:RG|chave\s+pix|conta\s+bancária|agência)\s*[:=]\s*[^\s,;]+/gi, '[IDENTIFICADOR INFORMADO]')
    // O introdutor precisa terminar: "e" não pode consumir "em/está/errado".
    // Lookahead explícito também funciona depois de "é", fora do \w do JavaScript.
    .replace(/\b(?:(?:meu nome (?:é|e)|me chamo)(?=\s|[:=]|$)|nome completo\s*:)\s*[^\n,;.?!]+/gi, '[NOME INFORMADO]')
    .replace(/\b(?:(?:meu endereço (?:é|e)|moro (?:na|no|em))(?=\s|[:=]|$)|endereço\s*:)\s*[^\n;.?!]+/gi, '[ENDEREÇO INFORMADO]');
}
export function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 ? `+${digits.slice(0, 2)} ** *****-${digits.slice(-4)}` : '[telefone protegido]';
}
