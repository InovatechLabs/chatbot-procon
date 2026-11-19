import { createRagService, MAX_VECTOR_DISTANCE } from '../../src/services/llm/llmService.js';
import type { ArticleResult } from '../../src/database/repositories/knowledgeRepository.js';
import { articleReferences, normalizeReference } from '../../src/services/llm/helpers/articleReference.js';
import { buildBM25Index } from '../../src/utils/functions/bm25.js';
import { reciprocalRankFusion } from '../../src/utils/functions/hybridSearch.js';
import type { LegalRulesMode } from '../../src/services/llm/legalKnowledge/context.js';

export interface AuditInput {
  question: string;
  history: { autor: string; mensagem: string }[];
  expected: string;
  recordedQuery?: string;
  observedOriginalQuery?: string;
  mode: LegalRulesMode;
}
type VectorRow = { id: string; distance: number };
export const expectedRank = (ids: string[], expected: string): number | null => {
  const target = normalizeReference(expected);
  const index = ids.findIndex(id => articleReferences(id).includes(target ?? ''));
  return index < 0 ? null : index + 1;
};
export const within = (rank: number | null, limit: number) => rank !== null && rank <= limit;

/** Observa o serviço real. O gerador é um stub local; triagem é deliberadamente ignorada. */
export async function auditRetrieval(input: AuditInput, knowledge: ArticleResult[], dependencies: {
  embed: (query: string) => Promise<number[]>;
  vectors: (vector: string, limit?: number) => Promise<VectorRow[]>;
}) {
  const traces: { query: string; productionTop10: VectorRow[]; fullRanking: VectorRow[] }[] = [];
  let lastQuery = '', finalReferences: string[] = [], stubCalls = 0;
  const history = input.history.map((row, index) => ({ id: `audit-${index}`, direction: row.autor === 'Cidadão' ? 'INBOUND' : 'OUTBOUND', messageText: row.mensagem, stepId: null }));
  const run = createRagService({
    db: {
      userSession: { findUnique: async () => null },
      chatLog: { findMany: async ({ where, orderBy, take }: any) => {
        const rows = history.filter(row => !where.direction || row.direction === where.direction);
        return (orderBy.timestamp === 'desc' ? [...rows].reverse() : rows).slice(0, take);
      } },
    } as any,
    classify: async () => { throw new Error('ClassifierForbiddenInRetrievalAudit'); },
    embed: async query => { lastQuery = query; return dependencies.embed(query); },
    vectors: async vector => {
      // Retorna o LIMIT 10 original; a consulta adicional só observa posições fora dele.
      const productionTop10 = await dependencies.vectors(vector, 10);
      const fullRanking = await dependencies.vectors(vector, Math.max(20, knowledge.length));
      if (fullRanking.some(row => !Number.isFinite(row.distance))) throw new Error('InvalidVectorDistance');
      traces.push({ query: lastQuery, productionTop10, fullRanking });
      return productionTop10;
    },
    articles: async () => knowledge,
    generate: async (_prompt, schema: any) => {
      stubCalls++;
      finalReferences = schema.properties.artigo.enum.filter((ref: unknown): ref is string => typeof ref === 'string');
      return JSON.stringify({ tipoResposta: 'redirecionamento', artigo: null, texto: 'Avaliação isolada de recuperação.' });
    },
  });
  const result = await run(input.question, 'fictional-retrieval-audit', {
    includeDiagnostics: true, legalRulesMode: input.mode,
    preClassification: { categoria: 'CONSUMO', informacaoSuficiente: true, motivo: 'Triagem ignorada para isolar a recuperação.',
      ...(input.recordedQuery ? { consultaBusca: input.recordedQuery } : {}) },
  });
  const diag = result.diagnostics;
  if (!diag || !['sem_candidatos_vetor', 'modelo_redirecionou'].includes(diag.motivoDescarte ?? '')) throw new Error('UnexpectedRetrievalAuditOutcome');
  if (input.recordedQuery && !input.observedOriginalQuery) throw new Error('OriginalQueryObservationRequired');
  const original = input.observedOriginalQuery ?? traces[0]!.query;
  const active = traces.at(-1)!;
  const lexical = buildBM25Index(knowledge);
  const lexicalOriginal: { id: string; score: number }[] = lexical.search(original, knowledge.length);
  const lexicalUsedQuery: { id: string; score: number }[] = lexical.search(active.query, knowledge.length);
  const fusedLexical = reciprocalRankFusion([lexicalOriginal.slice(0, 10), lexicalUsedQuery.slice(0, 10)], knowledge.length);
  const acceptedVectors = active.productionTop10.filter(row => row.distance <= MAX_VECTOR_DISTANCE);
  const reachedLexical = acceptedVectors.length > 0;
  // Diagnóstico contrafactual quando a porta vetorial impediu executar o BM25.
  const hybridPool = reciprocalRankFusion([acceptedVectors, fusedLexical.slice(0, 10).map(id => ({ id }))], knowledge.length);
  if (reachedLexical && JSON.stringify(hybridPool.slice(0, 4)) !== JSON.stringify(diag.candidatosRecuperados.slice(0, 4))) throw new Error('AuditRankingMismatch');
  const ranks = {
    vectorFull: expectedRank(active.fullRanking.map(row => row.id), input.expected),
    vectorTop10: expectedRank(active.productionTop10.map(row => row.id), input.expected),
    vectorAfterThreshold: expectedRank(acceptedVectors.map(row => row.id), input.expected),
    lexicalOriginal: expectedRank(lexicalOriginal.map(row => row.id), input.expected),
    lexicalUsedQuery: expectedRank(lexicalUsedQuery.map(row => row.id), input.expected),
    fusedLexicalTop10: expectedRank(fusedLexical.slice(0, 10), input.expected),
    hypotheticalHybridPool: expectedRank(hybridPool, input.expected),
    productionTop4: expectedRank(diag.candidatosRecuperados.slice(0, 4), input.expected),
    productionSelected: expectedRank(diag.candidatosRecuperados, input.expected),
  };
  const finalContextContainsExpected = finalReferences.includes(normalizeReference(input.expected) ?? '');
  const targetInKnowledge = knowledge.some(row => articleReferences(row.title).includes(normalizeReference(input.expected) ?? ''));
  const lossStage = !targetInKnowledge ? 'missing_knowledge' : !reachedLexical ? 'vector_gate'
    : finalContextContainsExpected ? (ranks.productionTop4 !== null ? 'retained' : ranks.productionSelected !== null ? 'rescued_by_fusion' : 'rescued_by_auxiliary')
    : ranks.productionSelected !== null ? 'auxiliary_context_removed'
    : ranks.hypotheticalHybridPool === null ? 'outside_candidate_pool' : 'fusion_top4_cut';
  return { originalQuery: original, usedQuery: active.query, ranks, lossStage, reachedLexical, finalContextContainsExpected,
    vectorAttempts: traces, lexicalOriginal, lexicalUsedQuery, fusedLexicalTop10: fusedLexical.slice(0, 10),
    hypotheticalHybridPool: hybridPool, productionCandidates: diag.candidatosRecuperados, finalReferences,
    auxiliary: diag.regrasAuxiliares, selection: diag.selecaoRecuperacao, syntheticGeneratorCalls: stubCalls, gemmaCalls: 0 };
}

export function summarizeRetrieval(rows: { error?: string; audit?: Awaited<ReturnType<typeof auditRetrieval>> }[]) {
  return { total: rows.length, errors: rows.filter(row => row.error).length,
    productionTop4Hits: rows.filter(row => row.audit?.ranks.productionTop4 !== null && row.audit?.ranks.productionTop4 !== undefined).length,
    productionSelectedHits: rows.filter(row => row.audit?.ranks.productionSelected !== null && row.audit?.ranks.productionSelected !== undefined).length,
    finalContextHits: rows.filter(row => row.audit?.finalContextContainsExpected).length,
    hypotheticalRecallHits: Object.fromEntries([4, 6, 10, 20].map(k => [k, rows.filter(row => row.audit?.reachedLexical && within(row.audit.ranks.hypotheticalHybridPool, k)).length])),
    meanReciprocalRankTop4: rows.reduce((sum, row) => sum + (row.audit?.ranks.productionTop4 ? 1 / row.audit.ranks.productionTop4 : 0), 0) / (rows.length || 1),
  };
}
