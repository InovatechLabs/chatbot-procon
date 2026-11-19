// Contagem conservadora em unidades UTF-16 (emoji pode ocupar duas), sem cortar surrogate.
export const INTERACTIVE_BODY_LIMIT = 1024;
export const charLength = (text: string) => text.length;
export const clip = (text: string, limit: number) => {
  let result = '';
  for (const char of text) {
    if (result.length + char.length > limit) break;
    result += char;
  }
  return result;
};

// Modelos às vezes usam Markdown de dois asteriscos; o WhatsApp usa apenas um.
export const normalizeWhatsappFormatting = (text: string) =>
  text.replace(/\*{2,}([^*]+?)\*{2,}/g, '*$1*');

export function splitMessage(text: string, limit = INTERACTIVE_BODY_LIMIT): string[] {
  if (limit < 2) throw new RangeError('O bloco precisa comportar ao menos um caractere Unicode.');
  const parts: string[] = [];
  let rest = text.trim();
  while (charLength(rest) > limit) {
    const candidate = clip(rest, limit);
    const boundary = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf(' '));
    const part = boundary > candidate.length / 2 ? candidate.slice(0, boundary) : candidate;
    parts.push(part);
    rest = rest.slice(part.length).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

export interface MenuOption { id: string; text: string }
export const POST_ANSWER_OPTIONS: MenuOption[] = [
  { id: 'btn_feedback_sim', text: 'Ajudou, obrigado' },
  { id: 'btn_go_menu', text: 'Outra dúvida' },
  { id: 'btn_agendar_sim', text: 'Agendar atendimento' },
];
export const MENU_OPTION: MenuOption = { id: 'btn_go_menu', text: 'Menu principal' };

export function matchOption(text: string, options: MenuOption[], normalize: (text: string) => string) {
  const value = normalize(text);
  if (/^[1-9]\d*$/.test(value)) return options[Number(value) - 1];
  return options.find(option => normalize(option.text) === value);
}

export const maskCpf = (cpf: string | null | undefined) => {
  const digits = (cpf ?? '').replace(/\D/g, '');
  return digits.length === 11 ? `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**` : 'não informado';
};
