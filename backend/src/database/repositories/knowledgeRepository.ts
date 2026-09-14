import { prisma } from '../index.js';

export interface ArticleResult {
    id: string;
    title: string;
    content: string;
    keywords: string[];
    distincao: string | null; 
};

export const getVectorResults = async (vectorString: string, limit: number = 10) => {
  return await prisma.$queryRawUnsafe<{ id: string, distance: number }[]>(`
    SELECT title as id, (embedding <=> $1::vector) as distance 
    FROM "KnowledgeBase" 
    ORDER BY embedding <=> $1::vector 
    LIMIT $2;
  `, vectorString, limit);
};

export const getAllArticles = async (): Promise<ArticleResult[]> => {
  return await prisma.$queryRawUnsafe<ArticleResult[]>(`
    SELECT title as id, title, content, keywords, distincao 
    FROM "KnowledgeBase";
  `);
};