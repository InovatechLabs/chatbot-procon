import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { rootPrisma } from '../../src/database/index.js';
import { getAllArticles, getVectorResults } from '../../src/database/repositories/knowledgeRepository.js';
import { getEmbedding } from '../../src/services/ollama/ollamaClient.js';
import { MAX_VECTOR_DISTANCE } from '../../src/services/llm/llmService.js';
import type { LegalRulesMode } from '../../src/services/llm/legalKnowledge/context.js';
import { auditRetrieval, summarizeRetrieval } from './retrieval-audit.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string) => readFileSync(path.resolve(root, file));
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const datasetBytes = read('tests/llm/test-cases.json');
const dataset = JSON.parse(datasetBytes.toString('utf8'));
const sourcePath = process.env.RETRIEVAL_QUERY_REPORT || 'tests/llm/eval-preview-results.json';
const sourceBytes = read(sourcePath);
const source = JSON.parse(sourceBytes.toString('utf8'));
const mode = process.env.RETRIEVAL_LEGAL_RULES_MODE || 'preview';
if (!['approved', 'preview', 'off'].includes(mode)) throw new Error('Modo jurídico inválido.');
const directory = path.resolve(root, '.ci-generated');
const output = path.resolve(directory, process.env.RETRIEVAL_RESULTS_FILE || 'retrieval-results.json');
if (path.dirname(output) !== directory || !output.endsWith('.json')) throw new Error('O relatório deve ser JSON dentro de backend/.ci-generated.');
mkdirSync(directory, { recursive: true });
if (existsSync(output)) copyFileSync(output, `${output}.${Date.now()}.bak`);
interface Item { id: string; question: string; history: { autor: string; mensagem: string }[]; expected: string; recordedQuery?: string }
const recordedQuery = (diagnostics: any) => diagnostics?.classificacaoUsada?.consultaBusca?.trim() || diagnostics?.consultaBuscaUsada?.trim() || undefined;
let cases: Item[] = dataset.orientacao_direta.filter((row: any) => row.artigoEsperado).map((row: any) => {
  const query = recordedQuery(source.resultadosDiretos.find((item: any) => item.id === row.id)?.diagnostics);
  return { id: row.id, question: row.mensagem, history: [], expected: row.artigoEsperado, ...(query ? { recordedQuery: query } : {}) };
});
for (const row of dataset.precisa_clarificacao) {
  if (!row.conversaCompleta.artigoEsperadoFinal) continue;
  const query = recordedQuery(source.resultadosClarificacao.find((item: any) => item.id === row.id)?.etapaFinal?.diagnostics);
  cases.push({ id: `${row.id}-final`, question: row.conversaCompleta.mensagemFinal, history: row.conversaCompleta.historico,
    expected: row.conversaCompleta.artigoEsperadoFinal, ...(query ? { recordedQuery: query } : {}) });
}
const selection = process.env.RETRIEVAL_CASE_IDS?.split(',').map(id => id.trim()).filter(Boolean);
if (selection?.length) {
  for (const id of selection) if (!cases.some(item => item.id === id || item.id === `${id}-final`)) throw new Error(`Caso sem artigo esperado ou desconhecido: ${id}`);
  cases = cases.filter(item => selection.includes(item.id) || selection.includes(item.id.replace(/-final$/, '')));
}
const rows: { id: string; strategy: string; expected: string; recordedQuery?: string; audit?: Awaited<ReturnType<typeof auditRetrieval>>; error?: string }[] = [];
const cache = new Map<string, number[]>();
let embeddingRequests = 0, cacheHits = 0, knowledgeHash = '', completed = false;
const startedAt = new Date().toISOString();
function summaries() {
  return { ...Object.fromEntries(['original_only', 'recorded_rewrite'].map(strategy => [strategy, summarizeRetrieval(rows.filter(row => row.strategy === strategy))])),
    paired_original_only: summarizeRetrieval(rows.filter(row => row.strategy === 'original_only' && cases.some(item => item.id === row.id && item.recordedQuery))) };
}
function save() {
  const groups = summaries();
  writeFileSync(output, JSON.stringify({ schemaVersion: 1, scope: 'retrieval_only_triage_bypassed', completed, startedAt, updatedAt: new Date().toISOString(),
    model: process.env.OLLAMA_EMBEDDING_MODEL_NAME, legalRulesMode: mode, vectorDistanceThreshold: MAX_VECTOR_DISTANCE,
    selectedCases: cases.length, plannedScenarios: cases.length + cases.filter(item => item.recordedQuery).length, completedScenarios: rows.length,
    withoutRecordedQuery: cases.filter(item => !item.recordedQuery).map(item => item.id),
    provenance: { datasetSha256: sha(datasetBytes), frozenQueryReportSha256: sha(sourceBytes), knowledgeSha256: knowledgeHash,
      frozenQueryReport: path.relative(root, path.resolve(root, sourcePath)), historicalQueryTime: source.summary?.executadoEm },
    embeddingRequests, embeddingCacheHits: cacheHits, gemmaCalls: 0, classifierCalls: 0, groups, rows }, null, 2) + '\n');
}
try {
  const knowledge = await getAllArticles();
  if (!knowledge.length || new Set(knowledge.map(row => row.id)).size !== knowledge.length) throw new Error('Base legal vazia ou títulos duplicados.');
  knowledgeHash = sha(JSON.stringify([...knowledge].sort((a, b) => a.id.localeCompare(b.id))));
  const dependencies = { vectors: getVectorResults, embed: async (query: string) => {
    const key = sha(query);
    const cached = cache.get(key);
    if (cached) { cacheHits++; return cached; }
    embeddingRequests++;
    const vector = await getEmbedding(query);
    cache.set(key, vector); return vector;
  } };
  console.log(`Recuperação isolada: ${cases.length} casos; sem classificador/Gemma, sessões ou WhatsApp.`);
  save();
  for (const item of cases) {
    let originalQuery: string | undefined;
    for (const strategy of ['original_only', 'recorded_rewrite']) {
      if (strategy === 'recorded_rewrite' && (!item.recordedQuery || !originalQuery)) continue;
      try {
        const audit = await auditRetrieval({ question: item.question, history: item.history, expected: item.expected, mode: mode as LegalRulesMode,
          ...(strategy === 'recorded_rewrite' ? { recordedQuery: item.recordedQuery!, observedOriginalQuery: originalQuery! } : {}) }, knowledge, dependencies);
        if (strategy === 'original_only') originalQuery = audit.originalQuery;
        rows.push({ id: item.id, strategy, expected: item.expected, ...(strategy === 'recorded_rewrite' ? { recordedQuery: item.recordedQuery! } : {}), audit });
        console.log(`${item.id} ${strategy}: ${audit.lossStage}; posição top4=${audit.ranks.productionTop4 ?? 'ausente'}; contexto=${audit.finalContextContainsExpected}`);
      } catch (error) {
        rows.push({ id: item.id, strategy, expected: item.expected, error: error instanceof Error ? error.name : 'UnknownError' });
        process.exitCode = 1;
        console.log(`${item.id} ${strategy}: falha técnica (detalhes sensíveis omitidos).`);
        save();
        throw new Error('RetrievalAuditStopped');
      }
      save();
    }
  }
  const finalKnowledge = await getAllArticles();
  if (sha(JSON.stringify([...finalKnowledge].sort((a, b) => a.id.localeCompare(b.id)))) !== knowledgeHash) throw new Error('KnowledgeChangedDuringAudit');
  completed = rows.length === cases.length + cases.filter(item => item.recordedQuery).length && !rows.some(row => row.error);
  save();
  console.log(JSON.stringify(summaries()));
  console.log(`Relatório: ${path.relative(root, output)}`);
  if (!completed) process.exitCode = 1;
} catch (error) {
  process.exitCode = 1; save();
  console.error('Avaliação interrompida:', error instanceof Error ? error.name : 'UnknownError');
} finally { await rootPrisma.$disconnect(); }
