import { readFile, writeFile } from 'node:fs/promises';
import { classifyReport } from '../../src/services/llm/helpers/classifyReport.js';
import type { Categoria } from '../../src/services/llm/helpers/classifyReport.js';

// Avaliação explícita contra o Ollama configurado. Não usa banco nem WhatsApp.
const cases = JSON.parse(await readFile(new URL('./classifier-cases.json', import.meta.url), 'utf8')) as { mensagem: string; categoria_esperada: Categoria }[];
const results = [];
for (const item of cases) {
  const predicted = await classifyReport(item.mensagem, '');
  results.push({ ...item, categoria_obtida: predicted.categoria, correto: predicted.categoria === item.categoria_esperada });
}
await writeFile(new URL('./classifier-results.json', import.meta.url), JSON.stringify(results, null, 2));
const correct = results.filter(item => item.correto).length;
console.log(`Classificador: ${correct}/${results.length} casos corretos.`);
if (correct !== results.length) process.exitCode = 1;
