export interface ProcessedLlmResponse {
  thinking: string | null;
  cleanText: string;
}

/**
 * Processa a saída da LLM removendo blocos <think>...</think>
 * e preparando a string para o JSON.parse().
 */
export function processThinkingOutput(rawOutput: string): ProcessedLlmResponse {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  const matches = [...rawOutput.matchAll(thinkRegex)];

  const thinkingBlocks = matches
    .map((m) => m[1]?.trim())
    .filter((content): content is string => Boolean(content));

  const thinking = thinkingBlocks.length > 0 ? thinkingBlocks.join('\n\n') : null;

  let cleanText = rawOutput.replace(thinkRegex, '').trim();

  // Limpa blocos de código Markdown caso a LLM formate como ```json ... ```
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  }

  return { thinking, cleanText };
}