/**
 * Script de avaliação e benchmark do pipeline RAG do PROCON.
 *
 * Roda os casos de teste de test-cases.json diretamente contra as funções
 * do llmService, sem passar pelo WhatsApp. Gera um eval-results.json completo
 * com telemetria, captura de Raciocínio (Thinking Mode) e métricas consolidadas.
 *
 * Uso: npx tsx run-eval.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../../src/database/index.js';
import { answerWithRAG } from '../../src/services/llm/llmService.js';
import { classifyReport } from '../../src/services/llm/helpers/classifyReport.js';
import type { LegalRulesMode } from '../../src/services/llm/legalKnowledge/context.js';
import type { RagOptions } from '../../src/services/llm/llmService.js';

// Dataset fictício: conserva a geração anterior ao descarte apenas neste relatório.
async function evaluateForBenchmark(question: string, sessionId: string, options: RagOptions) {
  let generatedBeforeGuard: { tipoResposta: string; texto: string; artigo: string | null } | null = null;
  const result = await answerWithRAG(question, sessionId, { ...options,
    onGeneratedForEvaluation: value => { generatedBeforeGuard = value; } });
  return { ...result, generatedBeforeGuard };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_CASES_PATH = path.join(__dirname, 'test-cases.json');
const RESULTS_PATH = path.resolve(__dirname, process.env.EVAL_RESULTS_PATH || 'eval-preview-results.json');
const legalRulesMode = process.env.EVAL_LEGAL_RULES_MODE || 'preview';
if (!['off', 'approved', 'preview'].includes(legalRulesMode)) throw new Error('EVAL_LEGAL_RULES_MODE inválido.');
if (legalRulesMode === 'preview' && path.basename(RESULTS_PATH) === 'eval-results.json') {
  throw new Error('Prévia exige EVAL_RESULTS_PATH separado da baseline eval-results.json.');
}

// ---------- Tipos do dataset ----------

interface CasoOrientacaoDireta {
  id: string;
  descricao: string;
  mensagem: string;
  categoriaEsperada: string;
  tipoRespostaEsperada: 'orientacao_final' | 'redirecionamento' | 'fixa';
  artigoEsperado: string | null;
  observacao?: string;
}

interface HistoricoItem {
  autor: 'Cidadão' | 'Atendente Virtual';
  mensagem: string;
}

interface CasoClarificacao {
  id: string;
  descricao: string;
  mensagemInicial: string;
  categoriaEsperadaInicial: string;
  tipoRespostaEsperada: 'clarificacao' | 'fixa';
  clarificacaoEsperadaSobre: string[];
  conversaCompleta: {
    historico: HistoricoItem[];
    mensagemFinal: string;
    categoriaEsperadaFinal: string;
    artigoEsperadoFinal: string | null;
    observacao?: string;
  };
}

interface Dataset {
  orientacao_direta: CasoOrientacaoDireta[];
  precisa_clarificacao: CasoClarificacao[];
}

const normalizarArtigo = (texto: string | null | undefined): string | null => {
  if (!texto) return null;

  const limpo = texto.trim();
  if (!limpo || /^(nenhum|n\/a|null|undefined|-)$/i.test(limpo)) {
    return null;
  }

  // Extrai a parte numérica e sufixo do artigo (ex: "42", "54-G", "54G", "18")
  // Ignora prefixos (Art, Artigo) e sufixos (pontos finais, vírgulas, caput, incisos, "do CDC", etc.)
  const match = limpo.match(/(?:art(?:igo)?\.?\s*)?(\d+[\s-]*[a-z]?)/i);

  if (!match || !match[1]) {
    return limpo;
  }

  // Padroniza o identificador (ex: "54 g" ou "54g" -> "54-G")
  const numeroIdentificador = match[1]
    .replace(/\s+/g, '')                  // Remove espaços internos
    .replace(/([0-9])([a-z])/i, '$1-$2')  // Garante hífen entre número e letra (ex: 54G -> 54-G)
    .toUpperCase();                       // Transforma em maiúsculas

  return `Art. ${numeroIdentificador}`;
};

// ---------- Sessão de teste (UserSession real, exigida pela FK de ChatLog) ----------

const getOrResetEvalSession = async (caseId: string): Promise<{ id: string; phoneNumber: string }> => {
  const phoneNumber = `eval-${caseId}`;

  const existing = await prisma.userSession.findFirst({
    where: { phoneNumber, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    await prisma.userSession.delete({ where: { id: existing.id } });
  }

  const session = await prisma.userSession.create({
    data: {
      phoneNumber,
      isChat: true, 
      status: 'OPEN',
    },
  });

  return { id: session.id, phoneNumber: session.phoneNumber };
};

// ---------- Seed de histórico multi-turno no banco ----------

const seedHistory = async (
  sessionId: string,
  phoneNumber: string,
  historico: HistoricoItem[]
) => {
  let baseTime = Date.now() - historico.length * 60_000; 
  for (const item of historico) {
    await prisma.chatLog.create({
      data: {
        sessionId,
        phoneNumber,
        direction: item.autor === 'Cidadão' ? 'INBOUND' : 'OUTBOUND',
        messageText: item.mensagem,
        timestamp: new Date(baseTime),
      },
    });
    baseTime += 60_000;
  }
};

// ---------- Execução dos casos de orientação direta ----------

const runOrientacaoDireta = async (casos: CasoOrientacaoDireta[]) => {
  const resultados = [];

  for (const caso of casos) {
    const { id: sessionId } = await getOrResetEvalSession(caso.id);

    console.log(`\n[${caso.id}] ${caso.descricao}`);

    try {
      const t0 = Date.now();
      const classification = await classifyReport(caso.mensagem, `Cidadão: ${caso.mensagem}`);
      const tClassify = Date.now() - t0;

      const t1 = Date.now();
      const ragResult = await evaluateForBenchmark(caso.mensagem, sessionId, {
        preClassification: classification,
        includeDiagnostics: true,
        legalRulesMode: legalRulesMode as LegalRulesMode,
      });
      const tFull = Date.now() - t1;

      // A categoria registrada agora é a mesma usada pelo pipeline.
      const categoriaUsada = ragResult.diagnostics?.classificacaoUsada.categoria ?? classification.categoria;
      const categoriaOk = categoriaUsada === caso.categoriaEsperada;
      const tipoRespostaOk = ragResult.tipoResposta === caso.tipoRespostaEsperada;

      // Validação com normalização de artigo
      const artigoObtidoNormalizado = normalizarArtigo(ragResult.artigo);
      const artigoEsperadoNormalizado = normalizarArtigo(caso.artigoEsperado);
      const artigoOk = artigoObtidoNormalizado === artigoEsperadoNormalizado;

      console.log(`  categoria:    ${categoriaOk ? '✅' : '❌'} (esperado: ${caso.categoriaEsperada}, obtido: ${categoriaUsada})`);
      console.log(`  tipoResposta: ${tipoRespostaOk ? '✅' : '❌'} (esperado: ${caso.tipoRespostaEsperada}, obtido: ${ragResult.tipoResposta})`);
      console.log(`  artigo:       ${artigoOk ? '✅' : '❌'} (esperado: ${caso.artigoEsperado ?? 'nenhum'}, encontrado: ${ragResult.artigo || 'nenhum'})`);
      if (ragResult.diagnostics?.motivoDescarte) {
        console.log(`  descarte:     ${ragResult.diagnostics.motivoDescarte}`);
        console.log(`  referência gerada: ${JSON.stringify(ragResult.diagnostics.referenciaGerada ?? null)} | normalizada: ${ragResult.diagnostics.referenciaNormalizada ?? 'nenhuma'}`);
      }
      if (ragResult.diagnostics?.candidatosRecuperados.length) {
        console.log(`  candidatos:   ${ragResult.diagnostics.candidatosRecuperados.join(', ')}`);
      }
      console.log(`  tempo:        classificação ${(tClassify / 1000).toFixed(2)}s | pipeline RAG ${(tFull / 1000).toFixed(2)}s`);

      resultados.push({
        id: caso.id,
        descricao: caso.descricao,
        categoriaEsperada: caso.categoriaEsperada,
        categoriaObtida: categoriaUsada,
        categoriaOk,
        tipoRespostaEsperada: caso.tipoRespostaEsperada,
        tipoRespostaObtida: ragResult.tipoResposta,
        tipoRespostaOk,
        artigoEsperado: caso.artigoEsperado,
        artigoObtido: ragResult.artigo,
        artigoOk,
        tempoClassificacaoMs: tClassify,
        tempoPipelineMs: tFull,
        respostaTexto: ragResult.texto,
        diagnostics: ragResult.diagnostics ?? null,
        generatedBeforeGuard: ragResult.generatedBeforeGuard,
      });
    } catch (err: any) {
      console.error(`  ❌ ERRO ao rodar caso ${caso.id}:`, err);
      resultados.push({
        id: caso.id,
        descricao: caso.descricao,
        erro: err?.message || String(err),
        stack: err?.stack,
      });
    }
  }

  return resultados;
};

// ---------- Execução dos casos de clarificação ----------

const runPrecisaClarificacao = async (casos: CasoClarificacao[]) => {
  const resultados = [];

  for (const caso of casos) {
    console.log(`\n[${caso.id}] ${caso.descricao}`);

    try {
      // --- Etapa 1: mensagem inicial ambígua, espera pergunta de clarificação ---
      const { id: sessionIdInicial } = await getOrResetEvalSession(`${caso.id}-inicial`);

      const t0 = Date.now();
      const classificationInicial = await classifyReport(caso.mensagemInicial, `Cidadão: ${caso.mensagemInicial}`);
      const ragResultInicial = await evaluateForBenchmark(caso.mensagemInicial, sessionIdInicial, {
        preClassification: classificationInicial,
        includeDiagnostics: true,
        legalRulesMode: legalRulesMode as LegalRulesMode,
      });
      const tInicial = Date.now() - t0;

      const categoriaInicialUsada = ragResultInicial.diagnostics?.classificacaoUsada.categoria ?? classificationInicial.categoria;
      const categoriaInicialOk = categoriaInicialUsada === caso.categoriaEsperadaInicial;
      const fezPergunta = ragResultInicial.tipoResposta === 'clarificacao';

      console.log(`  [inicial] categoria: ${categoriaInicialOk ? '✅' : '❌'} (esperado: ${caso.categoriaEsperadaInicial}, obtido: ${categoriaInicialUsada})`);
      console.log(`  [inicial] pediu clarificação: ${fezPergunta ? '✅' : '❌'} (tipoResposta: ${ragResultInicial.tipoResposta})`);
      console.log(`  [inicial] resposta: "${ragResultInicial.texto.slice(0, 120)}..."`);

      // --- Etapa 2: conversa completa (histórico + resposta do cidadão), espera orientação final ---
      const { id: sessionIdCompleto, phoneNumber: phoneNumberCompleto } = await getOrResetEvalSession(`${caso.id}-completo`);
      await seedHistory(sessionIdCompleto, phoneNumberCompleto, caso.conversaCompleta.historico);

      const t1 = Date.now();
      const historicoTexto = caso.conversaCompleta.historico
        .map(h => `${h.autor}: ${h.mensagem}`)
        .join('\n');
      const classificationFinal = await classifyReport(caso.conversaCompleta.mensagemFinal, historicoTexto);
      const ragResultFinal = await evaluateForBenchmark(caso.conversaCompleta.mensagemFinal, sessionIdCompleto, {
        preClassification: classificationFinal,
        includeDiagnostics: true,
        legalRulesMode: legalRulesMode as LegalRulesMode,
      });
      const tFinal = Date.now() - t1;

      const categoriaFinalUsada = ragResultFinal.diagnostics?.classificacaoUsada.categoria ?? classificationFinal.categoria;
      const categoriaFinalOk = categoriaFinalUsada === caso.conversaCompleta.categoriaEsperadaFinal;
      
      // Validação normalizada de artigo
      const artigoFinalObtidoNormalizado = normalizarArtigo(ragResultFinal.artigo);
      const artigoFinalEsperadoNormalizado = normalizarArtigo(caso.conversaCompleta.artigoEsperadoFinal);
      const artigoFinalOk = artigoFinalObtidoNormalizado === artigoFinalEsperadoNormalizado;

      console.log(`  [final]   categoria: ${categoriaFinalOk ? '✅' : '❌'} (esperado: ${caso.conversaCompleta.categoriaEsperadaFinal}, obtido: ${categoriaFinalUsada})`);
      console.log(`  [final]   artigo:    ${artigoFinalOk ? '✅' : '❌'} (esperado: ${caso.conversaCompleta.artigoEsperadoFinal ?? 'nenhum'}, encontrado: ${ragResultFinal.artigo || 'nenhum'})`);
      if (ragResultFinal.diagnostics?.motivoDescarte) {
        console.log(`  [final]   descarte:  ${ragResultFinal.diagnostics.motivoDescarte}`);
        console.log(`  [final]   referência gerada: ${JSON.stringify(ragResultFinal.diagnostics.referenciaGerada ?? null)} | normalizada: ${ragResultFinal.diagnostics.referenciaNormalizada ?? 'nenhuma'}`);
      }
      if (ragResultFinal.diagnostics?.candidatosRecuperados.length) {
        console.log(`  [final]   candidatos: ${ragResultFinal.diagnostics.candidatosRecuperados.join(', ')}`);
      }
      console.log(`  tempo: etapa inicial ${(tInicial / 1000).toFixed(2)}s | etapa final ${(tFinal / 1000).toFixed(2)}s`);

      resultados.push({
        id: caso.id,
        descricao: caso.descricao,
        etapaInicial: {
          categoriaEsperada: caso.categoriaEsperadaInicial,
          categoriaObtida: categoriaInicialUsada,
          categoriaOk: categoriaInicialOk,
          fezPergunta,
          tipoRespostaEsperado: caso.tipoRespostaEsperada,
          tipoRespostaOk: ragResultInicial.tipoResposta === caso.tipoRespostaEsperada,
          tipoRespostaObtido: ragResultInicial.tipoResposta,
          resposta: ragResultInicial.texto,
          tempoMs: tInicial,
          diagnostics: ragResultInicial.diagnostics ?? null,
          generatedBeforeGuard: ragResultInicial.generatedBeforeGuard,
        },
        etapaFinal: {
          categoriaEsperada: caso.conversaCompleta.categoriaEsperadaFinal,
          categoriaObtida: categoriaFinalUsada,
          categoriaOk: categoriaFinalOk,
          artigoEsperado: caso.conversaCompleta.artigoEsperadoFinal,
          artigoObtido: ragResultFinal.artigo,
          artigoOk: artigoFinalOk,
          tipoRespostaObtido: ragResultFinal.tipoResposta,
          resposta: ragResultFinal.texto,
          tempoMs: tFinal,
          diagnostics: ragResultFinal.diagnostics ?? null,
          generatedBeforeGuard: ragResultFinal.generatedBeforeGuard,
        },
      });
    } catch (err: any) {
      console.error(`  ❌ ERRO ao rodar caso ${caso.id}:`, err);
      resultados.push({
        id: caso.id,
        descricao: caso.descricao,
        erro: err?.message || String(err),
        stack: err?.stack,
      });
    }
  }

  return resultados;
};

// ---------- Main ----------

const main = async () => {
  const dataset: Dataset = JSON.parse(fs.readFileSync(TEST_CASES_PATH, 'utf-8'));
  const selectedIds = process.env.EVAL_CASE_IDS?.split(',').map(id => id.trim()).filter(Boolean);
  if (selectedIds?.length) {
    const known = [...dataset.orientacao_direta, ...dataset.precisa_clarificacao].map(item => item.id);
    for (const id of selectedIds) if (!known.includes(id)) throw new Error(`Caso desconhecido: ${id}`);
    dataset.orientacao_direta = dataset.orientacao_direta.filter(item => selectedIds.includes(item.id));
    dataset.precisa_clarificacao = dataset.precisa_clarificacao.filter(item => selectedIds.includes(item.id));
  }

  console.log('='.repeat(60));
  console.log(`INICIANDO BENCHMARK RAG PROCON`);
  console.log(`Modelo LLM: ${process.env.OLLAMA_GENERATE_MODEL_NAME || 'Desconhecido'}`);
  console.log(`Modelo Embedding: ${process.env.OLLAMA_EMBEDDING_MODEL_NAME || 'Desconhecido'}`);
  console.log(`Thinking Mode: ${process.env.LLM_ENABLE_THINKING || 'false'}`);
  console.log('='.repeat(60));

  console.log('\n--- CASOS DE ORIENTAÇÃO DIRETA ---');
  const resultadosDiretos = await runOrientacaoDireta(dataset.orientacao_direta);

  console.log('\n--- CASOS DE CLARIFICAÇÃO ---');
  const resultadosClarificacao = await runPrecisaClarificacao(dataset.precisa_clarificacao);

  // ---------- Resumo e Métricas ----------
 
  const totalDiretos = resultadosDiretos.length;
  const acertosCategoriaDiretos = resultadosDiretos.filter((r: any) => r.categoriaOk).length;
  const acertosArtigoDiretos = resultadosDiretos.filter((r: any) => r.artigoOk).length;
  const acertosTipoRespostaDiretos = resultadosDiretos.filter((r: any) => r.tipoRespostaOk).length;

  const totalClarificacao = resultadosClarificacao.length;
  const casosPerguntaInicial = resultadosClarificacao.filter((r: any) => r.etapaInicial?.tipoRespostaEsperado === 'clarificacao');
  const acertosPerguntaInicial = casosPerguntaInicial.filter((r: any) => r.etapaInicial?.fezPergunta).length;
  const acertosTipoInicial = resultadosClarificacao.filter((r: any) => r.etapaInicial?.tipoRespostaOk).length;
  const acertosCategoriaFinal = resultadosClarificacao.filter((r: any) => r.etapaFinal?.categoriaOk).length;
  const acertosArtigoFinal = resultadosClarificacao.filter((r: any) => r.etapaFinal?.artigoOk).length;

  const summary = {
    legalRulesMode,
    modelo: process.env.OLLAMA_GENERATE_MODEL_NAME || 'Desconhecido',
    thinkingEnabled: process.env.LLM_ENABLE_THINKING === 'true',
    executadoEm: new Date().toISOString(),
    metricas: {
      orientacaoDireta: {
        totalCasos: totalDiretos,
        acertosCategoria: `${acertosCategoriaDiretos}/${totalDiretos} (${((acertosCategoriaDiretos / (totalDiretos || 1)) * 100).toFixed(1)}%)`,
        acertosTipoResposta: `${acertosTipoRespostaDiretos}/${totalDiretos} (${((acertosTipoRespostaDiretos / (totalDiretos || 1)) * 100).toFixed(1)}%)`,
        acertosArtigo: `${acertosArtigoDiretos}/${totalDiretos} (${((acertosArtigoDiretos / (totalDiretos || 1)) * 100).toFixed(1)}%)`,
      },
      clarificacao: {
        totalCasos: totalClarificacao,
        acertosTipoPerguntaTurno1: `${acertosPerguntaInicial}/${casosPerguntaInicial.length} (${((acertosPerguntaInicial / (casosPerguntaInicial.length || 1)) * 100).toFixed(1)}%)`,
        acertosTipoInicial: `${acertosTipoInicial}/${totalClarificacao}`,
        acertosCategoriaFinal: `${acertosCategoriaFinal}/${totalClarificacao} (${((acertosCategoriaFinal / (totalClarificacao || 1)) * 100).toFixed(1)}%)`,
        acertosArtigoFinal: `${acertosArtigoFinal}/${totalClarificacao} (${((acertosArtigoFinal / (totalClarificacao || 1)) * 100).toFixed(1)}%)`,
      },
    },
  };

  if (fs.existsSync(RESULTS_PATH)) fs.copyFileSync(RESULTS_PATH, `${RESULTS_PATH}.${Date.now()}.bak`);
  fs.writeFileSync(
    RESULTS_PATH,
    JSON.stringify(
      {
        summary,
        resultadosDiretos,
        resultadosClarificacao,
      },
      null,
      2
    )
  );

  console.log('\n' + '='.repeat(60));
  console.log('RESUMO CONSOLIDADO DA AVALIAÇÃO');
  console.log('='.repeat(60));
  console.log(`Modelo: ${summary.modelo} | Thinking: ${summary.thinkingEnabled ? 'ON' : 'OFF'}`);
  console.log(`Orientação Direta:`);
  console.log(`  - Categoria:     ${summary.metricas.orientacaoDireta.acertosCategoria}`);
  console.log(`  - Tipo Resposta: ${summary.metricas.orientacaoDireta.acertosTipoResposta}`);
  console.log(`  - Artigo CDC:    ${summary.metricas.orientacaoDireta.acertosArtigo}`);
  console.log(`Clarificação:`);
  console.log(`  - Pergunta 1º Turno: ${summary.metricas.clarificacao.acertosTipoPerguntaTurno1}`);
  console.log(`  - Tipo inicial (inclui administrativo): ${summary.metricas.clarificacao.acertosTipoInicial}`);
  console.log(`  - Categoria Final:   ${summary.metricas.clarificacao.acertosCategoriaFinal}`);
  console.log(`  - Artigo Final:      ${summary.metricas.clarificacao.acertosArtigoFinal}`);
  console.log(`\n📄 Relatório detalhado salvo em: ${RESULTS_PATH}`);

  await prisma.$disconnect();
};

main();
