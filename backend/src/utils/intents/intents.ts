// Regras simples (sem IA) para mensagens curtas e comandos. Rodam ANTES do classificador.

/** minúsculas, sem acento, sem pontuação/emoji, espaços únicos. */
export const normalize = (t: string): string =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Comandos que levam ao menu inicial. */
export const MENU_CMDS = new Set([
  'menu', 'inicio', 'iniciar', 'reiniciar', 'recomecar', 'comecar',
  'voltar', 'voltar ao menu', 'voltar ao inicio', 'menu principal', 'outra duvida', 'ajuda', '0', '#',
]);

/** Comandos que encerram o atendimento. */
export const EXIT_CMDS = new Set(['sair', 'encerrar', 'parar', 'cancelar']);

export const YES = new Set(['sim', 's', 'quero', 'quero sim', 'pode', 'pode ser', 'claro', 'gostaria']);
export const NO = new Set(['nao', 'n', 'nao quero', 'nao obrigado', 'agora nao']);

/** Saudação pura */
export const isGreeting = (n: string): boolean =>
  /^(oi+|ola+|opa|e ai|eai|bom dia|boa tarde|boa noite)( (tudo )?(bem|bom)| td bem| pessoal| gente)*$/.test(n);

/** Agradecimento / confirmação curta (até 4 palavras) ou só emoji positivo. */
export const isThanks = (raw: string, n: string): boolean => {
  if (/^(?:ok|okay|certo|beleza|blz) entendi$/.test(n)) return true;
  if (n === '') return /[👍🙏❤😊👏🙌]/u.test(raw);
  return (
    n.split(' ').length <= 4 &&
    /^(?:(?:muito )?(?:obrigad[oa]|obg|valeu|vlw)|ok|okay|certo|entendi|beleza|blz|show|perfeito|tchau|ate mais|deus abencoe)(?: (?:viu|mesmo|deus abencoe))?$/.test(n)
  );
};

/** Durante a coleta de nome/CPF: o cidadão quer sair ou pedir ajuda em vez de responder. */
export const querSair = (n: string, raw: string): boolean =>
  /\b(atendente|humano|nao sei|nao tenho|nao quero|desisti|ajuda|nao estou|quero falar|quero agendar|sem cpf)\b/.test(n) || raw.includes('?');

export const isCrisis = (n: string): boolean =>
  /\b(?:(?:vou|quero|queria|penso em|pensando em|decidi) me matar|me mato|quero morrer|tirar minha vida|acabar com minha vida|nao aguento mais viver|vou me suicidar|quero me suicidar)\b/.test(n)
  && !/\bnao (?:vou|quero|queria) me (?:matar|suicidar)\b/.test(n);

export const isHumanRequest = (n: string): boolean =>
  /^(?:(?:eu )?(?:quero|preciso|gostaria de|posso) )?(?:(?:falar|conversar) com (?:um |uma |o |a )?)?(?:atendente|humano|pessoa|alguem)(?: (?:humano|humana|de verdade))?$/.test(n);

export const isLogistics = (n: string): boolean =>
  /^(?:(?:(?:qual (?:e )?|(?:me )?(?:passe|informe) )?(?:o |a )?(?:endereco|telefone|whatsapp|horario(?: de atendimento)?|e mail))|(?:onde (?:fica|e|voces ficam))|(?:que horas (?:abre|fecha)))(?: (?:do |de |da |o |a )?(?:procon|voces|atendimento)(?: de jacarei)?)?$/.test(n);

export const isScheduleChange = (n: string): boolean =>
  /\b(?:cancelar|desmarcar|remarcar|mudar|alterar) (?:o |meu |um )?(?:agendamento|atendimento|horario|consulta)\b/.test(n);

export const isPrivacyRequest = (n: string): boolean =>
  /\b(?:apagar|excluir|remover|eliminar) (?:os |a |as )?(?:meus? |minhas? )?(?:dados|conversa|mensagens|cpf)\b|\bprivacidade\b|\blgpd\b/.test(n);
