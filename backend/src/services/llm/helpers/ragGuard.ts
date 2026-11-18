/** Barreiras conservadoras para confusões observadas em teste integrado.
 * Não constituem validação jurídica completa do texto gerado.
 */
import { unsafeRepairExtension } from '../legalKnowledge/safety.js';
export function inspectProductDeadline(
  text: string,
  article: string | null,
): { complaintDeadline: boolean; extendedWithoutAgreement: boolean } {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (article !== 'Art. 18' && !/\bart(?:igo)?\.?\s*18\b/.test(normalized)) {
    return { complaintDeadline: false, extendedWithoutAgreement: false };
  }
  // Art. 18: os trinta dias são para sanar o vício, não para o cidadão reclamá-lo.
  const complaintDeadline = [...normalized.matchAll(/\b(?:30|trinta)\s*dias\b[^.!?\n]{0,100}\b(?:reclamar|informar|avisar|comunicar|notificar)\b/g)]
    .some(match => !/\b(?:nao|nem)\b/.test(match[0]));
  // A ampliação do prazo não é automática: depende de convenção das partes.
  const extendedWithoutAgreement = unsafeRepairExtension(text);
  return { complaintDeadline, extendedWithoutAgreement };
}

export function hasUnverifiedProductDeadline(text: string, article: string | null): boolean {
  const { complaintDeadline, extendedWithoutAgreement } = inspectProductDeadline(text, article);
  return complaintDeadline || extendedWithoutAgreement;
}

/** Reprova a troca observada entre vício de produto e responsabilidade por serviço/acidente.
 * A regra é restrita a relatos explícitos de mau funcionamento, sem serviço ou dano externo.
 */
export function hasMismatchedProductReference(query: string, article: string | null): boolean {
  if (article !== 'Art. 13' && article !== 'Art. 14') return false;
  const normalized = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const product = /\b(?:celular|telefone|geladeira|televisao|televisor|notebook|computador|eletrodomestico|produto|aparelho)\b/.test(normalized);
  const malfunction = /\b(?:nao (?:liga|funciona)|defeito|defeituos[oa]|vicio)\b/.test(normalized);
  const otherContext = /\b(?:servico|assistencia|conserto|reparo|tecnico|feri\w*|lesao|incendio|explosao|explodiu|machuc\w*|queimadura|fabricante nao identificado)\b/.test(normalized);
  return product && malfunction && !otherContext;
}

export interface RagGuardEvaluation {
  passed: boolean;
  primaryReason: string | null;
  triggeredRules: string[];
}

export function evaluateRagGuards(params: {
  text: string;
  article: string | null;
  knownArticle: boolean;
  queryContext: string;
}): RagGuardEvaluation {
  const triggeredRules: string[] = [];
  if (!params.knownArticle) triggeredRules.push('referencia_fora_candidatos');

  const deadline = inspectProductDeadline(params.text, params.article);
  if (deadline.complaintDeadline) triggeredRules.push('prazo_30_dias_reclamar');
  if (deadline.extendedWithoutAgreement) triggeredRules.push('prazo_180_dias_sem_acordo');

  if (hasMismatchedProductReference(params.queryContext, params.article)) {
    triggeredRules.push('produto_referencia_incompativel');
  }

  const primaryReason = !params.knownArticle
    ? 'referencia_fora_candidatos'
    : deadline.complaintDeadline || deadline.extendedWithoutAgreement
      ? 'prazo_produto_nao_verificado'
      : triggeredRules.includes('produto_referencia_incompativel')
        ? 'produto_referencia_incompativel'
        : null;

  return {
    passed: triggeredRules.length === 0,
    primaryReason,
    triggeredRules,
  };
}
