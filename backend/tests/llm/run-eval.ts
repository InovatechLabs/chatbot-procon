/**
 * Script de avaliação do pipeline RAG do PROCON.
 *
 * Roda os casos de teste de test-cases.json diretamente contra as funções
 * do llmService, sem passar pelo WhatsApp. Gera um eval-results.json com
 * o detalhe de cada caso e imprime um resumo no console.
 *
 * Uso: npx tsx run-eval.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../database/index.js';
import { answerWithRAG } from './llm/llmService.js';
import { classifyReport } from './llm/helpers/classifyReport.js';
// ⚠️ classifyReport precisa estar exportado em llmService.ts (export const classifyReport = ...)

// Resolve o caminho relativo à posição do próprio arquivo run-eval.ts,
// não à pasta de onde o comando é executado — evita erro de path dependendo de onde você roda o tsx.
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
  tipoRespostaEsperada: 'orientacao_final' | 'sem_artigo_adequado';
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
  tipoRespostaEsperada: 'pergunta_clarificacao';
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

// ---------- Utilitários de normalização e comparação ----------

/**
 * Extrai todas as referências a artigos de um texto, normalizadas para o
 * formato "Art. NN" (ou "Art. NN-X" para casos como 54-G), ignorando o
 * resto do título da lei. Isso evita falso-negativo por causa de
 * diferenças de grafia no nome completo do dispositivo.
 */
const extractArticleRefs = (text: string): string[] => {
  // Aceita tanto "Art." / "Art" abreviado quanto "Artigo" por extenso
  const regex = /art(?:igo)?\.?\s*(\d+[a-z-]*)/gi;
  const matches = [...text.matchAll(regex)];
  const unique = new Set(
    matches
      .map(m => m[1])
      .filter((grupo): grupo is string => Boolean(grupo))
      .map(grupo => `Art. ${grupo.toUpperCase().replace(/^-+/, '')}`)
  );
  return [...unique];
};

const responseAsksQuestion = (text: string): boolean => text.trim().endsWith('?') || text.includes('?');

const responseSuggestsAgendamento = (text: string): boolean =>
  /agendamento|atendimento presencial|unidade (local|mais próxima)/i.test(text);

// ---------- Sessão de teste (UserSession real, exigida pela FK de ChatLog) ----------

/**
 * ChatLog.sessionId é uma FK para UserSession.id (um UUID gerado pelo Prisma),
 * não uma string livre. Por isso, para qualquer caso que precise inserir
 * histórico, primeiro criamos (ou resetamos) uma UserSession de teste.
 *
 * Usamos um phoneNumber sintético e determinístico por caso (ex: "eval-PC-01-completo"),
 * e limpamos a sessão anterior com esse mesmo número a cada execução — assim as
 * rodadas de avaliação são repetíveis e não acumulam lixo no banco.
 *
 * Graças ao onDelete: Cascade no schema, apagar a UserSession já apaga os
 * ChatLog vinculados automaticamente, sem precisar de um delete separado.
 */
const getOrResetEvalSession = async (caseId: string): Promise<{ id: string; phoneNumber: string }> => {
  const phoneNumber = `eval-${caseId}`;

  const existing = await prisma.userSession.findUnique({ where: { phoneNumber } });
  if (existing) {
    await prisma.userSession.delete({ where: { id: existing.id } }); // cascade apaga os ChatLog junto
  }

  const session = await prisma.userSession.create({
    data: {
      phoneNumber,
      isChat: true, // representa uma conversa livre (RAG), não navegação por menu
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
  let baseTime = Date.now() - historico.length * 60_000; // espaça as mensagens em 1 min entre si
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
    const { id: sessionId } = await getOrResetEvalSession(caso.id); // sessão nova e limpa, sem histórico prévio

    console.log(`\n[${caso.id}] ${caso.descricao}`);

    try {
      const t0 = Date.now();
      const classification = await classifyReport(caso.mensagem, `Cidadão: ${caso.mensagem}`);
      const tClassify = Date.now() - t0;

      const t1 = Date.now();
      const response = await answerWithRAG(caso.mensagem, sessionId);
      const tFull = Date.now() - t1;

      const categoriaOk = classification.categoria === caso.categoriaEsperada;

      let artigoOk: boolean;
      const artigosEncontrados = extractArticleRefs(response);

      if (caso.tipoRespostaEsperada === 'sem_artigo_adequado' || caso.artigoEsperado === null) {
        artigoOk = artigosEncontrados.length === 0;
      } else {
        artigoOk = artigosEncontrados.includes(caso.artigoEsperado);
      }

      const multiplasLeis = artigosEncontrados.length > 1;

      console.log(`  categoria: ${categoriaOk ? '✅' : '❌'} (esperado: ${caso.categoriaEsperada}, obtido: ${classification.categoria})`);
      console.log(`  artigo:    ${artigoOk ? '✅' : '❌'} (esperado: ${caso.artigoEsperado ?? 'nenhum'}, encontrado(s): ${artigosEncontrados.join(', ') || 'nenhum'})`);
      if (multiplasLeis) console.log(`  ⚠️  resposta menciona mais de um artigo — verificar regra 5 (escolher apenas um)`);
      console.log(`  tempo: classificação ${(tClassify / 1000).toFixed(1)}s | pipeline completo ${(tFull / 1000).toFixed(1)}s`);

      resultados.push({
        id: caso.id,
        descricao: caso.descricao,
        categoriaEsperada: caso.categoriaEsperada,
        categoriaObtida: classification.categoria,
        categoriaOk,
        artigoEsperado: caso.artigoEsperado,
        artigosEncontrados,
        artigoOk,
        multiplasLeis,
        tempoClassificacaoMs: tClassify,
        tempoPipelineMs: tFull,
        resposta: response,
      });
    } catch (err) {
      console.error(`  ❌ ERRO ao rodar caso ${caso.id}:`, err);
      resultados.push({ id: caso.id, erro: String(err) });
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
      const respostaInicial = await answerWithRAG(caso.mensagemInicial, sessionIdInicial);
      const tInicial = Date.now() - t0;

      const categoriaInicialOk = classificationInicial.categoria === caso.categoriaEsperadaInicial;
      const fezPergunta = responseAsksQuestion(respostaInicial);

      console.log(`  [inicial] categoria: ${categoriaInicialOk ? '✅' : '❌'} (esperado: ${caso.categoriaEsperadaInicial}, obtido: ${classificationInicial.categoria})`);
      console.log(`  [inicial] pediu clarificação: ${fezPergunta ? '✅' : '❌'}`);
      console.log(`  [inicial] resposta: "${respostaInicial.slice(0, 150)}${respostaInicial.length > 150 ? '...' : ''}"`);

      // --- Etapa 2: conversa completa (histórico + resposta do cidadão), espera orientação final ---
      const { id: sessionIdCompleto, phoneNumber: phoneNumberCompleto } = await getOrResetEvalSession(`${caso.id}-completo`);
      await seedHistory(sessionIdCompleto, phoneNumberCompleto, caso.conversaCompleta.historico);

      const t1 = Date.now();
      const historicoTexto = caso.conversaCompleta.historico
        .map(h => `${h.autor}: ${h.mensagem}`)
        .join('\n');
      const classificationFinal = await classifyReport(caso.conversaCompleta.mensagemFinal, historicoTexto);
      const respostaFinal = await answerWithRAG(caso.conversaCompleta.mensagemFinal, sessionIdCompleto);
      const tFinal = Date.now() - t1;

      const categoriaFinalOk = classificationFinal.categoria === caso.conversaCompleta.categoriaEsperadaFinal;
      const artigosEncontrados = extractArticleRefs(respostaFinal);

      let artigoFinalOk: boolean;
      if (caso.conversaCompleta.artigoEsperadoFinal === null) {
        artigoFinalOk = artigosEncontrados.length === 0;
      } else {
        artigoFinalOk = artigosEncontrados.includes(caso.conversaCompleta.artigoEsperadoFinal);
      }

      console.log(`  [final]   categoria: ${categoriaFinalOk ? '✅' : '❌'} (esperado: ${caso.conversaCompleta.categoriaEsperadaFinal}, obtido: ${classificationFinal.categoria})`);
      console.log(`  [final]   artigo:    ${artigoFinalOk ? '✅' : '❌'} (esperado: ${caso.conversaCompleta.artigoEsperadoFinal ?? 'nenhum'}, encontrado(s): ${artigosEncontrados.join(', ') || 'nenhum'})`);
      console.log(`  tempo: etapa inicial ${(tInicial / 1000).toFixed(1)}s | etapa final ${(tFinal / 1000).toFixed(1)}s`);

      resultados.push({
        id: caso.id,
        descricao: caso.descricao,
        etapaInicial: {
          categoriaEsperada: caso.categoriaEsperadaInicial,
          categoriaObtida: classificationInicial.categoria,
          categoriaOk: categoriaInicialOk,
          fezPergunta,
          resposta: respostaInicial,
        },
        etapaFinal: {
          categoriaEsperada: caso.conversaCompleta.categoriaEsperadaFinal,
          categoriaObtida: classificationFinal.categoria,
          categoriaOk: categoriaFinalOk,
          artigoEsperado: caso.conversaCompleta.artigoEsperadoFinal,
          artigosEncontrados,
          artigoOk: artigoFinalOk,
          resposta: respostaFinal,
        },
        tempoInicialMs: tInicial,
        tempoFinalMs: tFinal,
      });
    } catch (err) {
      console.error(`  ❌ ERRO ao rodar caso ${caso.id}:`, err);
      resultados.push({ id: caso.id, erro: String(err) });
    }
  }

  return resultados;
};

// ---------- Main ----------

const main = async () => {
  const dataset: Dataset = JSON.parse(fs.readFileSync(TEST_CASES_PATH, 'utf-8'));

  console.log('='.repeat(60));
  console.log('RODANDO CASOS DE ORIENTAÇÃO DIRETA');
  console.log('='.repeat(60));
  const resultadosDiretos = await runOrientacaoDireta(dataset.orientacao_direta);


  console.log('\n' + '='.repeat(60));
  console.log('RODANDO CASOS DE CLARIFICAÇÃO');
  console.log('='.repeat(60));
  const resultadosClarificacao = await runPrecisaClarificacao(dataset.precisa_clarificacao);

  fs.writeFileSync(
    RESULTS_PATH,
    JSON.stringify({ resultadosClarificacao, executadoEm: new Date().toISOString() }, null, 2)
  );

  // ---------- Resumo ----------
 
  const totalDiretos = resultadosDiretos.length;
  const acertosCategoriaDiretos = resultadosDiretos.filter((r: any) => r.categoriaOk).length;
  const acertosArtigoDiretos = resultadosDiretos.filter((r: any) => r.artigoOk).length;

  const totalClarificacao = resultadosClarificacao.length;
  const acertosPerguntaInicial = resultadosClarificacao.filter((r: any) => r.etapaInicial?.fezPergunta).length;
  const acertosCategoriaFinal = resultadosClarificacao.filter((r: any) => r.etapaFinal?.categoriaOk).length;
  const acertosArtigoFinal = resultadosClarificacao.filter((r: any) => r.etapaFinal?.artigoOk).length;

  console.log('\n' + '='.repeat(60));
  console.log('RESUMO');
  console.log('='.repeat(60));
  
  console.log(`Orientação direta (${totalDiretos} casos):`);
  console.log(`  Categoria correta: ${acertosCategoriaDiretos}/${totalDiretos}`);
  console.log(`  Artigo correto:    ${acertosArtigoDiretos}/${totalDiretos}`);
  
  console.log(`Clarificação (${totalClarificacao} casos):`);
  console.log(`  Fez a pergunta na etapa inicial: ${acertosPerguntaInicial}/${totalClarificacao}`);
  console.log(`  Categoria correta na etapa final: ${acertosCategoriaFinal}/${totalClarificacao}`);
  console.log(`  Artigo correto na etapa final:    ${acertosArtigoFinal}/${totalClarificacao}`);
  console.log('\nResultado detalhado salvo em eval-results.json');

  await prisma.$disconnect();
};

main();