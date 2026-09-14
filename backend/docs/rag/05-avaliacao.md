# Avaliação Automatizada do Pipeline

Arquivos: `tests/llm/run-eval.ts`, `tests/llm/test-cases.json`.

## Objetivo

Script standalone (`npx tsx run-eval.ts`) que roda um conjunto de casos de teste **diretamente
contra as funções do `llmService`**, sem passar pelo WhatsApp — permitindo validar mudanças no
pipeline (prompt, base de conhecimento, parâmetros de busca) de forma rápida e repetível, com
métricas objetivas de acerto.

## Dataset (`test-cases.json`)

Contém, atualmente, **60 casos de orientação direta** e **6 casos de clarificação**, divididos em
duas categorias:

### `orientacao_direta`

Casos onde o relato já é suficientemente claro para produzir uma orientação final em um único
turno. Cada caso define:

```json
{
  "id": "OD-01",
  "descricao": "Cobrança indevida após cancelamento confirmado, sem menção a cláusula contratual",
  "mensagem": "Cancelei minha assinatura de streaming...",
  "categoriaEsperada": "CONSUMO",
  "tipoRespostaEsperada": "orientacao_final",
  "artigoEsperado": "Art. 42",
  "observacao": "Não deve escolher Art. 49, 71 ou 39."
}
```

O campo `observacao` é particularmente útil como **caso de desambiguação**: registra
explicitamente quais artigos "vizinhos" o sistema poderia confundir com o correto, documentando o
raciocínio jurídico esperado por trás do gabarito.

### `precisa_clarificacao`

Casos de duas etapas: uma mensagem inicial ambígua (deve gerar uma pergunta de clarificação) e uma
conversa completa após a resposta do cidadão (deve gerar a orientação final):

```json
{
  "id": "PC-01",
  "mensagemInicial": "Comprei uma coisa e até agora não devolveram meu dinheiro.",
  "categoriaEsperadaInicial": "AMBIGUO",
  "clarificacaoEsperadaSobre": ["tipo de vendedor...", "o que foi comprado", "motivo da devolução"],
  "conversaCompleta": {
    "historico": [ /* turnos anteriores */ ],
    "mensagemFinal": "Comprei numa loja de eletrônicos online...",
    "categoriaEsperadaFinal": "CONSUMO",
    "artigoEsperadoFinal": "Art. 35"
  }
}
```

## Sessões de teste isoladas e reprodutíveis

Como `ChatLog.sessionId` é uma foreign key real para `UserSession.id` (não uma string livre), o
script cria uma `UserSession` sintética por caso, usando um `phoneNumber` determinístico
(`eval-<caseId>`), **e apaga qualquer sessão anterior com o mesmo número antes de rodar**:

```ts
const getOrResetEvalSession = async (caseId: string) => {
  const phoneNumber = `eval-${caseId}`;
  const existing = await prisma.userSession.findUnique({ where: { phoneNumber } });
  if (existing) await prisma.userSession.delete({ where: { id: existing.id } }); // cascade
  return await prisma.userSession.create({ data: { phoneNumber, isChat: true, status: 'OPEN' } });
};
```

Isso garante que cada execução do eval parte de um estado limpo, sem acumular histórico de rodadas
anteriores — importante porque `answerWithRAG` lê o histórico da sessão para montar a query de
busca e o contexto do prompt. A exclusão em cascata (`onDelete: Cascade` no schema, entre
`UserSession` e `ChatLog`) evita a necessidade de um delete separado dos logs.

Para os casos de clarificação, o histórico da etapa "completa" é populado artificialmente via
`seedHistory`, espaçando cada mensagem em 1 minuto para preservar a ordem cronológica esperada
pela query de `ChatLog` (`orderBy: timestamp`).

## Métricas coletadas

### Extração e normalização de referências a artigos

```ts
const regex = /art(?:igo)?\.?\s*(\d+[a-z-]*)/gi;
```

Como a resposta da IA é texto livre, o script extrai todas as menções a artigos por regex
(aceitando `Art.`, `Art` ou `Artigo` por extenso, incluindo sufixos como `54-G`), normaliza para o
formato `Art. NN` e deduplica — evitando falso-negativo apenas por diferença de grafia no nome
completo do dispositivo legal.

### Critérios de acerto por caso

Para cada caso de `orientacao_direta`, o script compara:

- **`categoriaOk`**: categoria retornada por `classifyReport` bate com `categoriaEsperada`.
- **`artigoOk`**:
  - Se `tipoRespostaEsperada === 'sem_artigo_adequado'` (ou `artigoEsperado === null`): correto
    se **nenhum** artigo foi mencionado na resposta.
  - Caso contrário: correto se o artigo esperado está entre os mencionados.
- **`multiplasLeis`** (informativo, não conta como erro automático): sinaliza quando a resposta
  menciona mais de um artigo, para revisão manual contra a Regra 5 do `ragPrompt` ("escolher
  apenas um").

Para os casos de `precisa_clarificacao`, o script roda as duas etapas (inicial e completa) e mede
adicionalmente `fezPergunta` (se a resposta inicial termina ou contém `?`).

Tempos de execução (`tempoClassificacaoMs`, `tempoPipelineMs`/`tempoInicialMs`/`tempoFinalMs`) são
registrados para cada caso, permitindo identificar regressões de performance além de regressões de
qualidade.

## Saída

- Console: progresso caso a caso com ✅/❌ por critério, e um resumo final com contagens de
  acerto por categoria de teste.
- `eval-results.json`: resultado detalhado de cada caso (categoria obtida, artigos encontrados,
  tempos, resposta completa da IA), salvo ao lado do script para inspeção posterior ou comparação
  entre execuções.
