
import axios from 'axios';
import { prisma } from '../../src/database/index.js';
import fs from 'fs';
import path from 'path';

const dir = import.meta.dirname;

const jsonPath = path.join(dir, '../../src/database/data/cdcData.json');
const cdcData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

// Função que chama o Ollama para transformar o texto em números
async function getEmbedding(text: string): Promise<number[]> {
  const ollamaUrl = 'https://certificates-europe-toronto-items.trycloudflare.com/api/embeddings'; 
  
  const response = await axios.post(ollamaUrl, {
    model: 'bge-m3:latest',
    prompt: text
  });
  
  return response.data.embedding;
}

async function main() {
  console.log('Iniciando vetorização da Base de Conhecimento do CDC...');

  // Limpa a tabela antes de popular 
  await prisma.$executeRaw`TRUNCATE TABLE "KnowledgeBase" RESTART IDENTITY;`;

  for (const item of cdcData) {
    console.log(`Gerando vetor para: ${item.title}`);
    
    // 1. Gera os vetores no Ollama
    const embedding = await getEmbedding(item.content);
    
    // 2. Formata para o padrão exigido pelo pgvector'
    const vectorString = `[${embedding.join(',')}]`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "KnowledgeBase" (id, title, content, keywords, distincao, embedding) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector)`,
      item.title,
      item.content,
      item.keywords || [],
      item.distincao || null,
      vectorString         
    );

    console.log(`Salvo: ${item.title}`);
  }

  console.log('Base de Conhecimento populada com sucesso!');
}

main()
  .catch(e => { 
    console.error('Erro no seed:', e); 
    process.exit(1); 
  })
  .finally(async () => { 
    await prisma.$disconnect(); 
  });