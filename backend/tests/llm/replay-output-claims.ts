import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootPrisma } from '../../src/database/index.js';
import { getAllArticles } from '../../src/database/repositories/knowledgeRepository.js';
import { articleReferences } from '../../src/services/llm/helpers/articleReference.js';
import { evaluateGeneratedSafety } from '../../src/services/llm/legalKnowledge/responseSafety.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const input = path.resolve(root, process.env.SAFETY_REPLAY_INPUT || '.ci-generated/eval-fusion-gemma.json');
const directory = path.resolve(root, '.ci-generated');
const output = path.resolve(directory, process.env.SAFETY_REPLAY_RESULTS_FILE || 'eval-output-claims-replay.json');
if (path.dirname(output) !== directory || !output.endsWith('.json')) throw new Error('Destino deve ser JSON em backend/.ci-generated.');
if (input === output) throw new Error('Origem e destino devem ser diferentes.');
const bytes = readFileSync(input);
const report = JSON.parse(bytes.toString('utf8'));
const dataset = JSON.parse(readFileSync(path.resolve(root, 'tests/llm/test-cases.json'), 'utf8'));
const entries: any[] = [];
for (const row of report.resultadosDiretos) {
  const original = dataset.orientacao_direta.find((item: any) => item.id === row.id);
  if (!original) throw new Error(`Caso desconhecido: ${row.id}`);
  entries.push({ ...row, messages: [original.mensagem] });
}
for (const row of report.resultadosClarificacao) {
  const original = dataset.precisa_clarificacao.find((item: any) => item.id === row.id);
  if (!original) throw new Error(`Caso desconhecido: ${row.id}`);
  entries.push({ ...row.etapaInicial, id: `${row.id}-inicial`, messages: [original.mensagemInicial] });
  entries.push({ ...row.etapaFinal, id: `${row.id}-final`, messages: [...original.conversaCompleta.historico.filter((item: any) => item.autor === 'Cidadão').map((item: any) => item.mensagem), original.conversaCompleta.mensagemFinal] });
}
try {
  const articles = await getAllArticles();
  const sources = articles.flatMap(article => articleReferences(article.title).map(reference => ({ reference, content: article.content })));
  const rows = entries.map(row => {
    const generated = row.generatedBeforeGuard;
    if (!generated) return { id: row.id, evaluated: false };
    const diag = row.diagnostics;
    const references = diag.referenciasPermitidas ?? [...articles.filter(article => diag.candidatosRecuperados.includes(article.id)).flatMap(article => articleReferences(article.title)), ...(diag.regrasAuxiliares?.addedArticles ?? [])]
      .filter(ref => !(diag.regrasAuxiliares?.displacedArticles ?? []).includes(ref));
    const decision = evaluateGeneratedSafety({ text: generated.texto, article: generated.artigo, kind: generated.tipoResposta, citizenMessages: row.messages, sources: sources.filter(source => references.includes(source.reference)) });
    return { id: row.id, evaluated: true, oldReasons: diag.segurancaJuridica?.reasons ?? [], decision };
  });
  const summary = { total: rows.length, evaluated: rows.filter(row => row.evaluated).length,
    rejected: rows.filter(row => row.evaluated && !row.decision!.passed).map(row => ({ id: row.id, reasons: row.decision!.reasons })),
    accepted: rows.filter(row => row.evaluated && row.decision!.passed).map(row => row.id) };
  if (existsSync(output)) copyFileSync(output, `${output}.${Date.now()}.bak`);
  writeFileSync(output, JSON.stringify({ scope: 'saved_generation_safety_only', source: path.relative(root, input),
    sourceSha256: createHash('sha256').update(bytes).digest('hex'), sources: 'current_knowledge_with_saved_reference_set',
    knowledgeSha256: createHash('sha256').update(JSON.stringify([...articles].sort((a, b) => a.id.localeCompare(b.id)))).digest('hex'),
    noModelCalls: true, summary, rows }, null, 2) + '\n');
  console.log(JSON.stringify(summary));
} finally { await rootPrisma.$disconnect(); }
