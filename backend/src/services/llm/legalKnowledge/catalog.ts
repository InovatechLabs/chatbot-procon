import { z } from 'zod';

const text = z.string().trim().min(1);
const reference = z.string().regex(/^Art\. [1-9]\d*(?:-[A-Z])?$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Data civil inválida.');
const fact = z.enum(['issue', 'defectVisibility', 'durability', 'collectionReported', 'paymentExcess',
  'deliveredOn', 'defectEvidentOn', 'damageKnownOn', 'authorKnownOn', 'obstaclesReviewed',
  'agreementReviewed', 'repairExceptionsReviewed', 'justifiableErrorReviewed', 'sourceSupport']);

// Conjunções pequenas de fatos conhecidos; não é uma linguagem geral de regras.
// Unknown não é um valor que possa satisfazer uma condição.
const condition = z.discriminatedUnion('fact', [
  z.object({ fact: z.literal('issue'), value: z.enum(['product_defect', 'service_quality', 'damage_event', 'collection', 'transfer', 'insufficient_basis']) }).strict(),
  z.object({ fact: z.literal('defectVisibility'), value: z.enum(['apparent', 'hidden']) }).strict(),
  z.object({ fact: z.literal('durability'), value: z.enum(['durable', 'non_durable']) }).strict(),
  z.object({ fact: z.literal('collectionReported'), value: z.boolean() }).strict(),
  z.object({ fact: z.literal('paymentExcess'), value: z.boolean() }).strict(),
  z.object({ fact: z.literal('sourceSupport'), value: z.boolean() }).strict(),
]);
const unique = (items: readonly string[]) => new Set(items).size === items.length;
const references = z.array(reference).refine(unique, 'Referências duplicadas.');
const review = z.discriminatedUnion('status', [
  z.object({ status: z.literal('technical_draft'), checkedOn: date, reviewedBy: z.null(), reviewedOn: z.null() }).strict(),
  z.object({ status: z.literal('approved'), checkedOn: date, reviewedBy: text, reviewedOn: date }).strict(),
]);

export const legalRuleSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_-]+$/),
  version: z.number().int().positive(),
  topic: text.max(120),
  retrieval: z.object({
    group: z.enum(['repair', 'complaint', 'compensation', 'product', 'service', 'collection', 'transfer', 'abstention']),
    terms: z.array(text.max(80)).max(12).refine(unique, 'Termos de recuperação duplicados.'),
  }).strict(),
  kind: z.enum(['legal', 'operational']),
  policyReference: z.literal('docs/auditoria-seguranca-juridica.md').nullable(),
  relatedArticles: references,
  legalBasis: z.array(z.object({ article: reference, provision: text.max(120), sourceId: text }).strict()),
  review,
  conditions: z.array(condition).min(1).max(6).refine(items => unique(items.map(item => item.fact)), 'Condições repetidas para o mesmo fato.'),
  requirements: z.array(z.object({
    purpose: z.enum(['general_guidance', 'individual_deadline', 'individual_restitution']),
    facts: z.array(fact).min(1).refine(unique, 'Fatos obrigatórios duplicados.'),
  }).strict()).min(1).refine(items => unique(items.map(item => item.purpose)), 'Finalidade repetida.'),
  deadline: z.object({
    purpose: z.enum(['repair', 'complaint', 'compensation']), amount: z.number().int().positive().max(365_000),
    unit: z.enum(['days', 'years']),
    trigger: z.enum(['delivery_or_service_end', 'defect_evidence', 'damage_and_authorship_knowledge', 'requires_case_review']),
    agreedVariation: z.object({
      minimumDays: z.number().int().positive(), maximumDays: z.number().int().positive(),
      requiresAgreement: z.literal(true), separateConsentForAdhesion: z.literal(true),
    }).strict().refine(value => value.minimumDays <= value.maximumDays, 'Intervalo inválido.').nullable(),
    automaticCalculation: z.literal(false),
  }).strict().nullable(),
  modelNotes: z.object({
    distinction: text.max(420),
    mustPreserve: z.array(text.max(220)).min(1).max(5),
    mustNotClaim: z.array(text.max(220)).min(1).max(5),
  }).strict(),
  onMissingFacts: z.literal('clarify_or_redirect'),
  onConflict: z.literal('redirect'),
  examples: z.object({ applies: text.max(300), insufficient: text.max(300) }).strict(),
  auditCases: z.array(z.string().regex(/^SJ-\d{2}$/)).min(1).refine(unique, 'Cenários duplicados.'),
}).strict().superRefine((rule, ctx) => {
  if (rule.kind === 'legal' && (!rule.relatedArticles.length || !rule.legalBasis.length || rule.policyReference !== null)) {
    ctx.addIssue({ code: 'custom', path: ['legalBasis'], message: 'Regra legal exige artigos e fonte normativa, sem substituir a fonte por política.' });
  }
  if (rule.kind === 'operational' && (rule.legalBasis.length || rule.relatedArticles.length || rule.policyReference === null || rule.deadline !== null)) {
    ctx.addIssue({ code: 'custom', path: ['policyReference'], message: 'Política operacional exige referência interna, sem inventar fundamento ou prazo legal.' });
  }
  for (const [i, basis] of rule.legalBasis.entries()) {
    if (!rule.relatedArticles.includes(basis.article)) ctx.addIssue({ code: 'custom', path: ['legalBasis', i, 'article'], message: 'Fundamento fora dos artigos relacionados.' });
  }
  if (rule.deadline && !rule.requirements.some(item => item.purpose === 'individual_deadline')) {
    ctx.addIssue({ code: 'custom', path: ['requirements'], message: 'Prazo precisa declarar os fatos necessários à análise individual.' });
  }
  if (rule.deadline?.agreedVariation && rule.deadline.purpose !== 'repair') {
    ctx.addIssue({ code: 'custom', path: ['deadline', 'agreedVariation'], message: 'Variação convencionada deste catálogo é restrita ao reparo.' });
  }
  const triggerFacts: Record<string, string[]> = {
    delivery_or_service_end: ['deliveredOn'], defect_evidence: ['defectEvidentOn'],
    damage_and_authorship_knowledge: ['damageKnownOn', 'authorKnownOn'], requires_case_review: ['agreementReviewed'],
  };
  if (rule.deadline) {
    const required = rule.requirements.find(item => item.purpose === 'individual_deadline')?.facts ?? [];
    for (const needed of triggerFacts[rule.deadline.trigger] ?? []) {
      if (!required.some(item => item === needed)) ctx.addIssue({ code: 'custom', path: ['requirements'], message: `Fato necessário ao marco ausente: ${needed}.` });
    }
  }
  if (rule.review.status === 'approved' && rule.review.reviewedOn < rule.review.checkedOn) {
    ctx.addIssue({ code: 'custom', path: ['review'], message: 'A aprovação não pode anteceder a conferência da versão.' });
  }
});

export const legalRuleCatalogSchema = z.object({
  schemaVersion: z.literal(2), version: z.number().int().positive(),
  sources: z.array(z.object({
    id: text, title: text, access: z.enum(['search_excerpt', 'full_text']), url: z.url().refine(value => {
      const url = new URL(value);
      return url.protocol === 'https:' && ['www.planalto.gov.br', 'www2.camara.leg.br'].includes(url.hostname);
    }, 'Use uma fonte oficial HTTPS do catálogo.'), checkedOn: date,
  }).strict()).min(1),
  safetyPolicy: z.object({
    surfaces: z.tuple([z.literal('orientacao_final'), z.literal('clarificacao'), z.literal('redirecionamento'), z.literal('menu_rewrite')]),
    acceptedCitizenFactOrigins: z.tuple([z.literal('citizen_message'), z.literal('explicit_confirmation')]),
    supportOrigin: z.literal('retrieved_legal_text'),
    assistantTextIsEvidence: z.literal(false), modelInferenceIsVerifiedFact: z.literal(false),
    unknownSatisfiesCondition: z.literal(false), automaticDeadlineCalculation: z.literal(false),
    missingSupport: z.literal('clarify_or_redirect'),
  }).strict(),
  rules: z.array(legalRuleSchema).min(1),
}).strict().superRefine((catalog, ctx) => {
  if (!unique(catalog.sources.map(source => source.id))) ctx.addIssue({ code: 'custom', path: ['sources'], message: 'Fonte duplicada.' });
  if (!unique(catalog.rules.map(rule => rule.id))) ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Regra duplicada.' });
  const ids = new Set(catalog.sources.map(source => source.id));
  for (const [i, rule] of catalog.rules.entries()) for (const [j, basis] of rule.legalBasis.entries()) {
    if (!ids.has(basis.sourceId)) ctx.addIssue({ code: 'custom', path: ['rules', i, 'legalBasis', j, 'sourceId'], message: 'Fonte não cadastrada.' });
  }
});

export type LegalRuleCatalog = z.infer<typeof legalRuleCatalogSchema>;
export type LegalRule = z.infer<typeof legalRuleSchema>;

/** Valida dados, sem carregar arquivos, consultar banco ou selecionar regra para casos. */
export function parseLegalRuleCatalog(input: unknown, knownArticles: readonly string[]): LegalRuleCatalog {
  const catalog = legalRuleCatalogSchema.parse(input);
  const available = new Set(knownArticles);
  for (const rule of catalog.rules) for (const article of rule.relatedArticles) {
    if (!available.has(article)) throw new Error(`Regra ${rule.id}: conteúdo legal ausente para ${article}.`);
  }
  return catalog;
}

/** Rascunhos podem ser inspecionados, mas não se tornam ativos por carregamento. */
export function approvedLegalRules(catalog: LegalRuleCatalog): LegalRule[] {
  return catalog.rules.filter(rule => rule.review.status === 'approved');
}
