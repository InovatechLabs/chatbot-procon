import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { redactIdentifiers } from '../privacy/redact.js';
import { externalWork } from '../whatsapp/externalWork.js';


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

export const generateText = async (
  prompt: string, 
  schema?: object, 
  options?: any
): Promise<string> => {
  const generateUrl = process.env.OLLAMA_GENERATE_URL;
  const generateModel = process.env.OLLAMA_GENERATE_MODEL_NAME;
  const ENABLE_THINKING = process.env.LLM_ENABLE_THINKING === 'true';

  if (!generateUrl || !generateModel) {
    throw new Error('As variáveis OLLAMA_GENERATE_URL e OLLAMA_GENERATE_MODEL_NAME devem estar definidas no .env');
  }

  const payload = {
    model: generateModel,
    prompt: redactIdentifiers(prompt),
    stream: false,
    ...(schema ? { format: schema } : {}),
    ...(options ? { options } : {}),
    think: ENABLE_THINKING
  };
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
