import type { RagResult } from '../llmService.js';
import { clarificationRounds, decodeSession, initialSnapshot, persistable } from '../../conversation/state.js';

export const MAX_CLARIFICATIONS = 2;

export function clarificationCount(state: string | null | undefined): number {
  return clarificationRounds(decodeSession({ stepState: state ?? null, isChat: true }).snapshot.state);
}

export function clarificationState(count: number): string {
  return persistable({ ...initialSnapshot({ currentStepId: null, isChat: true }), state: { kind: 'FREE_CHAT', clarifications: Math.max(0, Math.min(count, MAX_CLARIFICATIONS)) } }).stepState;
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
