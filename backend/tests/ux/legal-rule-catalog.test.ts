import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approvedLegalRules, parseLegalRuleCatalog } from '../../src/services/llm/legalKnowledge/catalog.js';
import { articleReferences } from '../../src/services/llm/helpers/articleReference.js';

const read = (file: string) => JSON.parse(readFileSync(new URL(`../../src/database/data/${file}`, import.meta.url), 'utf8'));
const raw = () => read('legalRules.json');
const available = (read('cdcData.json') as { title: string }[]).flatMap(article => articleReferences(article.title));

test('catálogo mínimo válido: regras rastreáveis, inativas e com texto UTF-8 íntegro', () => {
  const catalog = parseLegalRuleCatalog(raw(), available);
  assert.equal(catalog.rules.length, 11);
  assert.equal(approvedLegalRules(catalog).length, 0);
  assert.ok(catalog.rules.every(rule => rule.review.status === 'technical_draft'));
  assert.equal(catalog.rules.find(rule => rule.id === 'CDC18-REPARO')!.topic, 'Reparo e suas condições');
  assert.ok(!JSON.stringify(catalog).includes('\uFFFD'));
  const cases = new Set(catalog.rules.flatMap(rule => rule.auditCases));
  for (let i = 1; i <= 20; i++) assert.ok(cases.has(`SJ-${String(i).padStart(2, '0')}`), `Cenário SJ-${i} sem vínculo para revisão`);
});

test('prazos do catálogo distinguem finalidade, natureza e marco, sem cálculo automático', () => {
  const catalog = parseLegalRuleCatalog(raw(), available);
  for (const rule of catalog.rules.filter(rule => rule.deadline?.purpose === 'complaint')) {
    const durability = rule.conditions.find(condition => condition.fact === 'durability')!.value;
    const visibility = rule.conditions.find(condition => condition.fact === 'defectVisibility')!.value;
    assert.equal(rule.deadline!.amount, durability === 'durable' ? 90 : 30);
    assert.equal(rule.deadline!.trigger, visibility === 'hidden' ? 'defect_evidence' : 'delivery_or_service_end');
    assert.ok(!rule.requirements.find(item => item.purpose === 'general_guidance')!.facts.some(fact => fact.endsWith('On')));
    assert.ok(rule.requirements.find(item => item.purpose === 'individual_deadline')!.facts.includes('obstaclesReviewed'));
    assert.equal(rule.deadline!.automaticCalculation, false);
  }
  const repair = catalog.rules.find(rule => rule.id === 'CDC18-REPARO')!.deadline!;
  assert.equal(repair.amount, 30);
  assert.deepEqual(repair.agreedVariation, { minimumDays: 7, maximumDays: 180, requiresAgreement: true, separateConsentForAdhesion: true });
  assert.equal(repair.trigger, 'requires_case_review');
  const compensation = catalog.rules.find(rule => rule.id === 'CDC27-REPARACAO-DANOS')!.deadline!;
  assert.equal(compensation.amount, 5); assert.equal(compensation.unit, 'years');
  assert.equal(compensation.trigger, 'damage_and_authorship_knowledge');
});

test('rascunho não aceita aprovação implícita; aprovação exige autor e data coerentes', () => {
  for (const change of [
    (catalog: any) => { catalog.rules[0].review.reviewedBy = 'Alguém'; },
    (catalog: any) => { catalog.rules[0].review.status = 'approved'; },
    (catalog: any) => { catalog.rules[0].review = { status: 'approved', checkedOn: '2026-11-17', reviewedBy: 'Revisor fictício', reviewedOn: '2026-11-16' }; },
  ]) { const catalog = raw(); change(catalog); assert.throws(() => parseLegalRuleCatalog(catalog, available)); }
  const catalog = raw();
  catalog.rules[0].review = { status: 'approved', checkedOn: '2026-11-17', reviewedBy: 'Revisor fictício de teste', reviewedOn: '2026-11-17' };
  assert.deepEqual(approvedLegalRules(parseLegalRuleCatalog(catalog, available)).map(rule => rule.id), ['CDC18-REPARO']);
});

test('fontes e referências não aceitam conteúdo ausente ou domínio disfarçado', () => {
  for (const change of [
    (catalog: any) => { catalog.sources[0].url = 'https://www.planalto.gov.br.example.com/lei'; },
    (catalog: any) => { catalog.rules[0].legalBasis[0].sourceId = 'FONTE-INVENTADA'; },
    (catalog: any) => { catalog.rules[0].legalBasis[0].article = 'Art. 999'; },
    (catalog: any) => { catalog.rules[0].relatedArticles.push('Art. 999'); },
    (catalog: any) => { catalog.sources[0].checkedOn = '2026-02-30'; },
  ]) { const catalog = raw(); change(catalog); assert.throws(() => parseLegalRuleCatalog(catalog, available)); }
});

test('catálogo rejeita identidade duplicada, fatos mal tipados e condições contraditórias', () => {
  for (const change of [
    (catalog: any) => { catalog.rules.push(catalog.rules[0]); },
    (catalog: any) => { catalog.sources.push(catalog.sources[0]); },
    (catalog: any) => { catalog.rules[0].conditions[0].value = 'unknown'; },
    (catalog: any) => { catalog.rules[0].conditions.push({ fact: 'issue', value: 'transfer' }); },
    (catalog: any) => { catalog.safetyPolicy.modelInferenceIsVerifiedFact = true; },
    (catalog: any) => { catalog.rules[0].enabled = true; },
  ]) { const catalog = raw(); change(catalog); assert.throws(() => parseLegalRuleCatalog(catalog, available)); }
});

test('marco exige fatos compatíveis e intervalo convencional não é aplicado a outra finalidade', () => {
  for (const change of [
    (catalog: any) => { catalog.rules[1].requirements = catalog.rules[1].requirements.filter((item: any) => item.purpose !== 'individual_deadline'); },
    (catalog: any) => { catalog.rules[1].deadline.trigger = 'defect_evidence'; },
    (catalog: any) => { catalog.rules[0].deadline.agreedVariation.minimumDays = 181; },
    (catalog: any) => { catalog.rules[0].deadline.purpose = 'complaint'; },
  ]) { const catalog = raw(); change(catalog); assert.throws(() => parseLegalRuleCatalog(catalog, available)); }
});

test('política de abstenção não inventa fundamento normativo nem prazo', () => {
  const catalog = parseLegalRuleCatalog(raw(), available);
  const policy = catalog.rules.find(rule => rule.kind === 'operational')!;
  assert.equal(policy.id, 'SEM-FUNDAMENTO-SUFICIENTE');
  assert.deepEqual(policy.legalBasis, []); assert.deepEqual(policy.relatedArticles, []);
  assert.equal(policy.deadline, null); assert.ok(policy.policyReference);
  const changed = raw();
  changed.rules.find((rule: any) => rule.kind === 'operational').legalBasis = changed.rules[0].legalBasis;
  assert.throws(() => parseLegalRuleCatalog(changed, available));
});
