import type { ArticleResult } from '../../../database/repositories/knowledgeRepository.js';
import { reciprocalRankFusion } from '../../../utils/functions/hybridSearch.js';
import { articleReferences } from './articleReference.js';

export const RETRIEVAL_CONTEXT_LIMITS = { base: 4, documents: 6, extra: 2, characters: 12000 } as const;
type Ranked = { id: string };

/** Preserva o ranking histórico; identifica evidência forte perdida por consenso. */
export function rankHybridCandidates(vectors: Ranked[], originalLexical: Ranked[], usedLexical: Ranked[]) {
  const lexicalIds = reciprocalRankFusion([originalLexical, usedLexical], 10);
  const hybridIds = reciprocalRankFusion([vectors, lexicalIds.map(id => ({ id }))], vectors.length + lexicalIds.length);
  const baseIds = hybridIds.slice(0, RETRIEVAL_CONTEXT_LIMITS.base);
  const strong = new Set([...vectors.slice(0, 4).map(row => row.id), ...lexicalIds.slice(0, 1)]);
  return { baseIds, hybridIds, strongIds: hybridIds.filter(id => strong.has(id)) };
}

export function renderRetrievedArticles(articles: ArticleResult[]): string {
  return articles.map(article => `[LEI: ${article.title}]\n${article.content.replace(/\(PALAVRAS-CHAVE PARA BUSCA:.*?\)/gi, '').trim()}${article.distincao ? `\nDISTINÇÃO: ${article.distincao}` : ''}`).join('\n\n');
}

export interface RetrievalSelectionDiagnostics {
  policy: 'stable_rrf_with_bounded_rescue_v1';
  baseIds: string[];
  strongIds: string[];
  addedIds: string[];
  omitted: { id: string; reason: 'document_limit' | 'extra_limit' | 'character_limit' | 'displaced_by_auxiliary' | 'missing_source' }[];
  initialDocuments: number;
  finalDocuments: number;
  initialCharacters: number;
  finalCharacters: number;
  existingContextOverBudget: boolean;
}

/** Regras auxiliares e fontes já presentes têm prioridade; nunca trunca uma lei. */
export function expandRetrievalContext(input: {
  ranking: ReturnType<typeof rankHybridCandidates>;
  current: ArticleResult[];
  candidates: ArticleResult[];
  auxiliaryCharacters: number;
  displacedReferences: string[];
}) {
  const articles = [...input.current];
  const characters = (rows: ArticleResult[]) => renderRetrievedArticles(rows).length + input.auxiliaryCharacters;
  const diagnostics: RetrievalSelectionDiagnostics = {
    policy: 'stable_rrf_with_bounded_rescue_v1', baseIds: input.ranking.baseIds, strongIds: input.ranking.strongIds,
    addedIds: [], omitted: [], initialDocuments: articles.length, finalDocuments: articles.length,
    initialCharacters: characters(articles), finalCharacters: characters(articles),
    existingContextOverBudget: characters(articles) > RETRIEVAL_CONTEXT_LIMITS.characters,
  };
  for (const id of input.ranking.strongIds) {
    if (input.ranking.baseIds.includes(id) || articles.some(article => article.id === id)) continue;
    const article = input.candidates.find(row => row.id === id);
    const reason = !article?.content.trim() ? 'missing_source'
      : articleReferences(article.title).some(ref => input.displacedReferences.includes(ref)) ? 'displaced_by_auxiliary'
      : diagnostics.addedIds.length >= RETRIEVAL_CONTEXT_LIMITS.extra ? 'extra_limit'
      : articles.length >= RETRIEVAL_CONTEXT_LIMITS.documents ? 'document_limit'
      : characters([...articles, article]) > RETRIEVAL_CONTEXT_LIMITS.characters ? 'character_limit' : null;
    if (reason) { diagnostics.omitted.push({ id, reason }); continue; }
    articles.push(article!); diagnostics.addedIds.push(id);
  }
  diagnostics.finalDocuments = articles.length;
  diagnostics.finalCharacters = characters(articles);
  return { articles, diagnostics };
}
