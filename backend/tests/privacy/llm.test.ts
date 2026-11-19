import test from 'node:test';
import assert from 'node:assert/strict';
import { createRagService } from '../../src/services/llm/llmService.js';
import { redactIdentifiers } from '../../src/services/privacy/redact.js';

test('RAG não envia identificadores conhecidos ao classificador, embedding ou gerador', async () => {
  const name = 'Pessoa Fictícia'; const phone = '5512999999999'; const cpf = '52998224725';
  const privateReport = `Sou ${name}, CPF ${cpf}, telefone ${phone}, email teste@example.com. A loja cobrou após cancelar.`;
  const check = (text: string) => { for (const item of [name, phone, cpf, 'teste@example.com']) assert.ok(!text.includes(item)); };
  const stages: string[] = [];
  const answer = createRagService({
    db: { userSession: { findUnique: async () => ({ userName: name, phoneNumber: phone, userCpf: cpf }) }, chatLog: { findMany: async () => [{ id: 'report', direction: 'INBOUND', stepId: null, messageText: privateReport }] } } as any,
    classify: async (question, history) => { stages.push('classify'); check(question); check(history); return { categoria: 'CONSUMO', motivo: 'Cobrança', consultaBusca: `Cobrança de ${name} ${cpf}` }; },
    embed: async text => { stages.push('embed'); check(text); return [0.1]; },
    vectors: async () => [{ id: 'art42', distance: 0.1 }],
    articles: async () => [{ id: 'art42', title: 'Art. 42 - Cobrança', content: 'O consumidor pode contestar a cobrança.', keywords: ['cobrança'], distincao: null }],
    generate: async prompt => { stages.push('generate'); check(prompt); return JSON.stringify({ tipoResposta: 'orientacao_final', texto: 'Guarde os comprovantes e conteste a cobrança.', artigo: 'Art. 42' }); },
  });
  assert.equal((await answer(privateReport, 'session')).tipoResposta, 'orientacao_final');
  assert.deepEqual(stages, ['classify', 'embed', 'generate']);
});

test('relato de cadastro negativo chega íntegro à classificação, busca e geração', async () => {
  const report = 'Uma empresa colocou meu nome em um cadastro negativo com informação errada e não me permite acessar os dados.';
  const stages: string[] = [];
  const check = (text: string) => { assert.ok(text.includes(report)); assert.equal(redactIdentifiers(text), text); };
  const answer = createRagService({
    db: { userSession: { findUnique: async () => null }, chatLog: { findMany: async () => [] } } as any,
    classify: async question => { stages.push('classify'); check(question); return { categoria: 'CONSUMO', motivo: 'Cadastro negativo', consultaBusca: question }; },
    embed: async text => { stages.push('embed'); check(text); return [0.1]; },
    vectors: async () => [{ id: 'art43', distance: 0.1 }],
    articles: async () => [{ id: 'art43', title: 'Art. 43 - Cadastros de consumidores', content: 'O consumidor pode acessar os dados arquivados sobre ele e solicitar correção.', keywords: ['cadastro'], distincao: null }],
    generate: async prompt => { stages.push('generate'); check(prompt); return JSON.stringify({ tipoResposta: 'orientacao_final', texto: 'Solicite acesso aos dados e correção da informação inexata.', artigo: 'Art. 43' }); },
  });
  const result = await answer(report, 'fixture');
  assert.equal(result.tipoResposta, 'orientacao_final');
  assert.equal(result.artigo, 'Art. 43');
  assert.deepEqual(stages, ['classify', 'embed', 'generate']);
});
