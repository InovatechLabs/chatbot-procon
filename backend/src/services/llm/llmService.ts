// src/services/ia/llmService.ts
import { prisma } from '../../../src/database/index.js';
import { classifyReport } from './helpers/classifyReport.js';
import { buildBM25Index } from '../../../src/utils/functions/bm25.js';
import { reciprocalRankFusion } from '../../../src/utils/functions/hybridSearch.js';

// Importando os novos módulos refatorados:
import { getEmbedding, generateText } from '../ollama/ollamaClient.js';
import { getVectorResults, getAllArticles } from '../../database/repositories/knowledgeRepository.js';
import { ragPrompt, orientationPrompt } from '../llm/prompts/index.js';
import { RAG_RESPONSE_SCHEMA } from '../llm/prompts/schemas/index.js';

const MAX_VECTOR_DISTANCE = 0.58; 
const DISCLAIMER = "\n\n*Resposta processada por inteligência artificial baseada nas diretrizes do PROCON. Possui caráter orientativo e não substitui o atendimento formal.*";

const RESPOSTAS_FORA_ESCOPO: Record<string, string> = {
  FORA_ESCOPO_PARTICULAR:
    "Pelo que você descreveu, trata-se de uma negociação entre particulares, sem uma das partes atuando como fornecedora habitual. Esse tipo de caso está fora da atuação do PROCON. Recomendo buscar a Justiça Comum (Juizado Especial Cível, se o valor se enquadrar) para resolver a questão.",
  FORA_ESCOPO_TRIBUTO:
    "Esse assunto envolve cobrança de tributo, taxa ou multa de um órgão público, o que está fora da atuação do PROCON. Recomendo procurar diretamente o órgão responsável pela cobrança ou a Procuradoria competente.",
  FORA_ESCOPO_ILICITO:
    "O caso relatado envolve a contratação de um serviço que, por sua própria natureza, configura prática ilícita. Por esse motivo, está fora do escopo de atuação do PROCON, que trata exclusivamente de relações de consumo lícitas. Recomendo procurar a autoridade policial para registrar o ocorrido.",
};

export interface RagResult {
  tipoResposta: 'clarificacao' | 'orientacao_final' | 'redirecionamento';
  texto: string;
  artigo: string | null;
}

/* 
* Função principal que integra a classificação do relato, busca de informações e geração de resposta orientativa, utilizando Retrieval-Augmented Generation (RAG).
*/

export const answerWithRAG = async (userQuestion: string, sessionId: string): Promise<RagResult> => {
  try {
    const chatHistory = await prisma.chatLog.findMany({
      where: { sessionId: sessionId },
      orderBy: { timestamp: 'desc' },
      take: 6
    });

    const chronologicalHistory = chatHistory.reverse();
    const formattedHistory = chronologicalHistory.length > 0 
      ? chronologicalHistory.map(log => `${log.direction === 'INBOUND' ? 'Cidadão' : 'Atendente Virtual'}: ${log.messageText}`).join('\n')
      : `Cidadão: ${userQuestion}`;

    const classification = await classifyReport(userQuestion, formattedHistory);
    console.log('📋 Classificação:', classification);

    if (classification.categoria !== 'CONSUMO' && classification.categoria !== 'AMBIGUO') {
      return {
        tipoResposta: 'redirecionamento',
        texto: RESPOSTAS_FORA_ESCOPO[classification.categoria] + DISCLAIMER,
        artigo: null
      };
    }

    const userPreviousMessages = chronologicalHistory.filter(log => log.direction === 'INBOUND').map(log => log.messageText);
    const allUserStatements = [...new Set([...userPreviousMessages, userQuestion])];
    const ragQuery = allUserStatements.join('. ');

    const embedding = await getEmbedding(ragQuery);
    const vectorString = `[${embedding.join(',')}]`;
    const vectorResults = await getVectorResults(vectorString);
    const bestVectorMatch = vectorResults[0];

    if (!bestVectorMatch || bestVectorMatch.distance > MAX_VECTOR_DISTANCE) {
      console.log('🛑 RAG abortado: Nenhuma lei semanticamente próxima. Distância:', bestVectorMatch?.distance);
      return {
        tipoResposta: 'redirecionamento',
        texto: "O seu caso possui detalhes específicos em que não encontrei uma correspondência exata nas leis de proteção básicas. Para garantir que você tenha a orientação correta, recomendo a análise humana. Gostaria de agendar um atendimento presencial no PROCON?" + DISCLAIMER,
        artigo: null
      };
    }

    const validVectorResults = vectorResults.filter(res => res.distance <= MAX_VECTOR_DISTANCE);
    const allArticles = await getAllArticles();
    const bm25Index = buildBM25Index(allArticles);
    const bm25Results = bm25Index.search(ragQuery, 10);
    const top4Ids = reciprocalRankFusion([validVectorResults, bm25Results], 4);

    if (!top4Ids || top4Ids.length === 0) {
      return {
        tipoResposta: 'redirecionamento',
        texto: "Desculpe, não encontrei informações oficiais na base do PROCON sobre esse assunto específico." + DISCLAIMER,
        artigo: null
      };
    }

    const combinedLaws = top4Ids
      .map(id => allArticles.find(a => a.id === id))
      .filter(a => a !== undefined)
      .map(res => {
        const cleanContent = res!.content.replace(/\(PALAVRAS-CHAVE PARA BUSCA:.*?\)/gi, '').trim();
        const distincaoTag = res!.distincao ? `\nDISTINÇÃO: ${res!.distincao}` : '';
        return `[LEI: ${res!.title}]\n${cleanContent}${distincaoTag}`;
      }).join('\n\n');

    const prompt = ragPrompt(formattedHistory, combinedLaws);
    const raw = await generateText(prompt, RAG_RESPONSE_SCHEMA);

    try {
      const parsed = JSON.parse(raw) as RagResult;
      
      return {
        tipoResposta: parsed.tipoResposta,
        texto: parsed.texto + DISCLAIMER,
        artigo: parsed.artigo
      };
      
    } catch (err) {
      console.error('Falha ao parsear resposta estruturada do RAG:', err, raw);
      return {
        tipoResposta: 'redirecionamento',
        texto: 'Não consegui processar sua solicitação corretamente. Gostaria de agendar um atendimento presencial?' + DISCLAIMER,
        artigo: null,
      };
    }

  } catch (error) {
    console.error("❌ Erro no processamento do RAG:", error);
    return {
        tipoResposta: 'redirecionamento',
        texto: "Desculpe, meu sistema de consulta está indisponível. Por favor, tente novamente mais tarde." + DISCLAIMER,
        artigo: null
    };
  }
};

/**
 * Função responsável por integrar com a LLM local (Ollama)
 * Cumpre os requisitos RP03 (Separação da IA), RP05 (Local) e RF04/RF05 (Resumo e Explicação).
 */

export const generateOrientativeResponse = async (userPath: string, officialText: string): Promise<string> => {
  try {
    const prompt = orientationPrompt(userPath, officialText);
    const aiText = await generateText(prompt);
    return aiText + DISCLAIMER;
  } catch (error) {
    console.error('Erro na API do Ollama. Usando Fallback de Segurança:', error);
    return officialText + DISCLAIMER;
  }
};