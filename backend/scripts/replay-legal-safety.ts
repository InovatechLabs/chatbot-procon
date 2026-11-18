import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { rootPrisma } from '../src/database/index.js';
import { getAllArticles } from '../src/database/repositories/knowledgeRepository.js';
import { articleReferences, normalizeReference } from '../src/services/llm/helpers/articleReference.js';
import { evaluateGeneratedSafety } from '../src/services/llm/legalKnowledge/responseSafety.js';

// Reaplica exatamente o gate compartilhado às gerações sintéticas salvas; zero IA.
const input = new URL('../.ci-generated/legal-safety-eval-step4.json', import.meta.url);
const bytes = readFileSync(input);
const report = JSON.parse(bytes.toString('utf8'));
if (report.completed !== report.selected) throw new Error('A rodada real deve terminar antes do replay.');
const output = new URL('../.ci-generated/legal-safety-replay-step4.json', import.meta.url);
try {
  const articles = await getAllArticles();
  const allSources = articles.flatMap(article => articleReferences(article.title).map(reference => ({ reference, content: article.content })));
  const results = report.results.map((row: any) => {
    const generated = row.generatedBeforeGuard;
    if (!generated || typeof generated.texto !== 'string' || !['orientacao_final', 'clarificacao', 'redirecionamento'].includes(generated.tipoResposta)) {
      return { id: row.id, group: row.group, evaluated: false, originalKind: row.actualKind, originalDiscard: row.diagnostics?.motivoDescarte };
    }
    const references = row.diagnostics?.referenciasPermitidas
      ?? articles.filter(article => row.diagnostics?.candidatosRecuperados?.includes(article.id)).flatMap(article => articleReferences(article.title));
    const citizenMessages = [...row.history.filter((item: any) => item.autor === 'Cidadão').map((item: any) => item.mensagem), row.message];
    const decision = evaluateGeneratedSafety({ text: generated.texto, kind: generated.tipoResposta, article: normalizeReference(generated.artigo), citizenMessages,
      sources: allSources.filter(source => references.includes(source.reference)) });
    return { id: row.id, group: row.group, evaluated: true, originalKind: row.actualKind, originalArticle: row.actualArticle,
      originalDiscard: row.diagnostics?.motivoDescarte, generatedKind: generated.tipoResposta, generatedArticle: generated.artigo,
      decision, changed: JSON.stringify(decision.reasons) !== JSON.stringify(row.diagnostics?.segurancaJuridica?.reasons ?? []) };
  });
  const summary = { total: results.length, evaluated: results.filter((row: any) => row.evaluated).length,
    rejected: results.filter((row: any) => row.evaluated && !row.decision.passed).length,
    accepted: results.filter((row: any) => row.evaluated && row.decision.passed).length,
    changed: results.filter((row: any) => row.changed).length };
  writeFileSync(output, JSON.stringify({ sourceReportSha256: createHash('sha256').update(bytes).digest('hex'), sourceStartedAt: report.startedAt,
    replayedAt: new Date().toISOString(), scope: 'saved_generation_gate_only', noNewModelCalls: true, summary, results }, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary));
  console.log('Replay salvo separadamente; não recalcula métricas end-to-end nem substitui revisão semântica.');
} finally { await rootPrisma.$disconnect(); }
