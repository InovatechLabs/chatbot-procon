import { normalizeReference } from '../helpers/articleReference.js';
import { inspectOutputClaims } from './outputClaims.js';

export const normalizeLegalText = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[*_`]/g, '');
type Evidence = 'reported' | 'denied' | 'unknown';
export interface CitizenEvidence {
  collection: Evidence;
  payment: Evidence;
  transferMentioned: boolean;
  hiddenDefectMentioned: boolean;
  serviceQualityMentioned: boolean;
}
const clauses = (text: string) => normalizeLegalText(text).replace(/\bart\./g, 'art').split(/(?<!\d)\.|\.(?!\d)|[!?;\n]+/).map(item => item.trim()).filter(Boolean);
const asserted = (clause: string, pattern: RegExp) => [...clause.matchAll(new RegExp(pattern.source, 'g'))].some(match =>
  !/\b(?:nao|nunca|sem|nem|jamais|sera que|nao sei se)\b[^,;.!?]{0,30}$/.test(clause.slice(0, match.index)));

/** Sinais conservadores de declaração, não conclusão jurídica nem classificador. */
export function citizenEvidence(messages: string[]): CitizenEvidence {
  let collection: Evidence = 'unknown', payment: Evidence = 'unknown';
  let hiddenDefectMentioned = false;
  for (const raw of messages) {
    const text = normalizeLegalText(raw);
    if (/\b(?:sera que|nao sei se|talvez|voce disse)\b[^.!?\n]{0,60}\b(?:cobrad\w*|cobranca)\b/.test(text)) collection = 'unknown';
    else if (/\b(?:nao (?:fui|houve|recebi)|sem|nunca (?:fui|recebi))\b[^.!?\n]{0,35}\b(?:cobrad\w*|cobranca)\b/.test(text)) collection = 'denied';
    else if (clauses(raw).some(clause => asserted(clause, /\b(?:me cobraram|fui cobrad\w*|recebi (?:uma )?cobranca|cobranca indevida|cobraram)\b/))) collection = 'reported';
    if (/\b(?:nao paguei|nunca paguei|sem (?:ter )?pago|ainda nao (?:paguei|pague))\b/.test(text)) payment = 'denied';
    else if (clauses(raw).some(clause => asserted(clause, /\b(?:paguei|ja paguei|efetuei o pagamento|debitaram)\b/))) payment = 'reported';
    if (/\bnao (?:e|era|foi)\b[^.!?\n]{0,25}\bocult\w*\b/.test(text)) hiddenDefectMentioned = false;
    else if (/\b(?:ocult\w*|impossivel de perceber|so (?:ficou|se tornou) evidente|so apareceu|so ficou evidenciado)\b/.test(text)) hiddenDefectMentioned = true;
  }
  const report = normalizeLegalText(messages.join('\n'));
  return { collection, payment,
    transferMentioned: /\b(?:pix|transferencia|transferi|destinatario)\b/.test(report),
    hiddenDefectMentioned,
    serviceQualityMentioned: /\b(?:servico|pintura|pintor|obra|conserto|reparo)\b/.test(report) && /\b(?:malfeit\w*|mal feit\w*|refazer|reexecuc\w*|nao ficou bom|defeito)\b/.test(report),
  };
}

const numberWords: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100 };
const numberToken = `(?:${Object.keys(numberWords).join('|')})`;
const amountToken = `(?:\\d+(?:[.,]\\d+)?|${numberToken}(?:\\s+e\\s+${numberToken}){0,3})`;
const duration = new RegExp(`\\b(${amountToken})(?:\\s*\\((${amountToken})\\))?\\s*(dias?|anos?|mes(?:es)?|horas?|semanas?)\\b`, 'g');
function quantities(text: string): string[] {
  return [...normalizeLegalText(text).matchAll(new RegExp(duration))].map(match => {
    const parse = (value: string) => /^\d/.test(value) ? Number(value.replace(',', '.')) : value.split(/\s+e\s+/).reduce((sum, word) => sum + (numberWords[word] ?? 0), 0);
    const amount = parse(match[1]!);
    const unit = match[3]!.startsWith('dia') ? 'days' : match[3]!.startsWith('ano') ? 'years' : match[3]!.startsWith('hor') ? 'hours' : match[3]!.startsWith('sem') ? 'weeks' : 'months';
    if ((match[2] && parse(match[2]) !== amount) || /[.,]\d{3}$/.test(match[1]!)) return `inconsistent:${unit}`;
    return `${amount}:${unit}`;
  });
}
export const containsLegalDeadline = (text: string) => /\b(?:prazo|prescri\w*|decad\w*|contagem|garantia)\b/.test(normalizeLegalText(text)) || quantities(text).length > 0;

function deniedAnchor(clause: string, target: string): boolean {
  return new RegExp(`\\b(?:nao|nem|nunca)\\s+(?:(?:da|do|de|na|no|a|o|data|partir|desde)\\s+){0,5}(?:${target})`).test(clause)
    || new RegExp(`\\b(?:nao|nunca)\\s+(?:se\\s+)?(?:comec\\w*|inici\\w*|conta\\w*)[^,;]{0,35}\\b(?:${target})`).test(clause)
    || new RegExp(`\\b(?:${target})[^,;]{0,30}\\bnao\\s+(?:e|inicia|comeca)`).test(clause);
}

/** Só admite explicação condicional, sem validar convenção concreta do caso. */
export function unsafeRepairExtension(value: string): boolean {
  const text = normalizeLegalText(value);
  if (!/\b(?:180|cento e oitenta)\s*dias\b/.test(text)) return false;
  const condition = /\b(?:depende de|mediante|por acordo|desde que|se (?:as partes|houver)|caso (?:as partes|haja)|convencionar)\b[^.!?;\n]{0,60}\b(?:acordo|partes|convenc\w*)\b/.test(text)
    || /\bpor acordo\b/.test(text)
    || /\bnao (?:pode|e permitido|se pode)\b[^.!?;\n]{0,90}\bsem acordo\b/.test(text);
  const ignoresCondition = /\b(?:mesmo sem acordo|nao (?:exige|depende de) acordo)\b/.test(text)
    || (/\bautomatic\w*\b/.test(text) && !/\bnao\b[^.!?;\n]{0,35}\bautomatic\w*\b/.test(text));
  return !condition || ignoresCondition;
}

export function legalReferencesIn(text: string): string[] {
  return [...normalizeLegalText(text).matchAll(/\bart(?:igo)?\.?\s*(\d+)(?:\s*-\s*([a-z])\b)?/g)]
    .map(match => normalizeReference(`Art. ${match[1]}${match[2] ? `-${match[2]}` : ''}`)!).filter(Boolean);
}

export interface SafetyCheck {
  text: string;
  article: string | null;
  kind: 'orientacao_final' | 'clarificacao' | 'redirecionamento';
  citizenMessages: string[];
  sources: { reference: string; content: string }[];
}
export interface SafetyDecision { passed: boolean; reasons: string[]; evidence: CitizenEvidence; question: string | null; scopeVeto: 'private' | 'tax' | 'lease' | null }

/** Controles delimitados de afirmações de alto risco. Não certifica todo texto jurídico. */
export function inspectLegalSafety(input: SafetyCheck): SafetyDecision {
  const text = normalizeLegalText(input.text);
  const evidence = citizenEvidence(input.citizenMessages);
  const reasons: string[] = [];
  let scopeVeto: SafetyDecision['scopeVeto'] = null;
  const add = (reason: string) => { if (!reasons.includes(reason)) reasons.push(reason); };
  const references = legalReferencesIn(text);
  const supported = new Map(input.sources.map(source => [source.reference, source.content.replace(/\(PALAVRAS-CHAVE PARA BUSCA:.*?\)/gi, '')]));
  if (references.some(ref => !supported.has(ref))) add('referencia_textual_sem_fonte');
  const mentions = (ref: string) => input.article === ref || references.includes(ref);
  const report = normalizeLegalText(input.citizenMessages.join('\n'));
  if (input.kind === 'orientacao_final') {
    const privateSeller = /\b(?:vizinh\w*|particular|pessoa fisica)\b/.test(report)
      && /\b(?:nao|nunca)\b[^.!?\n]{0,30}\b(?:vende|atua|trabalha|comercializa)\b[^.!?\n]{0,35}\b(?:profissional\w*|habitual\w*)\b/.test(report);
    const directTax = /\b(?:iptu|ipva|itbi|itr)\b/.test(report) && /\b(?:cobranca|cobrou|cobraram|imposto|tributo)\b/.test(report)
      && !/\b(?:loja|banco|plataforma|cartao|servico|produto|empresa)\b/.test(report);
    const tenancy = /\b(?:aluguel|locacao)\b[^.!?\n]{0,40}\b(?:imovel|residencial|apartamento|casa)\b/.test(report)
      && !/\b(?:corretagem|intermediacao|taxa de administracao)\b/.test(report);
    if (privateSeller) { scopeVeto = 'private'; add('fornecedor_profissional_explicitamente_negado'); }
    else if (directTax) { scopeVeto = 'tax'; add('cobranca_tributaria_sem_relacao_de_consumo'); }
    else if (tenancy) { scopeVeto = 'lease'; add('enquadramento_locacao_nao_verificado'); }
  }
  const timed = containsLegalDeadline(input.text);
  const timing = quantities(input.text);
  for (const reason of inspectOutputClaims({ text, article: input.article, references, durations: timing,
    clauses: clauses(input.text).map(clause => ({ text: clause, references: legalReferencesIn(clause) })), sources: supported })) add(reason);
  if (timing.some(value => value.startsWith('inconsistent:'))) add('quantidade_temporal_contraditoria');
  if (input.kind !== 'orientacao_final' && timing.length) add('prazo_quantificado_em_resposta_nao_final');
  const complaintContext = mentions('Art. 26') || /\b(?:prazo|contagem)\b[^.!?\n]{0,60}\b(?:reclamar|reclamacao|vicio oculto|defeito oculto)\b/.test(text);
  if (mentions('Art. 49') && timing.length && clauses(text).some(clause =>
    /\b(?:conta\w*|comec\w*|a partir|desde|data|dia)\b/.test(clause)
    && /\b(?:deveria|previst\w*|prometid\w*|estimad\w*)\b[^.!?\n]{0,40}\b(?:cheg\w*|entreg\w*|receb\w*)\b/.test(clause)
    && !/\b(?:nao|nunca)\b[^.!?\n]{0,20}\b(?:conta\w*|comec\w*)\b/.test(clause))) add('marco_arrependimento_sem_recebimento');
  if (mentions('Art. 54-G') && /\bcobranca em confianca\b/.test(text)) add('credito_em_confianca_sentido_invertido');
  if (mentions('Art. 49') && timing.includes('7:days')) {
    const receiptAnchor = /\b(?:recebimento|assinatura|entrega efetiva)\b/.test(text)
      || /\breceb(?:eu|ido|ida|er)\b[^.!?\n]{0,35}\b(?:produto|servico|mercadoria|encomenda|tenis|aparelho)\b/.test(text);
    if (!receiptAnchor) add('marco_arrependimento_omitido');
    if (/\b(?:nao chegou|nao recebi|nao foi entregue)\b/.test(`${report}\n${text}`)
      && /\b(?:ou|no seu caso|ja que)\b[^.!?\n]{0,65}\b(?:data|dia|momento)\b[^.!?\n]{0,20}\bcompra\b/.test(text)) add('marco_arrependimento_substituido');
  }
  const individualConclusion = /\b(?:ainda esta|esta|estao|continua|ficou|ficaram|voce tem|voce perdeu|seu direito)\b[^.!?\n]{0,45}\b(?:dentro|fora|vencid\w*|prescrit\w*|caduc\w*|expir\w*|encerrad\w*)\b/.test(text)
    || /\b(?:seu prazo|o prazo (?:ja|ainda)|prazo para voce)\b[^.!?\n]{0,55}\b(?:termin\w*|vence\w*|vencid\w*|expir\w*|comecou|encerrou)\b/.test(text)
    || /\b(?:voce ainda tem|restam|faltam|sobram)\s+\d+\s*dias\b/.test(text);
  if (timed && individualConclusion) add('conclusao_individual_prazo_nao_verificada');
  if (timed && complaintContext && clauses(text).some(clause => /\b(?:a partir|desde|contad\w*|comeca\w*|comecou|inicio|conte)\b[^.!?\n]{0,75}\bcompra\b/.test(clause) && !deniedAnchor(clause, 'compra'))) add('marco_compra_nao_verificado');

  if (timing.length && input.kind === 'orientacao_final') {
    // Quantidade precisa existir no texto normativo da referência, nunca nas keywords.
    for (const clause of clauses(input.text)) for (const value of quantities(clause)) {
      const explicit = legalReferencesIn(clause);
      const candidates = explicit.length ? explicit : input.article ? [input.article] : [];
      const compensation = value.endsWith(':years') && /\b(?:reparacao|indenizacao|danos?)\b/.test(clause) && supported.has('Art. 27');
      if (compensation && !explicit.length) candidates.push('Art. 27');
      if (value.endsWith(':days') && /\b(?:reclamar|reclamacao)\b/.test(clause) && mentions('Art. 26') && supported.has('Art. 26') && !explicit.length) candidates.push('Art. 26');
      if (!candidates.some(ref => supported.has(ref) && quantities(supported.get(ref)!).includes(value))) add('duracao_sem_suporte_na_fonte');
      if (compensation
        && !/\b(?:conhecimento|soube\w*|sabe\w*|ciencia)\b[^.!?;\n]{0,45}\bdano\b[^.!?;\n]{0,80}\b(?:autoria|quem|responsavel)\b/.test(clause)) add('marco_reparacao_danos_nao_verificado');
    }
  }
  if (complaintContext) {
    const hidden = /\b(?:ocult\w*|defeito[^.!?\n]{0,35}(?:eviden\w*|descobert\w*|aparec\w*))\b/.test(text);
    const evidenceTrigger = clauses(text).some(clause => /\b(?:eviden\w*|descobert\w*|manifest\w*|(?:percebeu|notou) (?:o )?defeito)\b/.test(clause) && !deniedAnchor(clause, '(?:eviden|descobert|manifest|perceb|not)\\w*'));
    const apparent = /\b(?:aparente\w*|facil constatacao)\b/.test(text);
    const deliveryTrigger = /\b(?:entrega|recebimento|recebeu|termino|conclusao do servico)\b/.test(text);
    if (evidence.hiddenDefectMentioned && !evidenceTrigger) add('marco_vicio_oculto_omitido');
    const complaintTiming = clauses(text).some(clause => quantities(clause).some(value => value.endsWith(':days')) && !/\b(?:consert\w*|sanar|reparo)\b/.test(clause));
    if (hidden && !evidenceTrigger && (complaintTiming || /\b(?:compra|entrega)\b/.test(text))) add('marco_vicio_oculto_nao_verificado');
    if (complaintTiming && !/\b(?:durave\w*|nao durave\w*)\b/.test(text)) add('natureza_do_bem_nao_especificada');
    if (complaintTiming && !((hidden && evidenceTrigger) || (apparent && deliveryTrigger))) add('condicao_e_marco_do_prazo_omitidos');
    for (const clause of clauses(text)) {
      const hiddenBranch = /\bocult\w*\b/.test(clause), apparentBranch = /\baparente\w*\b/.test(clause);
      const evidenceAnchor = /\b(?:eviden\w*|descobert\w*|manifest\w*|(?:percebeu|notou) (?:o )?defeito)\b/.test(clause) && !deniedAnchor(clause, '(?:eviden|descobert|manifest|perceb|not)\\w*');
      const deliveryAnchor = /\b(?:entrega|recebimento|recebeu)\b/.test(clause) && !deniedAnchor(clause, 'entrega|recebimento|recebeu');
      if (/\b(?:conta\w*|comec\w*|inicio|marco|desde|a partir)\b/.test(clause)
        && ((hiddenBranch && !apparentBranch && deliveryAnchor) || (apparentBranch && !hiddenBranch && evidenceAnchor && !deliveryAnchor))) add('relacao_entre_hipotese_e_marco_incorreta');
    }
    if (clauses(text).some(clause => asserted(clause, /\b(?:trata-se de (?:um )?|e (?:um )?|configura (?:um )?)vicio oculto\b/))) add('enquadramento_vicio_oculto_nao_confirmado');
    if (/\b(?:qualquer|todo|todos)\s+(?:o\s+)?produt\w*\b/.test(text) && timing.length) add('prazo_universal_nao_verificado');
  }
  if (mentions('Art. 27') && clauses(text).some(clause => /\b(?:conserto|consertar|troca|reparo|reparar o produto)\b/.test(clause) && quantities(clause).some(value => value.endsWith(':years')))) add('prescricao_confundida_com_reparo');
  if (mentions('Art. 18')) {
    if (unsafeRepairExtension(text)) add('ampliacao_sem_convencao_verificada');
    if (/\b(?:qualquer situacao|sempre|obrigatoriamente|em todos os casos)\b/.test(text) && /\b(?:esperar|aguardar)\b/.test(text)) add('excecoes_do_reparo_omitidas');
  }
  if (mentions('Art. 14') && evidence.serviceQualityMentioned && /\b(?:reexecut\w*|reexecuc\w*|refazer)\b/.test(text)) add('vicio_servico_referencia_incompativel');
  const refund = /\b(?:dobro|repeticao do indebito|restitu\w*|devol\w*)\b/.test(text);
  const theory = /^(?:em geral|explique|como funciona|o que (?:diz|significa))\b/.test(normalizeLegalText(input.citizenMessages.at(-1) ?? ''))
    && !/\b(?:meu|minha|comigo|fiz|recebi|paguei|comprei)\b/.test(normalizeLegalText(input.citizenMessages.at(-1) ?? ''));
  if (input.kind === 'orientacao_final' && mentions('Art. 42') && evidence.transferMentioned && evidence.collection !== 'reported' && !theory) add('transferencia_sem_cobranca_confirmada');
  if (mentions('Art. 42') && /\bdobro\b/.test(text)) {
    const correctException = /\b(?:salvo|exceto|ressalvad\w*|excecao|a menos que)\b[^.!?;\n]{0,85}\bengano justificavel\b/.test(text)
      || /\b(?:se|caso|quando)\s+nao\s+(?:houver|haja|houve|existir|exista)\b[^.!?;\n]{0,30}\bengano justificavel\b/.test(text);
    const invertedException = clauses(text).some(clause => /\b(?:se|caso|quando)\s+(?:houver|haja|houve|existir|exista)\b[^.!?;\n]{0,30}\bengano justificavel\b/.test(clause) && !/\b(?:excecao|salvo|exceto)\b/.test(clause));
    if (invertedException) add('ressalva_restituicao_invertida');
    else if (!correctException) add(/\bengano justificavel\b/.test(text) ? 'ressalva_restituicao_nao_verificada' : 'ressalva_restituicao_omitida');
  }
  const personalRefundWithoutPayment = clauses(text).some(clause =>
    /\b(?:repeticao do indebito|receber de volta|restitu\w*|devol\w*)\b/.test(clause)
    && /\b(?:voce|seu|sua|valor|quantia cobrada|direito|possibilidade)\b/.test(clause)
    && !/\b(?:se|caso|quando)\b[^.!?;\n]{0,70}\b(?:pagou|pago|pagamento|paga|pagamento excessivo)\b/.test(clause));
  if (mentions('Art. 42') && refund && personalRefundWithoutPayment && evidence.payment !== 'reported' && !theory) add('pagamento_nao_confirmado_para_restituicao');
  if (refund && clauses(text).some(clause => asserted(clause, /\b(?:automatic\w*|recebera|vai receber|deve devolver|tem direito garantido)\b/))) add('restituicao_ou_resultado_garantido');
  if (refund && evidence.payment === 'denied' && /\b(?:voce (?:recebe\w*|tem direito)|deve devolver|mesmo sem (?:ter )?pago)\b/.test(text)) add('restituicao_sem_pagamento');
  if (refund && evidence.payment === 'denied' && /\b(?:apresent\w*|envi\w*|junt\w*)\b[^.!?;\n]{0,50}\bcomprovante\w* (?:de|do) pagamento\b/.test(text)) add('comprovante_de_pagamento_negado');
  if (evidence.transferMentioned && evidence.collection !== 'reported' && refund && /\b(?:como houve cobranca|pix[^.!?\n]{0,70}(?:gera|garante)|deve devolver)\b/.test(text)) add('transferencia_sem_cobranca_confirmada');

  let question: string | null = null;
  if (reasons.includes('transferencia_sem_cobranca_confirmada')) question = 'Houve uma cobrança feita pelo banco ou pela loja, ou foi uma transferência para um destinatário diferente do pretendido?';
  else if (reasons.includes('pagamento_nao_confirmado_para_restituicao') && evidence.payment === 'unknown') question = 'Essa cobrança chegou a ser paga ou foi apenas lançada para pagamento?';
  return { passed: !reasons.length, reasons, evidence, question, scopeVeto };
}
