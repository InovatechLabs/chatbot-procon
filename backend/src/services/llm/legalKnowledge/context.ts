import { readFileSync } from 'node:fs';
import { legalRuleCatalogSchema } from './catalog.js';
import type { LegalRule, LegalRuleCatalog } from './catalog.js';
import type { ArticleResult } from '../../../database/repositories/knowledgeRepository.js';
import { articleReferences } from '../helpers/articleReference.js';

export type LegalRulesMode = 'off' | 'approved' | 'preview';
let cached: LegalRuleCatalog | undefined;
export function loadLegalRuleCatalog(): LegalRuleCatalog {
  return cached ??= legalRuleCatalogSchema.parse(JSON.parse(readFileSync(new URL('../../../database/data/legalRules.json', import.meta.url), 'utf8')));
}

export interface LegalContextDiagnostics {
  mode: LegalRulesMode;
  catalogVersion: number | null;
  selectedRules: string[];
  draftRules: string[];
  omittedRules: { id: string; reason: 'missing_source' | 'budget' | 'group_limit' | 'incomplete_family' }[];
  addedArticles: string[];
  displacedArticles: string[];
  replacedDistinctions: string[];
  quarantinedDistinctions: string[];
  contextCharacters: number;
}
const unique = <T>(items: T[]) => [...new Set(items)];
const retrievalText = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const retrievalTokens = (text: string) => retrievalText(text).split(' ').map(token => token.replace(/oes$/, 'ao').replace(/s$/, '')).join(' ');
/** Frases completas: "não funciona" não pode corresponder somente a "não". */
function thematicScore(group: string, rules: LegalRule[], query: string): number {
  const normalized = retrievalText(query);
  const padded = ` ${retrievalTokens(query)} `;
  const matches = unique(rules.flatMap(rule => rule.retrieval.terms).map(retrievalTokens))
    .filter(term => term && padded.includes(` ${term} `));
  if (!matches.length) return 0;
  // Termos genéricos (produto/serviço/entrega) não comprovam pertinência da família.
  const defect = /\b(?:defeit\w*|vicio\w*|quebrad\w*|parou|malfeit\w*|mal feito|nao funciona|nao liga|conserto|reparo|amassad\w*)\b/.test(normalized);
  if (group === 'product' && !defect) return 0;
  const serviceCase = /\b(?:servico|instalacao|pintura|oficina)\b/.test(normalized) && !/\b(?:comprei|compra|comprado|comprada)\b/.test(normalized);
  if (group === 'product' && serviceCase) return 0;
  if (group === 'repair' && serviceCase && !/\b(?:conserto|reparo|assistencia tecnica)\b/.test(normalized)) return 0;
  if (group === 'service' && !defect && !/\b(?:refazer|reexec\w*)\b/.test(normalized)) return 0;
  if (group === 'repair' && !defect && !/\bassistencia tecnica\b/.test(normalized)) return 0;
  if (group === 'collection' && !/\b(?:cobranc\w*|cobraram|cobrou|cobrando|divida|boleto|fatura|indebito)\b/.test(normalized)) return 0;
  if (group === 'complaint' && !/\b(?:prazo|garantia|reclamar|reclamacao|oculto|oculta)\b/.test(normalized)) return 0;
  // Transferência explícita tem prioridade sobre famílias apenas tangenciais.
  return matches.reduce((sum, term) => sum + (term.includes(' ') ? 2 : 1), 0)
    + (group === 'transfer' && /\b(?:pix|transferencia|transferi|destinatario)\b/.test(normalized) ? 10 : 0);
}

/** Recuperação temática, NÃO avaliação de condições nem confirmação de fatos. */
export function prepareLegalContext(input: {
  catalog: LegalRuleCatalog | null; mode: LegalRulesMode; citizenQuery: string;
  candidates: ArticleResult[]; articles: ArticleResult[];
  limits?: { maxCharacters?: number; maxGroups?: number; maxArticles?: number };
}) {
  const diagnostics: LegalContextDiagnostics = { mode: input.mode, catalogVersion: input.catalog?.version ?? null,
    selectedRules: [], draftRules: [], omittedRules: [], addedArticles: [], displacedArticles: [], replacedDistinctions: [], quarantinedDistinctions: [], contextCharacters: 0 };
  const sanitize = (article: ArticleResult): ArticleResult => {
    // Erro objetivo identificado na auditoria: a anotação antiga do art. 20
    // atribui serviço não entregue ao art. 23. Conserva o conteúdo normativo.
    if (article.distincao && articleReferences(article.title).includes('Art. 20')) {
      if (!diagnostics.quarantinedDistinctions.includes('Art. 20')) diagnostics.quarantinedDistinctions.push('Art. 20');
      return { ...article, distincao: null };
    }
    return article;
  };
  const output = { articles: input.candidates.map(sanitize), instructions: '', diagnostics };
  if (input.mode === 'off' || !input.catalog) return output;
  const eligible = input.catalog.rules.filter(rule => input.mode === 'preview' || rule.review.status === 'approved');
  if (!eligible.length) return output;
  const maxCharacters = input.limits?.maxCharacters ?? 6000;
  const maxGroups = input.limits?.maxGroups ?? 3;
  const maxArticles = input.limits?.maxArticles ?? 6;
  const sources = new Map(input.articles.filter(article => article.content.trim()).flatMap(article => articleReferences(article.title).map(ref => [ref, article] as const)));
  const candidateRefs = new Set(input.candidates.flatMap(article => articleReferences(article.title)));
  const groups = new Map<string, LegalRule[]>();
  for (const rule of eligible) {
    const group = groups.get(rule.retrieval.group) ?? [];
    group.push(rule); groups.set(rule.retrieval.group, group);
  }
  const ranked = [...groups.entries()].map(([group, rules]) => {
    const score = thematicScore(group, rules, input.citizenQuery);
    return { group, rules, score: score > 0 ? score + (rules.some(rule => rule.legalBasis.some(basis => candidateRefs.has(basis.article))) ? 0.3 : 0) : 0 };
  }).filter(group => group.score > 0 && group.group !== 'abstention')
    .sort((a, b) => b.score - a.score || a.group.localeCompare(b.group));
  // A regra operacional só dá uma alternativa condicional; não afirma falta de suporte.
  const abstention = groups.get('abstention');
  if (!ranked.length && abstention) ranked.push({ group: 'abstention', rules: abstention, score: 0 });
  const cards: object[] = [];
  const selected: LegalRule[] = [];
  const omit = (rules: LegalRule[], reason: LegalContextDiagnostics['omittedRules'][number]['reason']) => {
    diagnostics.omittedRules.push(...rules.map(rule => ({ id: rule.id, reason })));
  };
  for (const group of ranked) {
    if (group.rules.length !== input.catalog.rules.filter(rule => rule.retrieval.group === group.group).length) {
      omit(group.rules, 'incomplete_family'); continue;
    }
    if (cards.length >= maxGroups) { omit(group.rules, 'group_limit'); continue; }
    // Uma família é indivisível: desconhecimento da natureza não escolhe um prazo.
    const needed = unique(group.rules.flatMap(rule => rule.legalBasis.map(basis => basis.article)));
    if (needed.some(ref => !sources.has(ref))) { omit(group.rules, 'missing_source'); continue; }
    const additions = unique(needed.map(ref => sources.get(ref)!).filter(article => !output.articles.some(current => current.id === article.id)));
    const retained = [...output.articles];
    const displaced: ArticleResult[] = [];
    // PIX explícito: reserva as fontes da regra específica, removendo apenas
    // candidatos finais que não sustentam esta família ou famílias já incluídas.
    if (group.group === 'transfer') {
      const required = new Set([...needed, ...selected.flatMap(rule => rule.legalBasis.map(basis => basis.article))]);
      for (let index = retained.length - 1; retained.length + additions.length > maxArticles && index >= 0; index--) {
        if (!articleReferences(retained[index]!.title).some(ref => required.has(ref))) displaced.push(...retained.splice(index, 1));
      }
    }
    if (retained.length + additions.length > maxArticles) { omit(group.rules, 'budget'); continue; }
    const card = {
      grupo: group.group,
      notas: unique(group.rules.map(rule => JSON.stringify(rule.modelNotes))).map(note => JSON.parse(note) as object),
      alternativas: group.rules.map(rule => ({ id: rule.id, artigos: unique(rule.legalBasis.map(basis => basis.article)),
        condicoes: rule.conditions, fatosNecessarios: rule.requirements, prazo: rule.deadline,
        seFaltar: rule.onMissingFacts, conflito: rule.onConflict })),
    };
    if (JSON.stringify([...cards, card]).length > maxCharacters) { omit(group.rules, 'budget'); continue; }
    cards.push(card); selected.push(...group.rules); output.articles = [...retained, ...additions.map(sanitize)];
    diagnostics.displacedArticles.push(...displaced.flatMap(article => articleReferences(article.title)));
    diagnostics.addedArticles.push(...additions.flatMap(article => articleReferences(article.title)));
  }
  if (!cards.length) return output;
  const replaced = new Set(selected.flatMap(rule => rule.legalBasis.map(basis => basis.article)));
  diagnostics.selectedRules = selected.map(rule => rule.id);
  diagnostics.draftRules = selected.filter(rule => rule.review.status !== 'approved').map(rule => rule.id);
  diagnostics.replacedDistinctions = unique(output.articles.filter(article => article.distincao && articleReferences(article.title).some(ref => replaced.has(ref))).flatMap(article => articleReferences(article.title)));
  output.articles = output.articles.map(article => articleReferences(article.title).some(ref => replaced.has(ref)) ? { ...article, distincao: null } : article);
  output.instructions = JSON.stringify(cards);
  diagnostics.contextCharacters = output.instructions.length;
  return output;
}
