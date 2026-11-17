import test from 'node:test';
import assert from 'node:assert/strict';
import { createRagService } from '../../src/services/llm/llmService.js';

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
