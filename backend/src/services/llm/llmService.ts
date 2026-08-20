import axios from 'axios';

/**
 * Função responsável por integrar com a LLM local (Ollama)
 * Cumpre os requisitos RP03 (Separação da IA), RP05 (Local) e RF04/RF05 (Resumo e Explicação).
 */
export const generateOrientativeResponse = async (userPath: string, officialText: string): Promise<string> => {

    const ollamaUrl = 'http://host.docker.internal:11434/api/generate';

    const modelName = 'gemma3:12b';

    const prompt = `
Você é um assistente virtual de triagem do PROCON.
O cidadão procurou ajuda navegando pelas seguintes opções do menu: "${userPath}".

A RESPOSTA OFICIAL DO PROCON para este caso é a seguinte:
"""
${officialText}
"""

SUA TAREFA:
1. Inicie a mensagem com um tom empático e humanizado, confirmando em uma frase curta que você entendeu o problema dele baseado no menu que ele escolheu.
2. Logo em seguida, repasse o conteúdo da RESPOSTA OFICIAL de forma clara.
3. NÃO invente leis, prazos ou regras que não estejam na resposta oficial. 
4. Responda em Português do Brasil.
5. Utilize apenas um asterisco (*) no começo e fim do texto que for destacar, e não utilize itálico.
  `;

    const disclaimer = "\n\n*Resposta processada por inteligência artificial baseada nas diretrizes do PROCON. Possui caráter orientativo e não substitui o atendimento formal.*";

    try {
        const response = await axios.post(ollamaUrl, {
            model: modelName,
            prompt: prompt,
            stream: false
        });

    const aiText = response.data.response.trim();
    
    return aiText + disclaimer;

  } catch (error) {
    console.error('❌ Erro na API do Ollama. Usando Fallback de Segurança:', error);
    
    return officialText + disclaimer;
  }
};