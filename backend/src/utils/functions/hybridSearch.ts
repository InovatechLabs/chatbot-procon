/**
 * Combina o resultado da busca vetorial (bge-m3) com o resultado do BM25
 * usando Reciprocal Rank Fusion (RRF) — não precisa normalizar escalas de
 * score diferentes, só usa a posição de cada item em cada ranking.
 */

interface RankedItem {
  id: string; // ex: "Art. 35"
}

const RRF_K = 60; // constante padrão da literatura, raramente precisa mudar

const reciprocalRankFusion = (
  rankings: RankedItem[][], // uma lista de rankings, ex: [resultadoVetorial, resultadoBM25]
  topK = 4
): string[] => {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    ranking.forEach((item, index) => {
      const posicao = index + 1; // rank começa em 1, não em 0
      const contribuicao = 1 / (RRF_K + posicao);
      scores.set(item.id, (scores.get(item.id) ?? 0) + contribuicao);
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id]) => id);
};

// --- Uso no seu fluxo atual ---
//
// async function buscarLeisParaCaso(query: string) {
//   const resultadoVetorial = await buscaVetorialExistente(query, 8); // aumente um pouco o k aqui
//   const resultadoBM25 = bm25Index.search(query, 8);
//
//   const idsFinais = reciprocalRankFusion([resultadoVetorial, resultadoBM25], 4);
//
//   // idsFinais já vem na ordem de relevância combinada — use pra montar o
//   // `combinedLaws` que hoje vai pro prompt do LLM.
//   return idsFinais.map(id => articlesById.get(id));
// }

export { reciprocalRankFusion };
