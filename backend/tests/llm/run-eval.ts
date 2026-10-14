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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_CASES_PATH = path.join(__dirname, 'test-cases.json');
const RESULTS_PATH = path.join(__dirname, 'eval-results.json');

// ---------- Tipos do dataset ----------

interface CasoOrientacaoDireta {
  id: string;
  descricao: string;
  mensagem: string;
  categoriaEsperada: string;
  tipoRespostaEsperada: 'orientacao_final' | 'redirecionamento';
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
  tipoRespostaEsperada: 'clarificacao';
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
      const ragResult = await answerWithRAG(caso.mensagem, sessionId);
      const tFull = Date.now() - t1;

      const categoriaOk = classification.categoria === caso.categoriaEsperada;
      const tipoRespostaOk = ragResult.tipoResposta === caso.tipoRespostaEsperada;

      // Validação com normalização de artigo
      const artigoObtidoNormalizado = normalizarArtigo(ragResult.artigo);
      const artigoEsperadoNormalizado = normalizarArtigo(caso.artigoEsperado);
      const artigoOk = artigoObtidoNormalizado === artigoEsperadoNormalizado;

      console.log(`  categoria:    ${categoriaOk ? '✅' : '❌'} (esperado: ${caso.categoriaEsperada}, obtido: ${classification.categoria})`);
      console.log(`  tipoResposta: ${tipoRespostaOk ? '✅' : '❌'} (esperado: ${caso.tipoRespostaEsperada}, obtido: ${ragResult.tipoResposta})`);
      console.log(`  artigo:       ${artigoOk ? '✅' : '❌'} (esperado: ${caso.artigoEsperado ?? 'nenhum'}, encontrado: ${ragResult.artigo || 'nenhum'})`);
      console.log(`  tempo:        classificação ${(tClassify / 1000).toFixed(2)}s | pipeline RAG ${(tFull / 1000).toFixed(2)}s`);

      resultados.push({
        id: caso.id,
        descricao: caso.descricao,
        categoriaEsperada: caso.categoriaEsperada,
        categoriaObtida: classification.categoria,
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
      const ragResultInicial = await answerWithRAG(caso.mensagemInicial, sessionIdInicial);
      const tInicial = Date.now() - t0;

      const categoriaInicialOk = classificationInicial.categoria === caso.categoriaEsperadaInicial;
      const fezPergunta = ragResultInicial.tipoResposta === 'clarificacao';

      console.log(`  [inicial] categoria: ${categoriaInicialOk ? '✅' : '❌'} (esperado: ${caso.categoriaEsperadaInicial}, obtido: ${classificationInicial.categoria})`);
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
      const ragResultFinal = await answerWithRAG(caso.conversaCompleta.mensagemFinal, sessionIdCompleto);
      const tFinal = Date.now() - t1;

      const categoriaFinalOk = classificationFinal.categoria === caso.conversaCompleta.categoriaEsperadaFinal;
      
      // Validação normalizada de artigo
      const artigoFinalObtidoNormalizado = normalizarArtigo(ragResultFinal.artigo);
      const artigoFinalEsperadoNormalizado = normalizarArtigo(caso.conversaCompleta.artigoEsperadoFinal);
      const artigoFinalOk = artigoFinalObtidoNormalizado === artigoFinalEsperadoNormalizado;

      console.log(`  [final]   categoria: ${categoriaFinalOk ? '✅' : '❌'} (esperado: ${caso.conversaCompleta.categoriaEsperadaFinal}, obtido: ${classificationFinal.categoria})`);
      console.log(`  [final]   artigo:    ${artigoFinalOk ? '✅' : '❌'} (esperado: ${caso.conversaCompleta.artigoEsperadoFinal ?? 'nenhum'}, encontrado: ${ragResultFinal.artigo || 'nenhum'})`);
      console.log(`  tempo: etapa inicial ${(tInicial / 1000).toFixed(2)}s | etapa final ${(tFinal / 1000).toFixed(2)}s`);

      resultados.push({
        id: caso.id,
        descricao: caso.descricao,
        etapaInicial: {
          categoriaEsperada: caso.categoriaEsperadaInicial,
          categoriaObtida: classificationInicial.categoria,
          categoriaOk: categoriaInicialOk,
          fezPergunta,
          tipoRespostaObtido: ragResultInicial.tipoResposta,
          resposta: ragResultInicial.texto,
          tempoMs: tInicial,
        },
        etapaFinal: {
          categoriaEsperada: caso.conversaCompleta.categoriaEsperadaFinal,
          categoriaObtida: classificationFinal.categoria,
          categoriaOk: categoriaFinalOk,
          artigoEsperado: caso.conversaCompleta.artigoEsperadoFinal,
          artigoObtido: ragResultFinal.artigo,
          artigoOk: artigoFinalOk,
          tipoRespostaObtido: ragResultFinal.tipoResposta,
          resposta: ragResultFinal.texto,
          tempoMs: tFinal,
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

  console.log('='.repeat(60));
  console.log(`INICIANDO BENCHMARK RAG PROCON`);
  console.log(`Modelo LLM: ${process.env.LLM_MODEL || 'Ollama Default'}`);
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
  const acertosPerguntaInicial = resultadosClarificacao.filter((r: any) => r.etapaInicial?.fezPergunta).length;
  const acertosCategoriaFinal = resultadosClarificacao.filter((r: any) => r.etapaFinal?.categoriaOk).length;
  const acertosArtigoFinal = resultadosClarificacao.filter((r: any) => r.etapaFinal?.artigoOk).length;

  const summary = {
    modelo: process.env.LLM_MODEL || 'Desconhecido',
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
        acertosTipoPerguntaTurno1: `${acertosPerguntaInicial}/${totalClarificacao} (${((acertosPerguntaInicial / (totalClarificacao || 1)) * 100).toFixed(1)}%)`,
        acertosCategoriaFinal: `${acertosCategoriaFinal}/${totalClarificacao} (${((acertosCategoriaFinal / (totalClarificacao || 1)) * 100).toFixed(1)}%)`,
        acertosArtigoFinal: `${acertosArtigoFinal}/${totalClarificacao} (${((acertosArtigoFinal / (totalClarificacao || 1)) * 100).toFixed(1)}%)`,
      },
    },
  };

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
  console.log(`  - Categoria Final:   ${summary.metricas.clarificacao.acertosCategoriaFinal}`);
  console.log(`  - Artigo Final:      ${summary.metricas.clarificacao.acertosArtigoFinal}`);
  console.log(`\n📄 Relatório detalhado salvo em: ${RESULTS_PATH}`);

  await prisma.$disconnect();
};

main();