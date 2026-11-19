import test from 'node:test';
import assert from 'node:assert/strict';
import { canGroupText, clarificationRounds, decodeSession, initialSnapshot, persistable, transition, withChoices } from '../../src/services/conversation/state.js';

test('estados antigos são lidos e convertidos para snapshot versionado sem perder a etapa', () => {
  const legacy = ['POST_ANSWER', 'AWAIT_AGENDAR', 'SCH_STEP_CAT_SELECT', 'DOC_SELECT', 'AWAIT_RATING', 'FEEDBACK_COMMENT', 'AI_CLARIFY:1', 'AI_CLARIFY:2', ...['NAME', 'NAME_CONFIRM', 'CPF', 'DATE'].map(kind => `SCH_STEP_${kind}:GERAL`), 'SCH_STEP_SLOT:GERAL:2026-12-01', 'SCH_STEP_SLOT:GERAL:2026-12-01:2'];
  for (const raw of legacy) {
    const decoded = decodeSession({ stepState: raw, status: 'OPEN' });
    assert.equal(decoded.invalid, false, raw); assert.equal(decoded.legacy, true);
    const fields = persistable(decoded.snapshot);
    const next = decodeSession(fields);
    assert.equal(next.invalid, false, raw); assert.equal(next.legacy, false);
    assert.deepEqual(next.snapshot, decoded.snapshot);
  }
  const old = decodeSession({ stepState: null, currentStepId: 'menu', isChat: true }).snapshot;
  assert.equal(old.state.kind, 'MENU'); assert.equal(old.context.currentStepId, 'menu');
});

test('contextos malformados, versões futuras e payloads de agendamento inválidos são recuperáveis', () => {
  for (const stepState of ['SCH_STEP_NAME:INEXISTENTE', 'SCH_STEP_SLOT:GERAL:2026-02-30:0', 'SCH_STEP_SLOT:GERAL:2026-12-01:-1', 'SCH_STEP_DATE:', 'AI_CLARIFY:999', '{malformado', JSON.stringify({ ...initialSnapshot(), version: 2 }), JSON.stringify({ ...initialSnapshot(), personalData: 'não permitido' })]) {
    assert.equal(decodeSession({ stepState }).invalid, true, stepState);
  }
  assert.equal(decodeSession({ stepState: JSON.stringify({ ...initialSnapshot(), state: { kind: 'FREE_CHAT', clarifications: 1 } }) }).invalid, true);
});

test('transições rejeitam pular coleta, trocar categoria/data e reabrir sessão encerrada', () => {
  let flow = transition(initialSnapshot(), { kind: 'SCHEDULE_CATEGORY' });
  assert.throws(() => transition(flow, { kind: 'SCHEDULE_CPF', category: 'GERAL' }));
  flow = transition(flow, { kind: 'SCHEDULE_NAME', category: 'GERAL' });
  assert.throws(() => transition(flow, { kind: 'SCHEDULE_SLOT', category: 'GERAL', date: '2026-12-01', page: 0 }));
  assert.throws(() => transition(flow, { kind: 'SCHEDULE_NAME_CONFIRM', category: 'GARANTIA_VICIO' }));
  flow = transition(flow, { kind: 'SCHEDULE_NAME_CONFIRM', category: 'GERAL' });
  flow = transition(flow, { kind: 'SCHEDULE_CPF', category: 'GERAL' });
  flow = transition(flow, { kind: 'SCHEDULE_DATE', category: 'GERAL' });
  flow = transition(flow, { kind: 'SCHEDULE_SLOT', category: 'GERAL', date: '2026-12-01', page: 0 });
  assert.throws(() => transition(flow, { kind: 'SCHEDULE_SLOT', category: 'GERAL', date: '2026-12-02', page: 0 }));
  const finished = transition(flow, { kind: 'FINISHED' });
  assert.equal(persistable(finished).status, 'RESOLVED');
  assert.throws(() => transition(finished, { kind: 'MENU' }));
});

test('opções e contagem de clarificação sobrevivem à serialização; coleta não agrupa mensagens', () => {
  let flow = transition(initialSnapshot(), { kind: 'FREE_CHAT', clarifications: 2 });
  flow = withChoices(flow, [{ id: 'btn_go_menu', text: 'Menu principal' }]);
  const restored = decodeSession(persistable(flow)).snapshot;
  assert.equal(clarificationRounds(restored.state), 2); assert.deepEqual(restored.choices, flow.choices);
  assert.equal(canGroupText(restored.state), true);
  for (const legacy of ['SCH_STEP_NAME:GERAL', 'SCH_STEP_DATE:GERAL', 'AWAIT_RATING', 'FEEDBACK_COMMENT']) assert.equal(canGroupText(decodeSession({ stepState: legacy }).snapshot.state), false);
});
