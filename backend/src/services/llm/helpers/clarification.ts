import type { RagResult } from '../llmService.js';

export const MAX_CLARIFICATIONS = 2;
const STATE_PREFIX = 'AI_CLARIFY:';

export function clarificationCount(state: string | null | undefined): number {
  if (!state?.startsWith(STATE_PREFIX)) return 0;
  const count = Number(state.slice(STATE_PREFIX.length));
  return Number.isInteger(count) && count > 0 ? Math.min(count, MAX_CLARIFICATIONS) : 0;
}

export function clarificationState(count: number): string {
  return `${STATE_PREFIX}${Math.min(count, MAX_CLARIFICATIONS)}`;
}

/** Só limita outra pergunta: detalhes suficientes ainda podem produzir orientação. */
export function applyClarificationLimit(result: RagResult, count: number): RagResult {
  if (result.tipoResposta !== 'clarificacao' || count < MAX_CLARIFICATIONS) return result;
  return {
    ...result,
    tipoResposta: 'redirecionamento',
    artigo: null,
    texto: 'Ainda não consegui entender os detalhes para orientar com segurança. A equipe pode ouvir e analisar seu caso presencialmente. Quer agendar?',
    ...(result.diagnostics ? { diagnostics: { ...result.diagnostics, motivoDescarte: 'excesso_clarificacoes' } } : {}),
  };
}
