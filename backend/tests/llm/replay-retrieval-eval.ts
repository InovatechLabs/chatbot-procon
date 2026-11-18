import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { rootPrisma } from '../../src/database/index.js';
import { getAllArticles } from '../../src/database/repositories/knowledgeRepository.js';
import { auditRetrieval, summarizeRetrieval } from './retrieval-audit.js';

// Reexecuta o serviço atual com vetores/rankings congelados: zero chamadas aos modelos.
const sourceUrl = new URL('../../.ci-generated/retrieval-results.json', import.meta.url);
const outputUrl = new URL('../../.ci-generated/retrieval-fusion-replay.json', import.meta.url);
const bytes = readFileSync(sourceUrl);
const source = JSON.parse(bytes.toString('utf8'));
if (!source.completed || source.rows.some((row: any) => row.error)) throw new Error('A avaliação de origem deve estar completa e sem falhas.');
const datasetBytes = readFileSync(new URL('./test-cases.json', import.meta.url));
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
if (sha(datasetBytes) !== source.provenance.datasetSha256) throw new Error('O dataset mudou; não misturar entradas com rankings antigos.');
const dataset = JSON.parse(datasetBytes.toString('utf8'));
if (existsSync(outputUrl)) copyFileSync(outputUrl, new URL(`../../.ci-generated/retrieval-fusion-replay.${Date.now()}.bak.json`, import.meta.url));
const rows: any[] = [];
let completed = false;
function save() {
  const groups = Object.fromEntries(['original_only', 'recorded_rewrite'].map(strategy => [strategy, {
    before: source.groups[strategy], after: summarizeRetrieval(rows.filter(row => row.strategy === strategy)),
  }]));
  writeFileSync(outputUrl, JSON.stringify({ schemaVersion: 1, scope: 'retrieval_pipeline_with_frozen_vectors', completed,
    sourceReportSha256: sha(bytes), sourceProvenance: source.provenance, legalRulesMode: source.legalRulesMode,
    embeddingCalls: 0, gemmaCalls: 0, classifierCalls: 0, groups,
    gains: rows.filter(row => !row.before.finalContextHit && row.audit.finalContextContainsExpected).map(row => `${row.id}:${row.strategy}`),
    losses: rows.filter(row => row.before.finalContextHit && !row.audit.finalContextContainsExpected).map(row => `${row.id}:${row.strategy}`),
    rows }, null, 2) + '\n');
}
try {
  const knowledge = await getAllArticles();
  const hashKnowledge = (articles: typeof knowledge) => sha(JSON.stringify([...articles].sort((a, b) => a.id.localeCompare(b.id))));
  if (hashKnowledge(knowledge) !== source.provenance.knowledgeSha256) throw new Error('O corpus mudou; gere uma nova avaliação de origem.');
  for (const previous of source.rows) {
    const id = previous.id.replace(/-final$/, '');
    const original = dataset.orientacao_direta.find((row: any) => row.id === id);
    const clarification = dataset.precisa_clarificacao.find((row: any) => row.id === id);
    const traces = previous.audit.vectorAttempts;
    const audit = await auditRetrieval({
      question: original ? original.mensagem : clarification.conversaCompleta.mensagemFinal,
      history: original ? [] : clarification.conversaCompleta.historico,
      expected: previous.expected, mode: source.legalRulesMode,
      ...(previous.strategy === 'recorded_rewrite' ? { recordedQuery: previous.recordedQuery, observedOriginalQuery: previous.audit.originalQuery } : {}),
    }, knowledge, {
      embed: async query => {
        const index = traces.findIndex((trace: any) => trace.query === query);
        if (index < 0) throw new Error('Consulta sem vetor congelado; não chamar endpoint externo.');
        return [index];
      },
      vectors: async (vector, limit) => {
        const index = JSON.parse(vector)[0];
        return (limit === 10 ? traces[index].productionTop10 : traces[index].fullRanking).slice(0, limit);
      },
    });
    if (JSON.stringify(audit.productionCandidates.slice(0, 4)) !== JSON.stringify(previous.audit.productionCandidates.slice(0, 4))) throw new Error('O ranking base mudou inesperadamente.');
    if (previous.audit.finalReferences.some((ref: string) => !audit.finalReferences.includes(ref))) throw new Error('Uma referência anterior foi removida do contexto.');
    if (JSON.stringify(audit.auxiliary?.selectedRules) !== JSON.stringify(previous.audit.auxiliary?.selectedRules)) throw new Error('As regras auxiliares anteriores foram alteradas.');
    rows.push({ id: previous.id, strategy: previous.strategy, expected: previous.expected,
      before: { candidates: previous.audit.productionCandidates, finalReferences: previous.audit.finalReferences, finalContextHit: previous.audit.finalContextContainsExpected }, audit });
  }
  if (hashKnowledge(await getAllArticles()) !== source.provenance.knowledgeSha256) throw new Error('O corpus mudou durante o replay.');
  completed = rows.length === source.rows.length;
  save();
  console.log(JSON.stringify({ completed, scenarios: rows.length,
    gains: rows.filter(row => !row.before.finalContextHit && row.audit.finalContextContainsExpected).map(row => `${row.id}:${row.strategy}`),
    losses: rows.filter(row => row.before.finalContextHit && !row.audit.finalContextContainsExpected).map(row => `${row.id}:${row.strategy}`),
    original: summarizeRetrieval(rows.filter(row => row.strategy === 'original_only')),
    rewritten: summarizeRetrieval(rows.filter(row => row.strategy === 'recorded_rewrite')) }));
} catch (error) {
  process.exitCode = 1; save();
  console.error('Replay interrompido:', error instanceof Error ? error.message : 'erro');
} finally { await rootPrisma.$disconnect(); }
