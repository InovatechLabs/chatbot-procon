# Engenharia de Prompt

Arquivo: `index.ts` (módulo de prompts). Três templates, um para cada etapa da IA no sistema.

## `classifyReport(userQuestion, formattedHistory)`

Gera o prompt de classificação usado pelo Estágio 1 do pipeline (ver `02-pipeline-rag.md`). É o
mesmo texto duplicado em `classifyReport.ts` — o helper de classificação parece montar o prompt
inline em vez de importar este template, o que é um ponto a unificar para evitar que as duas
cópias divirjam com o tempo.

Estrutura do prompt:

1. Define o papel do modelo ("classificador jurídico do PROCON") e a saída esperada (JSON puro).
2. Regra anti-assunção (não presumir relação de consumo sem pistas do fornecedor/objeto).
3. Ordem de avaliação das cinco categorias, cada uma com exemplos concretos do que se encaixa.
4. Instrução final reforçando: julgar pela natureza do produto/serviço, não pela "culpa" de
   ninguém, e responder em JSON estrito, sem markdown.

## `ragPrompt(formattedHistory, combinedLaws)`

O prompt mais crítico do sistema — instrui o modelo a produzir a resposta final ao cidadão. Está
estruturado como uma máquina de decisão em três passos:

**Passo 1 — Clareza do relato**: define o critério mínimo para avançar (saber a natureza básica do
conflito), deixando explícito que **não** deve exigir provas, nomes, valores ou datas — só o
suficiente para saber "o que" e "o que deu errado".

**Passo 2 — Análise jurídica**, com regras de desempate explícitas:

- Produto que funciona mas é diferente do anunciado → descumprimento de oferta; produto com
  defeito → vício do produto.
- Entre lei específica e genérica, escolhe a específica.
- Quando duas leis parecem aplicáveis, prioriza a que trata do ato **mais específico e mais
  grave** relatado (ex.: fornecedor que simplesmente sumiu/recusou cumprir → prefere
  descumprimento/recusa em vez de uma lei de qualidade/vício, mesmo que ambas pareçam plausíveis).
  O prompt reforça que essa ambiguidade **não** é motivo para cair na opção de redirecionamento.

**Passo 3 — Resposta, escolhendo exatamente uma opção**:

| Opção | Quando usar | Regra de formato |
|---|---|---|
| **A) Clarificação** | Relato ainda vago (ex.: "tive um problema com uma loja") | Mensagem curta, termina com `?`; aborta para C se o cidadão se recusar a responder |
| **B) Orientação final** | Há lei aplicável | Cita **um único** artigo, com número/nome exatos da base (proibido inventar/alterar); nunca afirma que houve crime, apenas o que a lei prevê |
| **C) Redirecionamento** | Nenhuma das leis fornecidas tem qualquer relação com o problema | Explica com gentileza a necessidade de análise humana e **obrigatoriamente** encerra com a tag `[AGENDAMENTO]` |

Regras gerais aplicadas em qualquer caminho: não cumprimentar de novo se já há histórico; tom
empático e neutro; nunca sugerir ações que danifiquem produtos; nunca expor o raciocínio interno
ou mencionar as opções A/B/C ao cidadão; evitar repetição literal de palavras do relato/leis;
limite de 850 caracteres.

## `orientationPrompt(userPath, officialText)`

Usado fora do chat livre, no fluxo de menu programado (`generateOrientativeResponse`, chamado por
`webhookController.ts` quando o cidadão chega a um passo terminal sem opções). Diferente do
`ragPrompt`, aqui a IA **não decide o conteúdo jurídico** — ela apenas humaniza um texto oficial
já definido no banco (`Step.message`) para o caminho de menu que o cidadão percorreu
(`userPath`).

Instruções principais:

1. Iniciar com uma frase curta e empática confirmando entendimento do problema com base no menu
   escolhido.
2. Repassar o conteúdo da resposta oficial de forma clara, sem reescrever seu conteúdo jurídico.
3. Proibição explícita de inventar leis, prazos ou regras fora do texto oficial fornecido.
4. Responder em Português do Brasil.
5. Regra de formatação: usar apenas um asterisco (`*`) no início/fim de trechos a destacar, nunca
   itálico — alinhado ao formato de negrito do WhatsApp (`*texto*`).

Esse prompt tem uma função de segurança arquitetural importante: mesmo no fluxo de menu, a IA é
usada apenas para **redigir**, nunca para **decidir** qual orientação jurídica se aplica — essa
decisão já está fixada no banco de dados (`Step.message`). Se a chamada ao Ollama falhar,
`generateOrientativeResponse` cai em um **fallback de segurança**, devolvendo o texto oficial puro
(sem humanização) em vez de travar o atendimento.
