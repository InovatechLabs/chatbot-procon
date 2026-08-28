export declare const answerWithRAG: (userQuestion: string) => Promise<string>;
/**
 * Função responsável por integrar com a LLM local (Ollama)
 * Cumpre os requisitos RP03 (Separação da IA), RP05 (Local) e RF04/RF05 (Resumo e Explicação).
 */
export declare const generateOrientativeResponse: (userPath: string, officialText: string) => Promise<string>;
//# sourceMappingURL=llmService.d.ts.map