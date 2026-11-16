import { prisma } from '../../database/index.js';
import { classifyReport } from './helpers/classifyReport.js';
import { processThinkingOutput } from './helpers/processThinkingOutput.js';
import { buildBM25Index } from '../../utils/functions/bm25.js';
import { reciprocalRankFusion } from '../../utils/functions/hybridSearch.js';
import { getEmbedding, generateText } from '../ollama/ollamaClient.js';
import { getVectorResults, getAllArticles } from '../../database/repositories/knowledgeRepository.js';
import { ragPrompt, orientationPrompt } from './prompts/index.js';
import { articleReferences, normalizeReference } from './helpers/articleReference.js';
import { RAG_RESPONSE_SCHEMA } from './prompts/schemas/index.js';
import { getRespostaFixa } from './helpers/fixedResponses.js';
import type { Acao } from './helpers/fixedResponses.js';
import { isSafeRewrite } from './helpers/rewriteGuard.js';
import { hasUnverifiedProductDeadline, hasMismatchedProductReference } from './helpers/ragGuard.js';
import { charLength, normalizeWhatsappFormatting } from '../whatsapp/messagePolicy.js';
import { applyClarificationLimit } from './helpers/clarification.js';

const MAX_VECTOR_DISTANCE = 0.58;
export const DISCLAIMER = '\n\n*Resposta processada por inteligência artificial seguindo as diretrizes do PROCON. Possui caráter orientativo e não substitui análise formal.*';

export interface RagDiagnostics {
  classificacaoUsada: { categoria: string; motivo: string; consultaBusca?: string };
  consultaBuscaUsada: string | null;
  candidatosRecuperados: string[];
  motivoDescarte: string | null;
  referenciaGerada?: unknown;
  referenciaNormalizada?: string | null;
  referenciasPermitidas?: string[];
  temperatura?: number;
  parametrosModelo: { modelo: string; thinking: boolean };
}

export interface RagResult {
  tipoResposta: 'clarificacao' | 'orientacao_final' | 'redirecionamento' | 'fixa';
  texto: string;
  artigo: string | null;
  acoes?: Acao[];
  diagnostics?: RagDiagnostics | undefined;
}

export const sanitizeArtigoField = normalizeReference;

const redirect = (texto: string): RagResult => ({ tipoResposta: 'redirecionamento', texto, artigo: null });
const technicalFailure = (): RagResult => ({ tipoResposta: 'fixa', artigo: null, acoes: ['menu'],
  texto: 'Minha consulta está temporariamente indisponível. Tente novamente em alguns instantes ou fale com o PROCON pelo (12) 3955-9130. Você também pode usar as opções do menu.' });

const dependencies = { db: prisma, classify: classifyReport, embed: getEmbedding, generate: generateText,
  vectors: getVectorResults, articles: getAllArticles };

export interface RagOptions {
  preClassification?: import('./helpers/classifyReport.js').ClassificationResult;
  includeDiagnostics?: boolean;
  /** Perguntas efetivamente enviadas, persistidas pela conversa na sessão. */
  clarificationCount?: number;
}

export function createRagService(overrides: Partial<typeof dependencies> = {}) {
  const d = { ...dependencies, ...overrides };
  return async (question: string, sessionId: string, options?: RagOptions): Promise<RagResult> => {
    const collectDiag = options?.includeDiagnostics ?? false;
    const modelName = process.env.OLLAMA_GENERATE_MODEL_NAME || 'desconhecido';
    const thinkingEnabled = process.env.LLM_ENABLE_THINKING === 'true';

    const makeDiag = (
      classification: { categoria: string; motivo: string; consultaBusca?: string },
      extra: Partial<Omit<RagDiagnostics, 'classificacaoUsada' | 'parametrosModelo'>> = {}
    ): RagDiagnostics | undefined => {
      if (!collectDiag) return undefined;
      return {
        classificacaoUsada: classification,
        consultaBuscaUsada: extra.consultaBuscaUsada ?? null,
        candidatosRecuperados: extra.candidatosRecuperados ?? [],
        motivoDescarte: extra.motivoDescarte ?? null,
        ...extra,
        temperatura: 0,
        parametrosModelo: { modelo: modelName, thinking: thinkingEnabled },
      };
    };

    try {
      // Retém a origem do caso e a conversa recente, sem resumo inventado por IA.
      const [recent, origin, firstReport] = await Promise.all([
        d.db.chatLog.findMany({ where: { sessionId }, orderBy: { timestamp: 'desc' }, take: 12 }),
        d.db.chatLog.findMany({ where: { sessionId }, orderBy: { timestamp: 'asc' }, take: 8 }),
        d.db.chatLog.findMany({ where: { sessionId, direction: 'INBOUND', stepId: null }, orderBy: { timestamp: 'asc' }, take: 1 }),
      ]);
      const history = [...new Map([...origin, ...[...recent].reverse()].map(log => [log.id, log])).values()];
      const formattedHistory = `${firstReport[0] ? `Relato inicial do cidadão: ${firstReport[0].messageText}\n` : ''}${history.map(log => `${log.direction === 'INBOUND' ? 'Cidadão' : 'Assistente virtual do PROCON de Jacareí'}: ${log.messageText}`).join('\n')}`;
      const classification = options?.preClassification ?? await d.classify(question, formattedHistory);
      if (classification.categoria === 'AGENDAMENTO') {
        return { ...redirect('Posso ajudar a marcar atendimento presencial no PROCON de Jacareí. Quer agendar?'),
          diagnostics: makeDiag(classification, { motivoDescarte: 'categoria_agendamento' }) };
      }
      const fixed = getRespostaFixa(classification.categoria);
      if (fixed) {
        const previous = recent.find(log => log.direction === 'OUTBOUND');
        const repeated = classification.categoria.startsWith('FORA_ESCOPO') && previous?.messageText.includes(fixed.texto);
        return { tipoResposta: 'fixa', artigo: null, ...fixed, texto: repeated ? `Entendo que isso seja frustrante. ${fixed.texto}` : fixed.texto,
          diagnostics: makeDiag(classification, { motivoDescarte: 'resposta_fixa' }) };
      }
      const clarify = (text = 'O que aconteceu e foi com uma loja, um site, um banco ou uma pessoa?', diagExtra: Partial<Omit<RagDiagnostics, 'classificacaoUsada' | 'parametrosModelo'>> = {}): RagResult =>
        applyClarificationLimit({ tipoResposta: 'clarificacao', texto: text.trim(), artigo: null,
          diagnostics: makeDiag(classification, { ...diagExtra, motivoDescarte: 'clarificacao' }) }, options?.clarificationCount ?? 0);
      if (classification.categoria === 'AMBIGUO' || (classification.categoria === 'CONSUMO' && classification.informacaoSuficiente === false)) return clarify(classification.perguntaEsclarecimento || undefined);

      const statements = history.filter(log => log.direction === 'INBOUND' && !log.stepId).map(log => log.messageText);
      const menuContext = history.filter(log => log.direction === 'INBOUND' && log.stepId).slice(-4).map(log => log.messageText);
      const originalQuery = [...new Set([firstReport[0]?.messageText ?? statements[0] ?? '', ...menuContext, ...statements.slice(-3), question].filter(Boolean))].join('\n').slice(-8000);
      let ragQuery = classification.consultaBusca?.trim() || originalQuery;
      let embedding = await d.embed(ragQuery);
      let vectorResults = await d.vectors(`[${embedding.join(',')}]`);
      let valid = vectorResults.filter(result => result.distance <= MAX_VECTOR_DISTANCE);
      // Uma paráfrase ruim não deve impedir a consulta original de ser avaliada.
      // Só acrescenta embedding quando a consulta contextual não passou no limiar.
      if (!valid.length && ragQuery !== originalQuery) {
        ragQuery = originalQuery;
        embedding = await d.embed(ragQuery);
        vectorResults = await d.vectors(`[${embedding.join(',')}]`);
        valid = vectorResults.filter(result => result.distance <= MAX_VECTOR_DISTANCE);
      }
      if (!valid.length) return { ...redirect('Não encontrei uma orientação suficientemente próxima na base consultada. Para uma análise do seu caso pela equipe, quer agendar atendimento presencial?'),
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, motivoDescarte: 'sem_candidatos_vetor' }) };
      const articles = await d.articles();
      const lexical = buildBM25Index(articles);
      const lexicalIds = reciprocalRankFusion([lexical.search(originalQuery, 10), lexical.search(ragQuery, 10)], 10);
      const ids = reciprocalRankFusion([valid, lexicalIds.map(id => ({ id }))], 4);
      const selected = ids.map(id => articles.find(article => article.id === id)).filter(article => article !== undefined);
      if (!selected.length) return { ...redirect('Não encontrei informações suficientes na base para orientar sobre esse assunto. Quer agendar uma análise presencial?'),
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: ids, motivoDescarte: 'sem_artigos_apos_fusao' }) };
      const candidateIds = selected.map(a => a.id);
      const laws = selected.map(article => `[LEI: ${article.title}]\n${article.content.replace(/\(PALAVRAS-CHAVE PARA BUSCA:.*?\)/gi, '').trim()}${article.distincao ? `\nDISTINÇÃO: ${article.distincao}` : ''}`).join('\n\n');
      const allowedReferences = [...new Set(selected.flatMap(item => articleReferences(item.title)))];
      const responseSchema = { ...RAG_RESPONSE_SCHEMA, properties: { ...RAG_RESPONSE_SCHEMA.properties,
        artigo: { type: ['string', 'null'], enum: [...allowedReferences, null] } } };
      const raw = await d.generate(ragPrompt(`${formattedHistory}\nÚltima mensagem: ${question}`, laws + `\nREFERENCIAS_PERMITIDAS_JSON: ${JSON.stringify(allowedReferences)}`), responseSchema, { temperature: 0 });
      let parsed: { tipoResposta: string; texto: string; artigo?: unknown };
      try { parsed = JSON.parse(processThinkingOutput(raw).cleanText); }
      catch { return { ...technicalFailure(),
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, motivoDescarte: 'parse_falhou' }) }; }
      if (!['clarificacao', 'orientacao_final', 'redirecionamento'].includes(parsed.tipoResposta) || typeof parsed.texto !== 'string' || !parsed.texto.trim()) {
        return { ...technicalFailure(),
          diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, motivoDescarte: 'resposta_invalida' }) }; }
      const text = normalizeWhatsappFormatting(parsed.texto);
      if (charLength(text) > 900) return { ...redirect('A orientação precisa de uma análise mais detalhada do que consigo oferecer por aqui. Quer agendar atendimento presencial?'),
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, motivoDescarte: 'texto_excede_900_chars' }) };
      if (parsed.tipoResposta === 'clarificacao') return clarify(text, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds });
      if (parsed.tipoResposta === 'redirecionamento') return { ...redirect(text + DISCLAIMER),
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, motivoDescarte: 'modelo_redirecionou' }) };
      const article = sanitizeArtigoField(parsed.artigo);
      // A base pode conter normas além do CDC. Só exibe a referência exata validada.
      // Separa a descrição; evita interpretar o V de "Vício" como sufixo do artigo.
      const knownArticle = article && allowedReferences.includes(article);
      if (!knownArticle || hasUnverifiedProductDeadline(text, article) || hasMismatchedProductReference(`${question}\n${ragQuery}`, article)) {
        const reason = !article ? 'referencia_formato_invalido' : !knownArticle ? 'referencia_fora_candidatos'
          : hasUnverifiedProductDeadline(text, article) ? 'prazo_produto_nao_verificado'
          : 'produto_referencia_incompativel';
        console.warn(`Orientação descartada: ${reason}.`);
        return { ...redirect('Não consegui confirmar essa orientação com segurança. Para evitar informar um direito ou prazo incorreto, recomendo a análise da equipe. Quer agendar atendimento presencial?'),
          diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, motivoDescarte: reason, referenciaGerada: parsed.artigo, referenciaNormalizada: article, referenciasPermitidas: allowedReferences }) };
      }
      return { tipoResposta: 'orientacao_final', texto: text + `\n\nBase legal: ${article}.` + DISCLAIMER, artigo: article,
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, referenciaGerada: parsed.artigo, referenciaNormalizada: article, referenciasPermitidas: allowedReferences }) };
    } catch (error) {
      console.error('Falha na consulta de orientação:', error instanceof Error ? error.message : 'erro');
      return technicalFailure();
    }
  };
}

export const answerWithRAG = createRagService();

export const createOrientationService = (generate = generateText) => async (path: string, officialText: string): Promise<string> => {
  try {
    const output = await generate(orientationPrompt(path, officialText));
    const rewritten = normalizeWhatsappFormatting(processThinkingOutput(output).cleanText.trim());
    if (isSafeRewrite(officialText, rewritten)) return rewritten + DISCLAIMER;
    console.warn('Reescrita descartada: fatos, ressalvas, formato ou tamanho divergentes.');
  } catch {
    console.warn('Reescrita indisponível; enviando orientação oficial.');
  }
  // O fallback é a fonte oficial, portanto não recebe aviso de conteúdo gerado por IA.
  return officialText;
};

export const generateOrientativeResponse = createOrientationService();
