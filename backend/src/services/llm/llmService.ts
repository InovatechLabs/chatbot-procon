import { prisma } from '../../database/index.js';
import { classifyReport } from './helpers/classifyReport.js';
import { processThinkingOutput } from './helpers/processThinkingOutput.js';
import { buildBM25Index } from '../../utils/functions/bm25.js';
import { getEmbedding, generateText } from '../ollama/ollamaClient.js';
import { defaultGeneration, type GenerationSettings } from '../ollama/settings.js';
import { getVectorResults, getAllArticles } from '../../database/repositories/knowledgeRepository.js';
import { ragPrompt, orientationPrompt } from './prompts/index.js';
import { articleReferences, normalizeReference } from './helpers/articleReference.js';
import { RAG_RESPONSE_SCHEMA } from './prompts/schemas/index.js';
import { readInstitution, renderInstitution, type Institution } from '../institution/settings.js';
import { getRespostaFixa } from './helpers/fixedResponses.js';
import type { Acao } from './helpers/fixedResponses.js';
import { isSafeRewrite } from './helpers/rewriteGuard.js';
import { charLength, normalizeWhatsappFormatting } from '../whatsapp/messagePolicy.js';
import { applyClarificationLimit } from './helpers/clarification.js';
import { redactIdentifiers } from '../privacy/redact.js';
import { ExternalWorkRequired } from '../whatsapp/externalWork.js';
import { loadLegalRuleCatalog, prepareLegalContext } from './legalKnowledge/context.js';
import type { LegalRulesMode, LegalContextDiagnostics } from './legalKnowledge/context.js';
import { inspectLegalSafety, containsLegalDeadline, legalReferencesIn } from './legalKnowledge/safety.js';
import type { CitizenEvidence } from './legalKnowledge/safety.js';
import { evaluateGeneratedSafety } from './legalKnowledge/responseSafety.js';
import { rankHybridCandidates, expandRetrievalContext, renderRetrievedArticles } from './helpers/retrievalSelection.js';
import type { RetrievalSelectionDiagnostics } from './helpers/retrievalSelection.js';

export const MAX_VECTOR_DISTANCE = 0.58;
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
  regrasAuxiliares?: LegalContextDiagnostics;
  segurancaJuridica?: { reasons: string[]; evidence: CitizenEvidence };
  selecaoRecuperacao?: RetrievalSelectionDiagnostics;
  parametrosModelo: { modelo: string; thinking: boolean };
}

export interface RagResult {
  tipoResposta: 'clarificacao' | 'orientacao_final' | 'redirecionamento' | 'fixa';
  texto: string;
  artigo: string | null;
  acoes?: Acao[];
  atendimento?: 'chat' | 'confirmar_canal';
  diagnostics?: RagDiagnostics | undefined;
}

export const sanitizeArtigoField = normalizeReference;

const redirect = (texto: string): RagResult => ({ tipoResposta: 'redirecionamento', texto, artigo: null });
const technicalFailure = (institution: Institution): RagResult => ({ tipoResposta: 'fixa', artigo: null, acoes: ['menu'],
  texto: renderInstitution(institution.unavailableMessage, institution) });

const dependencies = { db: prisma, classify: classifyReport, embed: getEmbedding, generate: generateText,
  vectors: getVectorResults, articles: getAllArticles, legalCatalog: loadLegalRuleCatalog };

export interface RagOptions {
  institution?: Institution;
  generation?: GenerationSettings;
  preClassification?: import('./helpers/classifyReport.js').ClassificationResult;
  includeDiagnostics?: boolean;
  /** Perguntas efetivamente enviadas, persistidas pela conversa na sessão. */
  clarificationCount?: number;
  /** Prévia é opt-in para avaliação com diagnósticos, sem aprovar rascunhos. */
  legalRulesMode?: LegalRulesMode;
  /** Somente avaliação com relatos fictícios; nunca integra diagnósticos de produção. */
  onGeneratedForEvaluation?: (value: { tipoResposta: string; texto: string; artigo: string | null }) => void;
}

export function createRagService(overrides: Partial<typeof dependencies> = {}) {
  const d = { ...dependencies, ...overrides };
  return async (question: string, sessionId: string, options?: RagOptions): Promise<RagResult> => {
    const collectDiag = options?.includeDiagnostics ?? false;
    const generation = options?.generation ?? defaultGeneration();
    const modelName = generation.model || 'desconhecido';
    const thinkingEnabled = generation.thinkingEnabled;
    const legalRulesMode = options?.legalRulesMode ?? 'approved';
    if (legalRulesMode === 'preview' && !collectDiag) throw new Error('Prévia jurídica exige diagnósticos explícitos.');
    if (options?.onGeneratedForEvaluation && !collectDiag) throw new Error('Captura de avaliação exige diagnósticos explícitos.');
    const institution = options?.institution ?? await readInstitution(d.db);
    const referral = renderInstitution(institution.referralMessage, institution);
    let legalDiagnostics: LegalContextDiagnostics | undefined;
    let safetyDiagnostics: RagDiagnostics['segurancaJuridica'];
    let selectionDiagnostics: RetrievalSelectionDiagnostics | undefined;

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
        ...(legalDiagnostics ? { regrasAuxiliares: legalDiagnostics } : {}),
        ...(safetyDiagnostics ? { segurancaJuridica: safetyDiagnostics } : {}),
        ...(selectionDiagnostics ? { selecaoRecuperacao: selectionDiagnostics } : {}),
        temperatura: 0,
        parametrosModelo: { modelo: modelName, thinking: thinkingEnabled },
      };
    };

    try {
      const personal = await d.db.userSession?.findUnique({ where: { id: sessionId }, select: { userName: true, userCpf: true, phoneNumber: true } });
      const scrub = (value: string) => redactIdentifiers(value, [personal?.userName, personal?.userCpf, personal?.phoneNumber]);
      question = scrub(question);
      // Retém a origem do caso e a conversa recente, sem resumo inventado por IA.
      const [recent, origin, firstReport] = await Promise.all([
        d.db.chatLog.findMany({ where: { sessionId }, orderBy: { timestamp: 'desc' }, take: 12 }),
        d.db.chatLog.findMany({ where: { sessionId }, orderBy: { timestamp: 'asc' }, take: 8 }),
        d.db.chatLog.findMany({ where: { sessionId, direction: 'INBOUND', stepId: null }, orderBy: { timestamp: 'asc' }, take: 1 }),
      ]);
      const history = [...new Map([...origin, ...[...recent].reverse()].map(log => [log.id, { ...log, messageText: scrub(log.messageText) }])).values()];
      for (const log of firstReport) log.messageText = scrub(log.messageText);
      const formattedHistory = `${firstReport[0] ? `Relato inicial do cidadão: ${firstReport[0].messageText}\n` : ''}${history.map(log => `${log.direction === 'INBOUND' ? 'Cidadão' : 'Assistente virtual do PROCON de Jacareí'}: ${log.messageText}`).join('\n')}`;
      const citizenMessages = [...history.filter(log => log.direction === 'INBOUND' && !log.stepId).map(log => log.messageText), question];
      const rawClassification = options?.preClassification ?? await d.classify(question, formattedHistory, generation);
      const classification = { ...rawClassification, motivo: scrub(rawClassification.motivo), ...(rawClassification.consultaBusca ? { consultaBusca: scrub(rawClassification.consultaBusca) } : {}), ...(rawClassification.perguntaEsclarecimento ? { perguntaEsclarecimento: scrub(rawClassification.perguntaEsclarecimento) } : {}) };
      if (classification.categoria === 'AGENDAMENTO') {
        return { ...redirect(renderInstitution(institution.appointmentMessage, institution)),
          diagnostics: makeDiag(classification, { motivoDescarte: 'categoria_agendamento' }) };
      }
      if (classification.categoria === 'ATENDIMENTO_HUMANO_CHAT' || classification.categoria === 'CANAL_ATENDIMENTO_INDEFINIDO') {
        return { tipoResposta: 'fixa', artigo: null, texto: getRespostaFixa('INFO_ATENDIMENTO', institution)!.texto,
          atendimento: classification.categoria === 'ATENDIMENTO_HUMANO_CHAT' ? 'chat' : 'confirmar_canal',
          diagnostics: makeDiag(classification, { motivoDescarte: 'intencao_atendimento' }) };
      }
      const fixed = getRespostaFixa(classification.categoria, institution);
      if (fixed) {
        const previous = recent.find(log => log.direction === 'OUTBOUND');
        const repeated = classification.categoria.startsWith('FORA_ESCOPO') && previous?.messageText.includes(fixed.texto);
        return { tipoResposta: 'fixa', artigo: null, ...fixed, texto: repeated ? `Entendo que isso seja frustrante. ${fixed.texto}` : fixed.texto,
          diagnostics: makeDiag(classification, { motivoDescarte: 'resposta_fixa' }) };
      }
      const clarify = (text = 'O que aconteceu e foi com uma loja, um site, um banco ou uma pessoa?', diagExtra: Partial<Omit<RagDiagnostics, 'classificacaoUsada' | 'parametrosModelo'>> = {}): RagResult => {
        const check = inspectLegalSafety({ text, article: null, kind: 'clarificacao', citizenMessages, sources: [] });
        if (!check.passed) {
          safetyDiagnostics = { reasons: check.reasons, evidence: check.evidence };
          text = 'O que aconteceu e foi com uma loja, um site, um banco ou uma pessoa?';
        }
        return applyClarificationLimit({ tipoResposta: 'clarificacao', texto: text.trim(), artigo: null,
          diagnostics: makeDiag(classification, { ...diagExtra, motivoDescarte: diagExtra.motivoDescarte ?? 'clarificacao' }) }, options?.clarificationCount ?? 0, institution);
      };
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
      if (!valid.length) return { ...redirect(`Não encontrei uma orientação suficientemente próxima na base consultada. ${referral}`),
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, motivoDescarte: 'sem_candidatos_vetor' }) };
      const articles = await d.articles();
      const lexical = buildBM25Index(articles);
      const ranking = rankHybridCandidates(valid, lexical.search(originalQuery, 10), lexical.search(ragQuery, 10));
      const ids = ranking.baseIds;
      const selected = ids.map(id => articles.find(article => article.id === id)).filter(article => article !== undefined);
      if (!selected.length) return { ...redirect(`Não encontrei informações suficientes na base para orientar sobre esse assunto. ${referral}`),
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: ids, motivoDescarte: 'sem_artigos_apos_fusao' }) };
      const auxiliary = prepareLegalContext({ catalog: legalRulesMode === 'off' ? null : d.legalCatalog(), mode: legalRulesMode,
        citizenQuery: originalQuery, candidates: selected, articles });
      legalDiagnostics = auxiliary.diagnostics;
      // O contexto auxiliar mantém prioridade. A prévia off reaplica somente a
      // quarentena de anotações antigas, sem ativar novas regras por um resgate.
      const cleanRescues = prepareLegalContext({ catalog: null, mode: 'off', citizenQuery: originalQuery,
        candidates: ranking.strongIds.map(id => articles.find(article => article.id === id)).filter(article => article !== undefined), articles });
      const expanded = expandRetrievalContext({ ranking, current: auxiliary.articles, candidates: cleanRescues.articles,
        auxiliaryCharacters: auxiliary.instructions.length, displacedReferences: auxiliary.diagnostics.displacedArticles });
      auxiliary.articles = expanded.articles;
      selectionDiagnostics = expanded.diagnostics;
      for (const ref of cleanRescues.diagnostics.quarantinedDistinctions) {
        if (expanded.diagnostics.addedIds.some(id => articleReferences(id).includes(ref)) && !legalDiagnostics.quarantinedDistinctions.includes(ref)) legalDiagnostics.quarantinedDistinctions.push(ref);
      }
      const candidateIds = [...selected.map(a => a.id), ...expanded.diagnostics.addedIds];
      const laws = renderRetrievedArticles(auxiliary.articles);
      const allowedReferences = [...new Set(auxiliary.articles.flatMap(item => articleReferences(item.title)))];
      const responseSchema = { ...RAG_RESPONSE_SCHEMA, properties: { ...RAG_RESPONSE_SCHEMA.properties,
        artigo: { type: ['string', 'null'], enum: [...allowedReferences, null] } } };
      const raw = await d.generate(ragPrompt(`${formattedHistory}\nÚltima mensagem: ${question}`, laws + `\nREFERENCIAS_PERMITIDAS_JSON: ${JSON.stringify(allowedReferences)}`, auxiliary.instructions), responseSchema, { temperature: 0 }, generation);
      let parsed: { tipoResposta: string; texto: string; artigo?: unknown };
      try { parsed = JSON.parse(processThinkingOutput(raw).cleanText); }
      catch { return { ...technicalFailure(institution),
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, motivoDescarte: 'parse_falhou' }) }; }
      if (!['clarificacao', 'orientacao_final', 'redirecionamento'].includes(parsed.tipoResposta) || typeof parsed.texto !== 'string' || !parsed.texto.trim()) {
        return { ...technicalFailure(institution),
          diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, motivoDescarte: 'resposta_invalida' }) }; }
      const text = scrub(normalizeWhatsappFormatting(parsed.texto));
      options?.onGeneratedForEvaluation?.({ tipoResposta: parsed.tipoResposta, texto: text, artigo: sanitizeArtigoField(parsed.artigo) });
      if (charLength(text) > 900) return { ...redirect(`A orientação precisa de uma análise mais detalhada do que consigo oferecer por aqui. ${referral}`),
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, motivoDescarte: 'texto_excede_900_chars' }) };
      const article = sanitizeArtigoField(parsed.artigo);
      const safety = evaluateGeneratedSafety({ text, article, kind: parsed.tipoResposta as 'clarificacao' | 'orientacao_final' | 'redirecionamento', citizenMessages,
        sources: auxiliary.articles.flatMap(item => articleReferences(item.title).map(reference => ({ reference, content: item.content }))) });
      safetyDiagnostics = { reasons: safety.reasons, evidence: safety.evidence };
      if (!safety.passed) {
        const diag = { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, motivoDescarte: safety.reasons[0] ?? 'orientacao_nao_verificada', referenciaGerada: parsed.artigo, referenciaNormalizada: article, referenciasPermitidas: allowedReferences };
        if (safety.scopeVeto === 'private' || safety.scopeVeto === 'tax') {
          const response = getRespostaFixa(safety.scopeVeto === 'private' ? 'FORA_ESCOPO_PARTICULAR' : 'FORA_ESCOPO_TRIBUTO', institution)!;
          return { tipoResposta: 'fixa', artigo: null, ...response, diagnostics: makeDiag(classification, diag) };
        }
        if (safety.scopeVeto === 'lease') return { tipoResposta: 'fixa', artigo: null, acoes: ['menu'],
          texto: 'Para essa questão de locação de imóvel, é necessário verificar a natureza da relação e quem é o responsável. Não consegui confirmar uma base segura para orientar por aqui. Procure análise da equipe ou orientação jurídica.', diagnostics: makeDiag(classification, diag) };
        if (safety.question) return clarify(safety.question, diag);
        return { ...redirect(`Não consegui confirmar essa orientação com segurança. ${referral}`), diagnostics: makeDiag(classification, diag) };
      }
      if (parsed.tipoResposta === 'clarificacao') return clarify(text, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds });
      if (parsed.tipoResposta === 'redirecionamento') return { ...redirect(referral),
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, motivoDescarte: 'modelo_redirecionou' }) };
      return { tipoResposta: 'orientacao_final', texto: text + `\n\nBase legal: ${article}.` + DISCLAIMER, artigo: article,
        diagnostics: makeDiag(classification, { consultaBuscaUsada: ragQuery, candidatosRecuperados: candidateIds, referenciaGerada: parsed.artigo, referenciaNormalizada: article, referenciasPermitidas: allowedReferences }) };
    } catch (error) {
      if (error instanceof ExternalWorkRequired) throw error;
      console.error('Falha na consulta de orientação:', error instanceof Error ? error.name : 'erro');
      return technicalFailure(institution);
    }
  };
}

export const answerWithRAG = createRagService();

export const createOrientationService = (generate = generateText) => async (path: string, officialText: string, generation?: GenerationSettings): Promise<string> => {
  // Texto oficial com prazo não passa por reescrita livre: conserva marco e exceções.
  if (containsLegalDeadline(officialText)) return officialText;
  try {
    const output = await generate(orientationPrompt(path, officialText), undefined, undefined, generation);
    const rewritten = normalizeWhatsappFormatting(processThinkingOutput(output).cleanText.trim());
    const references = legalReferencesIn(officialText);
    // A fonte é referência de conservação, nunca prova de fatos do consumidor.
    const safety = inspectLegalSafety({ text: rewritten, article: references[0] ?? null, kind: 'orientacao_final', citizenMessages: [],
      sources: references.map(reference => ({ reference, content: officialText })) });
    if (isSafeRewrite(officialText, rewritten) && safety.passed) return rewritten + DISCLAIMER;
    console.warn('Reescrita descartada: fatos, ressalvas, formato ou tamanho divergentes.');
  } catch (error) {
    if (error instanceof ExternalWorkRequired) throw error;
    console.warn('Reescrita indisponível; enviando orientação oficial.');
  }
  // O fallback é a fonte oficial, portanto não recebe aviso de conteúdo gerado por IA.
  return officialText;
};

export const generateOrientativeResponse = createOrientationService();
