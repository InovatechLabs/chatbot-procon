import 'dotenv/config';
import { rootPrisma } from '../src/database/index.js';
import { createRagService } from '../src/services/llm/llmService.js';
import { classifyReport } from '../src/services/llm/helpers/classifyReport.js';
import { generateText } from '../src/services/ollama/ollamaClient.js';

// Opt-in: lê somente KnowledgeBase, com relatos fictícios e sem enviar WhatsApp.
// Histórico e identificação são simulados; não cria sessões no banco da aplicação.
let promptCharacters = 0;
const answer = createRagService({ generate: (prompt, schema, options) => {
  promptCharacters = prompt.length; return generateText(prompt, schema, options);
}, db: {
  userSession: { findUnique: async () => null }, chatLog: { findMany: async () => [] },
} as any });
const cases = [
  { id: 'OCULTO', text: 'Comprei uma geladeira há meses. O defeito era impossível de perceber antes e só ficou evidente ontem. Quando começa o prazo para reclamar?' },
  { id: 'PIX', text: 'Fiz um PIX para uma loja, mas caiu na conta de outra pessoa. Não sei quem errou os dados. O banco não resolveu. Tenho direito ao dobro?' },
];
try {
  let exercised = 0;
  for (const item of cases) {
    const classification = await classifyReport(item.text, '');
    for (const mode of ['off', 'preview'] as const) {
      promptCharacters = 0;
      const result = await answer(item.text, 'legal-live-fixture', { preClassification: classification, includeDiagnostics: true, legalRulesMode: mode });
      console.log(JSON.stringify({ case: item.id, mode, category: classification.categoria, kind: result.tipoResposta,
        article: result.artigo, text: result.texto, discard: result.diagnostics?.motivoDescarte,
        promptCharacters, candidates: result.diagnostics?.candidatosRecuperados, rules: result.diagnostics?.regrasAuxiliares }, null, 2));
      if (!result.diagnostics) throw new Error('Consulta técnica indisponível.');
      if (mode === 'preview' && result.diagnostics.regrasAuxiliares?.selectedRules.length) exercised++;
    }
  }
  if (!exercised) { console.error('Nenhum caso chegou à geração com regras; revisar recuperação antes de considerar o smoke concluído.'); process.exitCode = 1; }
} catch (error) {
  console.error('Falha no smoke jurídico:', error instanceof Error ? error.name : 'erro'); process.exitCode = 1;
} finally { await rootPrisma.$disconnect(); }
