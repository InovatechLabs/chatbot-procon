import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { redactIdentifiers } from '../privacy/redact.js';
import { externalWork } from '../whatsapp/externalWork.js';
import { defaultGeneration, type GenerationSettings } from './settings.js';
import { processThinkingOutput } from '../llm/helpers/processThinkingOutput.js';


const envPath = process.env.DOTENV_CONFIG_PATH || path.resolve(import.meta.dirname, '../../../.env');
const envResult = dotenv.config({ path: envPath });

if (envResult.error && !process.env.DOTENV_CONFIG_PATH) {
  console.warn(`⚠️ Aviso: Arquivo .env não encontrado no caminho: ${envPath}`);
}

export const getEmbedding = async (text: string): Promise<number[]> => {

  const embedUrl = process.env.OLLAMA_EMBED_URL;
  const embedModel = process.env.OLLAMA_EMBEDDING_MODEL_NAME;

  if (!embedUrl || !embedModel) {
    throw new Error('As variáveis OLLAMA_EMBED_URL e OLLAMA_EMBEDDING_MODEL_NAME devem estar definidas no .env');
  }

  const payload = {
    model: embedModel,
    prompt: redactIdentifiers(text)
  };
  return externalWork(['embedding', embedUrl, payload], async () => {
    const response = await axios.post(embedUrl, payload, { timeout: 30_000 });
    return response.data.embedding;
  });
};

const generationPayload = (generation: GenerationSettings, prompt: string, schema?: object, options?: object) => ({
    model: generation.model,
    prompt: redactIdentifiers(prompt),
    stream: false,
    ...(schema ? { format: schema } : {}),
    ...(options ? { options } : {}),
    think: generation.thinkingEnabled,
});

export const generateText = async (
  prompt: string,
  schema?: object,
  options?: object,
  generation = defaultGeneration(),
): Promise<string> => {
  const generateUrl = process.env.OLLAMA_GENERATE_URL;
  if (!generateUrl || !generation.model) throw new Error('Configure o endpoint e o modelo de geração do Ollama.');
  const payload = generationPayload(generation, prompt, schema, options);
  return externalWork(['generation', generateUrl, payload], async () => {
    const response = await axios.post(generateUrl, payload, { timeout: 120_000 });

    let output = response.data.response as string;

    if (!schema) {
      output = output
        .trim()
        .replace(/\*?\s*(resposta )?processad[ao] por (uma )?intelig[êe]ncia artificial.*?(formal\.?)?\*?/gi, '')
        .trim();
    }

    return output.trim();
  });
};

export async function checkGeneration(generation: GenerationSettings) {
  const url = process.env.OLLAMA_GENERATE_URL;
  if (!url) return 'O endpoint de geração do Ollama precisa ser configurado no servidor.';
  const schema = {
    type: 'object',
    properties: { resultado: { type: 'integer' } },
    required: ['resultado'],
    additionalProperties: false,
  };
  const payload = generationPayload(generation, 'Quanto é 7 mais 5? Responda somente com um objeto JSON contendo o campo inteiro resultado.', schema, { temperature: 0, num_predict: 1024 });
  let data: { response?: unknown; thinking?: unknown };
  try {
    ({ data } = await axios.post(url, payload, { timeout: 60_000 }));
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 404) return 'O Ollama não encontrou esse modelo. Confira o nome e a versão no servidor.';
    if (status === 400 || status === 422) return 'O Ollama rejeitou a configuração. Confira se o modelo aceita o thinking mode escolhido e respostas estruturadas.';
    return 'Não foi possível testar a geração. Verifique se o servidor Ollama está acessível e tente novamente.';
  }
  if (typeof data?.response !== 'string') return 'O Ollama não retornou uma resposta de geração válida.';
  const { cleanText, thinking } = processThinkingOutput(data.response);
  const returnedThinking = Boolean(thinking || (typeof data.thinking === 'string' && data.thinking.trim()));
  if (returnedThinking !== generation.thinkingEnabled) return 'O modelo não demonstrou o thinking mode selecionado no teste.';
  try {
    if (Number.isInteger(JSON.parse(cleanText)?.resultado)) return null;
  } catch { /* Geração sem o JSON exigido pela classificação e pelo RAG. */ }
  return 'O modelo não retornou o JSON estruturado necessário para o chatbot.';
}
