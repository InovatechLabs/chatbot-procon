// src/services/llm/fixedResponses.ts
// Respostas FIXAS (sem IA) para categorias do classificador e para mensagens de sistema.
// Revisar os textos com a equipe do PROCON antes de ir para produção.

export type Acao = 'agendar' | 'menu';

export interface RespostaFixa {
  texto: string;
  acoes: Acao[];
}

const PROCON_TEL = '(12) 3955-9130';
const PROCON_EMAIL = 'procon@jacarei.sp.gov.br';

export const MSG_AUDIO =
  'Ainda não consigo ouvir áudios. Pode escrever com suas palavras o que aconteceu?';

export const MSG_ARQUIVO =
  'Ainda não consigo ver fotos ou arquivos. Pode escrever o que aconteceu? As fotos e os documentos você leva no atendimento presencial.';

export const MSG_MENU_EXPIRADO =
  'Esse menu é de uma conversa antiga e já foi atualizado. Aqui está o menu novo:';

export const MSG_NOME_INVALIDO =
  'Não consegui ler o nome. Pode digitar o *nome e sobrenome*? Exemplo: Maria da Silva.\n\nPara sair, digite *menu*.';

export const MSG_CPF_INVALIDO =
  'Não consegui validar esse CPF. Confira os 11 números e tente de novo, com ou sem pontos e traço.\n\nSe não estiver com o CPF, digite *menu* ou *atendente* para pedir ajuda.';

// Contato verificado pelo conector de recursos locais em 15/11/2026 (Brasil).
export const MSG_CRISE = 'Sinto muito que você esteja passando por isso. Você não precisa enfrentar isso sozinho(a).\n\nSe você pensa em se machucar, procure alguém de confiança para ficar com você e ligue para o CVV: 188 (24 horas, gratuito). Se houver perigo imediato, ligue 192 (SAMU) ou 190.\n\nQuando se sentir pronto(a), podemos continuar com sua dúvida de consumo. Para voltar às opções, digite *menu*.';

export const MSG_SAIDA_AGENDAMENTO =
  `Tudo bem! Se preferir falar com a equipe, ligue ou chame no WhatsApp ${PROCON_TEL}.\n\nPara voltar ao menu, digite *menu*.`;

export const MSG_ENCERRADO = 'Atendimento encerrado. Quando precisar, é só me chamar. 👋';
export const MSG_AGENDAMENTO_INTERROMPIDO = 'Tudo bem, interrompi o agendamento. Nenhum horário foi reservado.';
export const MSG_DE_NADA = 'De nada! Se precisar de mais alguma coisa, escreva o que aconteceu ou digite *menu*.';
export const MSG_NAO_QUER_AGENDAR = 'Tudo bem! Se precisar, escreva o que aconteceu ou digite *menu*.';

// Texto montado na hora da chamada (lê PROCON_HORARIO do .env depois do dotenv.config()).
const FIXAS: Record<string, () => RespostaFixa> = {
  RISCO_PESSOAL: () => ({ texto: MSG_CRISE, acoes: ['menu'] }),
  FORA_ESCOPO_PARTICULAR: () => ({
    texto:
      'Entendi, e sinto pelo transtorno. Como foi um acordo entre duas pessoas, sem loja ou empresa no meio, o PROCON não consegue atuar nesse caso.\n\n' +
      'Você pode procurar o Juizado Especial Cível (em causas de menor valor, muitas vezes sem precisar de advogado) ou a Defensoria Pública, que orienta gratuitamente quem não pode pagar um advogado.',
    acoes: ['menu'],
  }),

  FORA_ESCOPO_TRIBUTO: () => ({
    texto:
      'Cobrança de imposto, taxa ou multa feita por órgão público (como IPTU ou multa de trânsito) não é assunto do PROCON.\n\n' +
      'Para contestar, procure o próprio órgão que cobrou (prefeitura, Detran etc.) ou a Defensoria Pública.',
    acoes: ['menu'],
  }),

  FORA_ESCOPO_ILICITO: () => ({
    texto:
      'O serviço que você descreveu não é permitido por lei, por isso o PROCON não consegue atuar nesse caso.\n\n' +
      'Se você foi enganado ou ameaçado, registre um Boletim de Ocorrência na delegacia (em muitos casos dá para fazer online).',
    acoes: ['menu'],
  }),

  FORA_ESCOPO_CRIME: () => ({
    texto:
      'Sinto muito pelo que você está passando. Violência, ameaça e outros crimes não são tratados pelo PROCON e precisam de ajuda urgente:\n\n' +
      '• Perigo agora: ligue *190*.\n' +
      '• Violência contra a mulher: ligue *180*.\n' +
      '• Para registrar o ocorrido: procure uma delegacia.',
    acoes: ['menu'],
  }),

  FORA_ESCOPO_OUTRO: () => ({
    texto:
      'Esse assunto (família, trabalho, vizinhança ou outro tema que não é relação de consumo) não é tratado pelo PROCON.\n\n' +
      'Para orientação gratuita, procure a *Defensoria Pública*. Questões de trabalho também podem ir ao sindicato ou à Justiça do Trabalho.',
    acoes: ['menu'],
  }),

  GOLPE_TERCEIRO: () => ({
    texto:
      'Sinto muito por isso. Quando o golpe é feito por um desconhecido, o PROCON não consegue investigar nem punir o golpista, mas você pode agir agora:\n\n' +
      '1. Se pagou por Pix, cartão ou boleto, avise seu banco ou o cartão o quanto antes e peça a contestação.\n' +
      '2. Registre um Boletim de Ocorrência (em muitos casos dá para fazer online).\n' +
      '3. Guarde prints, comprovantes e conversas.\n\n' +
      'Se um banco, uma loja ou uma plataforma conhecida participou da situação, o PROCON pode analisar a atuação dela em um atendimento presencial.',
    acoes: ['agendar', 'menu'],
  }),

  INFO_ATENDIMENTO: () => ({
    texto:
      `Este é o assistente virtual do PROCON de Jacareí. Atendimento presencial: ${process.env.PROCON_ENDERECO || 'Rua Capitão Joaquim Pinheiro do Prado, 222, Centro, Jacareí-SP'}.\n\n` +
      `📞 Telefone e WhatsApp: ${PROCON_TEL}\n` +
      `✉️ E-mail: ${PROCON_EMAIL}\n` +
      `🕗 Horário: ${process.env.PROCON_HORARIO ?? 'consulte pelo telefone'}\n\n` +
      'Por aqui eu posso orientar você e fazer seu agendamento presencial. Para falar com uma pessoa, use os contatos acima. Se mora em outro município, confirme com a equipe onde deve ser atendido.',
    acoes: ['agendar', 'menu'],
  }),

  ACOMPANHAMENTO: () => ({
    texto:
      `Para saber como está a sua reclamação, tenha em mãos o número do protocolo e fale com o PROCON: ${PROCON_TEL} ou ${PROCON_EMAIL}.\n\n` +
      'A empresa tem até 10 dias corridos para responder à carta de aviso (CIP) do PROCON. Depois disso, você pode ser chamado a informar se o problema foi resolvido.',
    acoes: ['menu'],
  }),

  CANCELAR_REMARCAR: () => ({
    texto: `Por aqui eu ainda não consigo cancelar ou remarcar. Fale com o PROCON pelo telefone ou WhatsApp ${PROCON_TEL} para ajustar o seu horário.`,
    acoes: ['menu'],
  }),

  DUVIDA_PROCESSO: () => ({
    texto:
      'Para entender como funciona o atendimento, os prazos e os documentos, toque em *Menu principal* e escolha *Processos & Queixas*.',
    acoes: ['menu'],
  }),

  FORA_DO_PAPEL: () => ({
    texto:
      'Eu sou um assistente de orientação: não emito parecer, não garanto resultado e não decido o seu caso. A análise oficial é feita pela equipe do PROCON.\n\n' +
      'Posso explicar o que a lei prevê e te ajudar a agendar um atendimento.',
    acoes: ['agendar', 'menu'],
  }),

  CONVERSA_SOCIAL: () => ({
    texto: 'Estou por aqui! Se precisar, escreva o que aconteceu ou toque em *Menu principal*.',
    acoes: ['menu'],
  }),
};

export const getRespostaFixa = (categoria: string): RespostaFixa | null => {
  const build = FIXAS[categoria];
  return build ? build() : null;
};
