import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';


const envPath = path.resolve(import.meta.dirname, '../../../.env');
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.warn(`⚠️ Aviso: Arquivo .env não encontrado no caminho: ${envPath}`);
}

export const getEmbedding = async (text: string): Promise<number[]> => {

  const embedUrl = process.env.OLLAMA_EMBED_URL;
  const embedModel = process.env.OLLAMA_EMBEDDING_MODEL_NAME;

  if (!embedUrl || !embedModel) {
    throw new Error('As variáveis OLLAMA_EMBED_URL e OLLAMA_EMBEDDING_MODEL_NAME devem estar definidas no .env');
  }

  const response = await axios.post(embedUrl, {
    model: embedModel,
    prompt: text
  });
  return response.data.embedding;
};

export const generateText = async (prompt: string): Promise<string> => {
  const generateUrl = process.env.OLLAMA_GENERATE_URL;
  const generateModel = process.env.OLLAMA_GENERATE_MODEL_NAME;

  if (!generateUrl || !generateModel) {
    throw new Error('As variáveis OLLAMA_GENERATE_URL e OLLAMA_GENERATE_MODEL_NAME devem estar definidas no .env');
  }

  const response = await axios.post(generateUrl, {
    model: generateModel,
    prompt: prompt,
    stream: false
  });
  
  return response.data.response
    .trim()
    .replace(/\*?\s*(resposta )?processad[ao] por (uma )?intelig[êe]ncia artificial.*?(formal\.?)?\*?/gi, '')
    .trim();
};