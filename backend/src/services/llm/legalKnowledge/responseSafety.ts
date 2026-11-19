import { inspectLegalSafety } from './safety.js';
import type { SafetyCheck, SafetyDecision } from './safety.js';
import { hasMismatchedProductReference, hasUnverifiedProductDeadline } from '../helpers/ragGuard.js';

/** Mesmo ponto de decisão para produção e replay de respostas fictícias do modelo. */
export function evaluateGeneratedSafety(input: SafetyCheck): SafetyDecision {
  const decision = inspectLegalSafety(input);
  const legacy: string[] = [];
  if (input.kind === 'orientacao_final') {
    if (!input.article) legacy.push('referencia_formato_invalido');
    else if (!input.sources.some(source => source.reference === input.article)) legacy.push('referencia_fora_candidatos');
    if (hasUnverifiedProductDeadline(input.text, input.article)) legacy.push('prazo_produto_nao_verificado');
    if (hasMismatchedProductReference(input.citizenMessages.join('\n'), input.article)) legacy.push('produto_referencia_incompativel');
  }
  const reasons = [...new Set([...legacy, ...decision.reasons])];
  return { ...decision, passed: !reasons.length, reasons, question: legacy.length ? null : decision.question };
}
