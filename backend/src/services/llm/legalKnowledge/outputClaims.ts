/** Contratos delimitados de conteúdo. Não avaliam toda a semântica da resposta. */
interface Clause { text: string; references: string[] }
interface Input {
  text: string;
  article: string | null;
  references: string[];
  durations: string[];
  clauses: Clause[];
  sources: ReadonlyMap<string, string>;
}

// Nega o próprio predicado; "sem custo" antes de outra alternativa não o nega.
function claims(text: string, pattern: RegExp): boolean {
  return [...text.matchAll(new RegExp(pattern.source, 'g'))].some(match => {
    const before = text.slice(0, match.index);
    const after = text.slice(match.index! + match[0].length);
    return !/\b(?:nao|nem|sem)\s+(?:(?:pode|deve|ha|cabe|cabivel|existe|e|tem|direito|caso|de|do|a|ao|o|se|aplica|aplicavel|permitido|possivel|pedir|exigir|solicitar|depende|exige|precisa|garante|garantido|garantida|garantir)\s+){0,6}$/.test(before)
      && !/^\s+nao\s+(?:e|cabe|existe|pode|se aplica)\b/.test(after);
  });
}
const reexecution = /\b(?:reexecu\w*|refazer|refeito|nova execucao|feito de novo)\b/;
const restitution = /\b(?:restitu\w*|reembolso|dinheiro de volta|(?:devolu\w*|devolv\w*)[^.!?;\n]{0,40}(?:valor|dinheiro|quantia|pago))\b/;
const reduction = /\b(?:abatimento|desconto|reducao proporcional)\b/;

export function inspectOutputClaims(input: Input): string[] {
  const reasons: string[] = [];
  const add = (reason: string) => { if (!reasons.includes(reason)) reasons.push(reason); };
  const sourceText = (ref: string) => (input.sources.get(ref) ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const applies = (number: number) => input.article === `Art. ${number}` || input.clauses.some(clause => clause.references.includes(`Art. ${number}`)
    && claims(clause.text, new RegExp(`\\bart(?:igo)?\\s*${number}\\b`)));
  const withdrawn = input.clauses.some(clause => claims(clause.text, /\b(?:arrepend\w*|desist\w*|cancel\w*|devolver|devolucao)\b/));
  if (applies(49) && withdrawn && !input.durations.includes('7:days')) add('prazo_arrependimento_omitido');

  if (applies(20)) {
    const source = sourceText('Art. 20');
    // Só aplica o contrato de lista quando as três alternativas constam da fonte.
    if (/reexecu/i.test(source) && /restitui/i.test(source) && /abatimento/i.test(source)) {
      const flags = [reexecution, restitution, reduction].map(pattern => input.clauses.some(clause => claims(clause.text, pattern)));
      const enumerated = flags.filter(Boolean).length;
      const completeListClaim = /\b(?:alternativamente|escolher entre|optar entre|opcoes sao|alternativas sao)\b/.test(input.text);
      if (enumerated >= 2 || (enumerated > 0 && completeListClaim)) {
        if (!flags[0]) add('art20_reexecucao_omitida');
        if (!flags[1]) add('art20_restituicao_omitida');
        if (!flags[2]) add('art20_abatimento_omitido');
      }
    }
  }

  let inherited = input.article;
  for (const clause of input.clauses) {
    const activeReferences = clause.references.filter(ref => claims(clause.text,
      new RegExp(`\\bart(?:igo)?\\s*${ref.replace('Art. ', '').toLowerCase().replace('-', '\\s*-?\\s*')}\\b`)));
    if (activeReferences.length) inherited = activeReferences.at(-1)!;
    const linkedReferences = activeReferences.length ? activeReferences : inherited ? [inherited] : [];
    const fiveDayRule = /\b(?:prazo|limite)\b[^.!?;\n]{0,50}\b(?:5|cinco)\s+dias\b/.test(clause.text)
      || /\b(?:ate|em|dentro de|no maximo)\s+(?:ate )?(?:5|cinco)\s+dias\b/.test(clause.text)
      || /\b(?:5|cinco)\s+dias(?:\s+uteis)?\s+(?:para|sao|e)\b/.test(clause.text);
    if (linkedReferences.includes('Art. 43') && fiveDayRule) {
      const notification = /\b(?:comunic\w*|avis\w*|inform\w*|notific\w*)\b/.test(clause.text)
        && /\b(?:destinatari\w*|terceir\w*|quem recebeu|quem recebeu anteriormente|pessoas que receberam)\b/.test(clause.text);
      const deniesCorrectionDeadline = /\bnao\s+(?:e|sao|servem|se destinam)\b[^.!?;\n]{0,35}\b(?:corrigir|correcao)\b/.test(clause.text);
      const correctionBeforeFive = [...clause.text.matchAll(/\b(?:corrigir|correcao|retificar)\b([^,;.!?\n]{0,65})\b(?:5|cinco)\s+dias\b/g)]
        .some(match => !/\b(?:comunic\w*|avis\w*|inform\w*|notific\w*)\b/.test(match[1]!));
      const fiveForCorrection = /\b(?:5|cinco)\s+dias(?:\s+uteis)?\s+(?:para|pra)\s+(?:a )?(?:corrigir|correcao|retificar)\b/.test(clause.text);
      if ((!notification || correctionBeforeFive || fiveForCorrection) && !deniesCorrectionDeadline) add('art43_prazo_finalidade_incorreta');
    }
    if (linkedReferences.includes('Art. 39') && /\b(?:tambem|automatic\w*)\b/.test(clause.text)
      && /\bsem (?:qualquer )?(?:onus|multa|custo)\b/.test(clause.text)
      && claims(clause.text, /\b(?:deve|sera)\s+(?:ser )?cancelad\w*\b/)) add('cancelamento_vinculado_nao_verificado');
    if (linkedReferences.includes('Art. 35') && !linkedReferences.includes('Art. 20')
      && claims(clause.text, /\bcontrat\w*\b[^.!?;\n]{0,40}\b(?:outro profissional|terceir\w*)\b/)
      && claims(clause.text, /\b(?:ressarc\w*|reembolso|por conta do fornecedor)\b/)) add('reexecucao_terceiro_referencia_incompativel');
    const correction = /\b(?:corrig\w*|correcao|retific\w*)\b/g;
    if (linkedReferences.includes('Art. 72') && /\b(?:cadastro|dados|informac\w*|registro)\b/.test(clause.text)
      && claims(clause.text, /\b(?:infracao|crime|penal|detencao|pena)\b/)) {
      const citations = [...clause.text.matchAll(/\bart(?:igo)?\s*(72|73)\b/g)];
      for (const predicate of clause.text.matchAll(correction)) {
        const nearest = [...citations].sort((a, b) => Math.abs(a.index! - predicate.index!) - Math.abs(b.index! - predicate.index!))[0];
        const linked = nearest ? `Art. ${nearest[1]}` : inherited;
        // "não corrigir" é a conduta descrita; não é negação da atribuição penal.
        if (linked === 'Art. 72' && !/\b(?:nao|nem)\s+(?:a |de |pela |por )(?:mera )?(?:falta de )?(?:correcao|corrigir)\b/.test(clause.text)) add('art72_correcao_atribuicao_incompativel');
      }
    }

    const refund = /\b(?:restitu\w*|devolu\w*|devolv\w*|repeticao|reembolso|receber[^.!?;\n]{0,60}(?:valor|dinheiro)[^.!?;\n]{0,30}volta)\b/.test(clause.text);
    const interestClaim = claims(clause.text, /\b(?:com|mais|inclui\w*|acrescid\w* de)\s+(?:os )?juros\b/);
    if (refund && interestClaim && !linkedReferences.some(ref => {
      const source = sourceText(ref);
      return /\bjuros\b/i.test(source) && /\b(?:restitui\w*|repeti\w*|devolu\w*)\b/i.test(source);
    })) add('juros_restituicao_sem_fonte');

    const damages = /\b(?:indeniza\w*|perdas e danos)\b/.test(clause.text);
    const guaranteed = claims(clause.text, /\bindenizacao (?:e )?(?:garantida|automatica)\b/);
    const promised = claims(clause.text, /\b(?:voce (?:tem (?:o )?direito|tera|recebera)|sera indenizad\w*|vai (?:receber|indenizar))\b/);
    const rightToRequest = /\bdireito (?:de|a) (?:pedir|solicitar|buscar|pleitear|requerer|reclamar)\b/.test(clause.text);
    const conditional = claims(clause.text, /\b(?:pode|podera|eventuais|se comprovad\w*|caso comprovad\w*|danos comprovados|depende|avali\w*|analise)\b/);
    if (damages && (guaranteed || (promised && !rightToRequest && !conditional))) add('indenizacao_resultado_nao_verificado');
  }
  return reasons;
}
