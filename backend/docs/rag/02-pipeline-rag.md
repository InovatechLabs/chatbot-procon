# Pipeline RAG: Classificação, Recuperação e Orquestração

Arquivos: `classifyReport.ts`, `llmService.ts`, `knowledgeRepository.ts`, `bm25.ts`,
`hybridSearch.ts`.

Este é o núcleo do sistema. O pipeline segue três estágios: **classificar** → **recuperar** →
**gerar**.

## Estágio 1 — Classificação do relato (`classifyReport.ts`)

Antes de qualquer busca de artigos, cada relato passa por um classificador jurídico que decide se
o caso é, de fato, uma relação de consumo — evitando que o RAG tente encaixar à força um problema
que não é da alçada do PROCON.

```ts
type Categoria =
  | 'CONSUMO'
  | 'FORA_ESCOPO_PARTICULAR'
  | 'FORA_ESCOPO_TRIBUTO'
  | 'FORA_ESCOPO_ILICITO'
  | 'AMBIGUO';
```

O classificador chama o modelo via Ollama com `format: 'json'` e `temperature: 0.1` (baixa
variabilidade, já que é uma tarefa de decisão categórica) e espera de volta:

```json
{ "categoria": "NOME_DA_CATEGORIA", "motivo": "explicação breve" }
```

Regras centrais do prompt (ver `03-prompts.md` para o texto completo):

- **Regra anti-assunção**: o modelo é proibido de presumir que "comprei"/"contratei" implica
  automaticamente uma empresa como fornecedora — sem pistas do que foi negociado e de quem é o
  fornecedor, a classificação correta é `AMBIGUO`, não `CONSUMO`.
- Dúvidas teóricas sobre leis/direitos do consumidor **são** consideradas `CONSUMO`, mesmo sem um
  caso concreto.
- Categorias fora de escopo cobrem: negócio pontual entre particulares, cobrança de
  tributo/multa por órgão público, e objeto de contrato ilícito (testado pela pergunta "se
  entregue perfeitamente, seria crime?").

Se o parsing do JSON retornado pelo modelo falhar, o sistema **não quebra**: aplica um fallback
seguro, classificando como `AMBIGUO` e logando o erro — o pior caso é o cidadão receber uma
pergunta de clarificação a mais, nunca uma resposta jurídica incorreta por falha de parsing.

## Estágio 2 — Orquestração RAG (`llmService.ts` → `answerWithRAG`)

Função central do módulo. Recebe a pergunta atual e o `sessionId`, e devolve o texto final a ser
enviado ao cidadão. Passo a passo:

### 2.1 Montagem do histórico

Busca os últimos 6 registros de `ChatLog` da sessão (`orderBy: timestamp desc`, depois revertido
para ordem cronológica) e formata como texto rotulado (`Cidadão:` / `Atendente Virtual:`). Isso dá
contexto multi-turno tanto para a classificação quanto para a geração da resposta.

### 2.2 Classificação e desvio para fora de escopo

```ts
const classification = await classifyReport(userQuestion, formattedHistory);
if (classification.categoria !== 'CONSUMO' && classification.categoria !== 'AMBIGUO') {
  return RESPOSTAS_FORA_ESCOPO[classification.categoria] + DISCLAIMER;
}
```

Categorias fora de escopo (particular, tributo, ilícito) têm respostas **fixas e pré-escritas**
(`RESPOSTAS_FORA_ESCOPO`) — não passam pelo LLM de geração, o que garante consistência e evita
qualquer risco do modelo "inventar" uma orientação para algo que não é da competência do PROCON.

### 2.3 Construção da query de busca

```ts
const userPreviousMessages = chronologicalHistory.filter(log => log.direction === 'INBOUND').map(...);
const allUserStatements = [...new Set([...userPreviousMessages, userQuestion])];
const ragQuery = allUserStatements.join('. ');
```

A query de busca não usa apenas a última mensagem — ela concatena **todas as mensagens do cidadão
na conversa** (deduplicadas), garantindo que informações dadas em turnos anteriores (ex.: "comprei
numa loja de eletrônicos online") continuem contribuindo para a recuperação mesmo que a mensagem
mais recente seja curta.

### 2.4 Busca vetorial + corte por distância

```ts
const embedding = await getEmbedding(ragQuery);          // bge-m3 via Ollama
const vectorResults = await getVectorResults(`[${embedding.join(',')}]`);
const bestVectorMatch = vectorResults[0];

if (!bestVectorMatch || bestVectorMatch.distance > MAX_VECTOR_DISTANCE) { // 0.58
  return "...recomendo a análise humana. Gostaria de agendar...? [AGENDAR]" + DISCLAIMER;
}
```

`MAX_VECTOR_DISTANCE = 0.58` funciona como um **circuit breaker semântico**: se nem o melhor
resultado vetorial estiver próximo o suficiente do relato, o sistema não tenta forçar uma resposta
com leis pouco relacionadas — aborta o RAG e oferece agendamento presencial via a tag
`[AGENDAR]`.

### 2.5 Busca híbrida (vetorial + BM25 + Reciprocal Rank Fusion)

```ts
const validVectorResults = vectorResults.filter(res => res.distance <= MAX_VECTOR_DISTANCE);
const allArticles = await getAllArticles();
const bm25Index = buildBM25Index(allArticles);
const bm25Results = bm25Index.search(ragQuery, 10);
const top4Ids = reciprocalRankFusion([validVectorResults, bm25Results], 4);
```

O sistema não confia apenas em similaridade semântica de embeddings: combina com uma busca léxica
clássica (**BM25**) rodando sobre um campo `keywords` dedicado por artigo (populado com termos
coloquiais que cidadãos usam no dia a dia, mitigando o problema de "miopia semântica" entre
linguagem informal do cidadão e o texto formal da lei — ver `/areas/procon-chatbot.md` no
histórico do projeto). Os dois rankings (`validVectorResults` e `bm25Results`) são então
fundidos por **Reciprocal Rank Fusion (RRF)**, retornando os 4 artigos (`top4Ids`) com melhor
pontuação combinada.

#### `bm25.ts` — índice BM25 em memória

Implementação própria, sem dependência de banco ou biblioteca externa — recalculada a cada
chamada de `buildBM25Index`, escolha aceitável dado o tamanho pequeno da base (dezenas de
artigos).

**Tokenização** (`normalize` + `tokenize`): converte para minúsculas, remove acentos
(`normalize('NFD')` + strip de diacríticos) e substitui pontuação por espaço, antes de separar em
tokens por espaço em branco. Isso faz com que, por exemplo, "não" e "nao", ou "às vezes" e "as
vezes", sejam tratados como o mesmo termo — importante para um público que digita informalmente
pelo WhatsApp.

**Composição do "documento" de cada artigo**: para fins do índice, cada artigo é a concatenação de
`title + content + keywords.join(' ')` — ou seja, o BM25 não busca só nas palavras-chave
coloquiais, mas também no título e no texto formal do artigo. Isso significa que mesmo sem uma
entrada específica em `keywords`, um termo jurídico que já aparece no `content` (ex.: "vício do
produto") continua recuperável via BM25.

**Fórmula (BM25 clássico, com constantes padrão de livro-texto)**:

```
score(q, d) = Σ  IDF(termo) · [ tf(termo, d) · (k1 + 1) ] / [ tf(termo, d) + k1 · (1 - b + b · |d| / avgdl) ]
IDF(termo)  = ln( (N - n + 0.5) / (n + 0.5) + 1 )
```

- `k1 = 1.5` — controla a saturação de termos repetidos (um termo que aparece 10x não vale 10x
  mais que um que aparece 1x; o ganho marginal diminui).
- `b = 0.75` — controla a penalização por documento longo (artigos com texto mais extenso não são
  favorecidos só por terem mais chance estatística de conter o termo da busca).
- `N` = número total de artigos; `n` = em quantos artigos o termo aparece pelo menos uma vez
  (document frequency); `tf` = frequência do termo dentro do documento; `|d|`/`avgdl` = tamanho do
  documento e tamanho médio dos documentos, em tokens.
- `search(query, topK)` tokeniza a query da mesma forma, soma o score de cada termo da query
  presente no documento, descarta artigos com `score === 0` (nenhum termo bateu) e retorna os
  `topK` de maior pontuação — por padrão `topK = 8`, mas `llmService.ts` chama com `topK = 10`.

#### `hybridSearch.ts` — fusão por Reciprocal Rank Fusion (RRF)

```
RRF_score(id) = Σ (sobre cada ranking em que "id" aparece)  1 / (k + posição)
```

- `k = 60` — constante padrão da literatura de RRF (o próprio comentário do arquivo indica que
  "raramente precisa mudar"). Um `k` maior suaviza a diferença entre a 1ª e a 10ª posição de um
  ranking; um `k` menor faz a posição no topo pesar muito mais.
- `posição` começa em 1 (não em 0) para cada ranking de entrada.
- A função recebe uma lista de rankings (`RankedItem[][]`) — no caso, `[validVectorResults,
  bm25Results]` — soma a contribuição de cada item em cada ranking em que ele aparece (um artigo
  que está bem posicionado tanto na busca vetorial quanto no BM25 acumula pontuação dos dois lados
  e tende a subir no resultado final) e devolve apenas os `topK` IDs ordenados, sem os scores.
- Vantagem central do método (e o motivo de ter sido escolhido em vez de, por exemplo, somar os
  scores brutos): a distância de cosseno do pgvector e o score do BM25 estão em escalas
  completamente diferentes e não-comparáveis diretamente; RRF contorna isso usando só a **posição**
  de cada item em cada lista, não o valor do score.

### 2.6 Estrutura da base de conhecimento (`cdcData.json`)



Cada artigo do CDC é um objeto com este formato:

```json
{
  "title": "Art. 51 - Cláusulas Contratuais Abusivas",
  "content": "Art. 51. São nulas de pleno direito... (PALAVRAS-CHAVE PARA BUSCA: cláusula abusiva no contrato, contrato injusto, ...).",
  "keywords": [
    "cláusula abusiva no contrato",
    "contrato injusto",
    "multa de cancelamento",
    "..."
  ],
  "distincao": "Use quando a origem do problema for uma REGRA do contrato que é injusta, abusiva ou impede cancelamentos. Tem preferência sobre o Art. 42 se a cobrança indevida estiver baseada em uma cláusula do contrato."
}
```

- **`title`** funciona como o identificador único do artigo (é o campo usado como `id` em todo o
  pipeline — busca vetorial, BM25 e RRF operam sobre esse `title`, não sobre uma chave numérica
  separada).
- **`content`** traz o texto legal completo do artigo **e**, ao final, entre parênteses, um bloco
  `(PALAVRAS-CHAVE PARA BUSCA: ...)` — a mesma lista de frases coloquiais que também está
  duplicada no array `keywords`. É esse bloco que `answerWithRAG` remove via regex antes de montar
  o prompt final (ver `2.7` a seguir / `combinedLaws`), garantindo que o LLM de
  geração veja apenas o texto formal da lei, sem os termos de busca.
- **`keywords`** é o array estruturado das mesmas frases coloquiais, consumido pelo `bm25.ts`
  (concatenado ao `title`/`content` na montagem do índice).
- **`distincao`** (opcional, presente só nos artigos que costumam ser confundidos com outro): uma
  instrução curta, em linguagem natural, para o LLM de geração — como no exemplo do Art. 51 acima,
  que orienta explicitamente a preferir esse artigo sobre o Art. 42 quando a cobrança indevida
  decorre de uma cláusula contratual abusiva, e não de um erro simples de cobrança. Esse campo só
  entra no prompt quando o artigo correspondente é de fato um dos 4 recuperados pela busca híbrida
  (ver `knowledgeRepository.ts` e a montagem de `combinedLaws`) — ele não polui o prompt padrão com
  regras de desambiguação de artigos que nem foram recuperados para aquele caso.

### 2.7 Montagem do contexto para o LLM

```ts
const combinedLaws = finalResults.map(res => {
  const cleanContent = res.content.replace(/\(PALAVRAS-CHAVE PARA BUSCA:.*?\)/gi, '').trim();
  const distincaoTag = res.distincao ? `\nDISTINÇÃO: ${res.distincao}` : '';
  return `[LEI: ${res.title}]\n${cleanContent}${distincaoTag}`;
}).join('\n\n');
```

Antes de enviar ao modelo, o texto do artigo é limpo do bloco de palavras-chave de busca (que
existe só para fins de recuperação, não deve vazar para o prompt final). Quando o artigo tem um
campo `distincao` preenchido, ele é anexado — esse campo existe para ajudar o modelo a diferenciar
artigos "família" que costumam ser confundidos entre si (ex.: vício do produto x descumprimento de
oferta), e só é injetado no prompt quando aquele artigo específico é de fato recuperado, evitando
inflar o prompt padrão com regras de desambiguação estáticas.

### 2.8 Geração e limpeza da resposta

```ts
const prompt = ragPrompt(formattedHistory, combinedLaws);
const response = await generateText(prompt);
const cleanedResponse = response.trim().replace("[AGENDAR]", "").trim();
return cleanedResponse + DISCLAIMER;
```

O prompt de geração (`ragPrompt`, detalhado em `03-prompts.md`) instrui o modelo a escolher entre
três caminhos mutuamente exclusivos: pedir clarificação, dar uma orientação citando um único
artigo, ou redirecionar para atendimento humano com a tag `[AGENDAMENTO]`. A tag `[AGENDAR]` é
removida do texto antes do envio (o controlador de webhook usa sua presença/ausência apenas para
decidir o formato de envio — ver `01-fluxo-mensagens-webhook.md`). Por fim, o `DISCLAIMER` fixo
("Resposta processada por inteligência artificial...") é sempre concatenado, e o `ollamaClient`
já remove qualquer variação desse aviso que o próprio modelo tenha gerado, para não duplicar.

### 2.9 Tratamento de erro

Todo o corpo de `answerWithRAG` está em `try/catch` — qualquer falha (Ollama fora do ar, erro de
banco, etc.) resulta numa mensagem de indisponibilidade genérica, nunca em uma exceção não tratada
subindo até o webhook.

## Repositório de conhecimento (`knowledgeRepository.ts`)

Acesso de baixo nível à tabela `KnowledgeBase` via `prisma.$queryRawUnsafe`, usando a extensão
**pgvector** do PostgreSQL:

```sql
SELECT title as id, (embedding <=> $1::vector) as distance
FROM "KnowledgeBase"
ORDER BY embedding <=> $1::vector
LIMIT $2;
```

O operador `<=>` calcula distância de cosseno entre o embedding da query e o embedding armazenado
de cada artigo. `getAllArticles` traz a base completa (`title`, `content`, `keywords`,
`distincao`) para alimentar o índice BM25 em memória a cada chamada — uma escolha simples e
adequada para uma base de conhecimento pequena (dezenas de artigos), embora reconstrua o índice
BM25 a cada requisição em vez de cacheá-lo.
