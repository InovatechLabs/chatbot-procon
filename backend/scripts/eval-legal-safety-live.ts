import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { rootPrisma } from '../src/database/index.js';
import { createRagService } from '../src/services/llm/llmService.js';
import { generateText } from '../src/services/ollama/ollamaClient.js';
import { normalizeReference } from '../src/services/llm/helpers/articleReference.js';

// Opt-in: todos os erros da baseline + controles + casos novos. Só lê KnowledgeBase.
// Sem sessões reais, sem WhatsApp e sem sobrescrever o eval histórico.
const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const baseline = read('../tests/llm/eval-results.json');
const dataset = read('../tests/llm/test-cases.json');
const novel = read('../tests/llm/legal-generalization-cases.json');
interface Item { id: string; group: 'historical_failure' | 'control' | 'unseen'; message: string;
  history: { autor: string; mensagem: string }[]; category: string; article?: string | null; kind?: string; review?: string }
function failed(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => (key.endsWith('Ok') && item === false) || (typeof item === 'object' && failed(item)));
}
const cases: Item[] = [];
for (const result of baseline.resultadosDiretos) {
  if (!failed(result)) continue;
  const original = dataset.orientacao_direta.find((item: any) => item.id === result.id);
  if (!original) throw new Error(`Caso histórico ausente: ${result.id}`);
  cases.push({ id: original.id, group: 'historical_failure', message: original.mensagem, history: [],
    category: original.categoriaEsperada, article: original.artigoEsperado, kind: original.tipoRespostaEsperada });
}
for (const result of baseline.resultadosClarificacao) {
  if (!failed(result)) continue;
  const original = dataset.precisa_clarificacao.find((item: any) => item.id === result.id);
  if (!original) throw new Error(`Clarificação histórica ausente: ${result.id}`);
  cases.push({ id: `${original.id}-inicial`, group: 'historical_failure', message: original.mensagemInicial, history: [],
    category: original.categoriaEsperadaInicial, kind: original.tipoRespostaEsperada });
  cases.push({ id: `${original.id}-final`, group: 'historical_failure', message: original.conversaCompleta.mensagemFinal, history: original.conversaCompleta.historico,
    category: original.conversaCompleta.categoriaEsperadaFinal, article: original.conversaCompleta.artigoEsperadoFinal });
}
for (const id of ['OD-03', 'OD-04', 'OD-07', 'OD-08', 'OD-18', 'OD-20']) {
  const old = baseline.resultadosDiretos.find((item: any) => item.id === id);
  if (!old || failed(old)) continue;
  const item = dataset.orientacao_direta.find((item: any) => item.id === id);
  cases.push({ id, group: 'control', message: item.mensagem, history: [], category: item.categoriaEsperada,
    article: item.artigoEsperado, kind: item.tipoRespostaEsperada });
}
for (const item of novel) cases.push({ id: item.id, group: 'unseen', message: item.message, history: [], category: item.category, review: item.review });

const output = new URL('../.ci-generated/legal-safety-eval-step4.json', import.meta.url);
mkdirSync(new URL('.', output), { recursive: true });
let history: any[] = [];
let generated: unknown = null;
let promptCharacters = 0;
const run = createRagService({ db: {
  userSession: { findUnique: async () => null },
  chatLog: { findMany: async ({ where, orderBy, take }: any) => {
    const rows = history.filter(row => !where.direction || row.direction === where.direction);
    return (orderBy.timestamp === 'desc' ? [...rows].reverse() : rows).slice(0, take);
  } },
} as any, generate: async (prompt, schema, options) => {
  promptCharacters = prompt.length;
  const raw = await generateText(prompt, schema, options);
  try { generated = JSON.parse(raw); } catch { generated = { parseFailed: true }; }
  return raw;
} });
const results: any[] = [];
const startedAt = new Date().toISOString();
function save() {
  const groups = Object.fromEntries(['historical_failure', 'control', 'unseen'].map(group => {
    const rows = results.filter(row => row.group === group);
    return [group, { completed: rows.length, categoryMatches: rows.filter(row => row.categoryOk).length,
      articleAssessed: rows.filter(row => row.articleOk !== null).length, articleMatches: rows.filter(row => row.articleOk === true).length,
      kindAssessed: rows.filter(row => row.kindOk !== null).length, kindMatches: rows.filter(row => row.kindOk === true).length,
      safetyBlocks: rows.filter(row => row.diagnostics?.segurancaJuridica?.reasons.length).length,
      technicalFailures: rows.filter(row => row.technicalFailure).length }];
  }));
  writeFileSync(output, JSON.stringify({ startedAt, updatedAt: new Date().toISOString(), model: process.env.OLLAMA_GENERATE_MODEL_NAME,
    mode: 'preview', selected: cases.length, completed: results.length, groups, semanticReview: 'manual_required', results }, null, 2) + '\n', 'utf8');
}
try {
  console.log(`Avaliação ampliada: ${cases.length} entradas; baseline preservada; dados fictícios.`);
  for (const item of cases) {
    history = item.history.map((row, i) => ({ id: `fiction-${i}`, direction: row.autor === 'Cidadão' ? 'INBOUND' : 'OUTBOUND', messageText: row.mensagem, stepId: null }));
    generated = null; promptCharacters = 0;
    const start = Date.now();
    const result = await run(item.message, 'legal-evaluation-fiction', { includeDiagnostics: true, legalRulesMode: 'preview',
      clarificationCount: item.id.endsWith('-final') ? item.history.filter(row => row.autor !== 'Cidadão').length : 0 });
    const category = result.diagnostics?.classificacaoUsada.categoria;
    results.push({ ...item, category, categoryOk: category === item.category, actualArticle: result.artigo, actualKind: result.tipoResposta,
      articleOk: item.article === undefined ? null : normalizeReference(result.artigo) === normalizeReference(item.article),
      kindOk: item.kind === undefined ? null : result.tipoResposta === item.kind,
      text: result.texto, generatedBeforeGuard: generated, diagnostics: result.diagnostics, promptCharacters,
      elapsedMs: Date.now() - start, technicalFailure: !result.diagnostics });
    save();
    console.log(`[${results.length}/${cases.length}] ${item.id}: ${category ?? 'falha técnica'} | ${result.tipoResposta} | ${result.artigo ?? 'sem artigo'} | ${result.diagnostics?.motivoDescarte ?? 'sem descarte'}`);
  }
  if (results.some(row => row.technicalFailure)) process.exitCode = 1;
  console.log('Concluído. Relatório sintético em backend/.ci-generated/legal-safety-eval-step4.json; revisão semântica necessária.');
} catch (error) {
  save(); console.error('Falha na avaliação ampliada:', error instanceof Error ? error.name : 'erro'); process.exitCode = 1;
} finally { await rootPrisma.$disconnect(); }
