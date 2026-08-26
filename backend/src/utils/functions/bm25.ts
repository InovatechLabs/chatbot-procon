/**
 * BM25 simples, em memória, para rodar sobre o campo `keywords` de cada artigo.
 * Não depende de banco nem de biblioteca externa. Pensado para datasets pequenos
 * (dezenas a poucas centenas de documentos) — recalcula tudo a cada chamada,
 * o que é totalmente aceitável nessa escala.
 */

interface Article {
  id: string; // ex: "Art. 35"
  title: string;
  content: string;
  keywords: string[]; // frases, cada uma pode ter várias palavras
}

interface BM25Result {
  id: string;
  score: number;
}

// --- Tokenização: minúsculas, remove acentos e pontuação ---
const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/g, ' ');

const tokenize = (text: string): string[] =>
  normalize(text)
    .split(/\s+/)
    .filter(Boolean);

// --- BM25 clássico ---
// k1 controla saturação de termo repetido, b controla penalização por documento longo.
// Valores 1.5 e 0.75 são os padrões de livro-texto, funcionam bem na maioria dos casos.
const K1 = 1.5;
const B = 0.75;

export const buildBM25Index = (articles: Article[]) => {
  // Cada "documento" pro BM25 é a concatenação das keywords daquele artigo.
  const docs = articles.map(a => {
    const fullText = `${a.title} ${a.content} ${(a.keywords || []).join(' ')}`;
    return tokenize(fullText);
  });
  const docLengths = docs.map(d => d.length);
  const avgDocLength = docLengths.reduce((s, l) => s + l, 0) / docLengths.length;

  // Document frequency: em quantos documentos cada termo aparece (para IDF)
  const df = new Map<string, number>();
  docs.forEach(doc => {
    const uniqueTerms = new Set(doc);
    uniqueTerms.forEach(term => df.set(term, (df.get(term) ?? 0) + 1));
  });

  const N = docs.length;
  const idf = (term: string): number => {
    const n = df.get(term) ?? 0;
    // fórmula BM25 com suavização (evita log de zero / negativo)
    return Math.log((N - n + 0.5) / (n + 0.5) + 1);
  };

  const search = (query: string, topK = 8): BM25Result[] => {
    const queryTerms = tokenize(query);
    const scores = articles.map((article, idx) => {
      const doc = docs[idx];
      const docLen = docLengths[idx];

      if (!doc || docLen === undefined) {
        return { id: article.id, score: 0 };
      }

      const termFreq = new Map<string, number>();
      doc.forEach(t => termFreq.set(t, (termFreq.get(t) ?? 0) + 1));

      let score = 0;
      for (const term of queryTerms) {
        const tf = termFreq.get(term) ?? 0;
        if (tf === 0) continue;
        const numerator = tf * (K1 + 1);
        const denominator = tf + K1 * (1 - B + B * (docLen / avgDocLength));
        score += idf(term) * (numerator / denominator);
      }
      return { id: article.id, score };
    });

    return scores
      .filter(s => s.score > 0) // só retorna quem teve algum termo batendo
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  };

  return { search };
};
