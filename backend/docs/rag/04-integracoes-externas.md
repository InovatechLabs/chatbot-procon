# Integrações Externas

Arquivos: `ollamaClient.ts`, `metaAPI.ts`.

## Cliente Ollama (`ollamaClient.ts`)

Camada fina sobre a API HTTP local do **Ollama**, expondo duas funções puras usadas em todo o
sistema (classificação, RAG, orientação por menu):

```ts
export const getEmbedding = async (text: string): Promise<number[]> => { ... }
export const generateText = async (prompt: string): Promise<string> => { ... }
```

- **`getEmbedding`**: chama `OLLAMA_EMBED_URL` com o modelo definido em
  `OLLAMA_EMBEDDING_MODEL_NAME` (o `bge-m3:latest` citado pelo autor do sistema) e retorna o vetor
  de embedding usado na busca vetorial (`knowledgeRepository.ts`).
- **`generateText`**: chama `OLLAMA_GENERATE_URL` com `OLLAMA_GENERATE_MODEL_NAME`, `stream: false`
  (resposta completa de uma vez, não via streaming de tokens), e aplica uma limpeza por regex no
  texto retornado:

```ts
.replace(/\*?\s*(resposta )?processad[ao] por (uma )?intelig[êe]ncia artificial.*?(formal\.?)?\*?/gi, '')
```

  Essa regex remove qualquer variação do próprio disclaimer de IA que o modelo eventualmente gere
  espontaneamente na resposta — evitando duplicação, já que o `DISCLAIMER` oficial é sempre
  concatenado manualmente depois, em `llmService.ts`.

Ambas as funções falham "alto" (lançam exceção) se as variáveis de ambiente necessárias não
estiverem definidas, e o carregamento do `.env` é feito com um caminho resolvido relativo à
posição do próprio arquivo (`import.meta.dirname`), tornando o carregamento independente do
diretório de onde o processo é iniciado.

## Cliente Meta WhatsApp Cloud API (`metaAPI.ts`)

Encapsula o envio de mensagens para a **Meta WhatsApp Cloud API** (`graph.facebook.com/v19.0`).

### Inicialização preguiçosa (lazy) do cliente Axios

```ts
let metaApiInstance: AxiosInstance | null = null;

const getMetaApi = (): AxiosInstance => {
  if (!metaApiInstance) {
    // valida META_WA_TOKEN e META_PHONE_NUMBER_ID, cria a instância do axios
  }
  return metaApiInstance;
};
```

A instância do Axios (com `baseURL` e header `Authorization` já configurados) só é criada na
primeira chamada real de envio, e reaproveitada nas seguintes (padrão singleton em memória do
processo). Isso evita quebrar a inicialização do módulo caso as variáveis de ambiente ainda não
estejam carregadas no momento do `import`, e evita reconstruir a configuração do Axios a cada
mensagem enviada.

### `sendTextMessage(to, text)`

Envia uma mensagem de texto simples via `POST /messages`, no formato exigido pela API do
WhatsApp (`messaging_product`, `recipient_type`, `type: "text"`).

### `sendInteractiveMessage(to, text, options)`

Monta uma mensagem interativa, escolhendo automaticamente entre dois formatos suportados pela
Meta, de acordo com a quantidade de opções:

- **Até 3 opções** → botões (`type: 'button'`), com título truncado em **20 caracteres**
  (limite da própria API para botões).
- **Mais de 3 opções** → lista (`type: 'list'`), com título truncado em **24 caracteres**
  (limite da API para itens de lista), agrupada em uma única seção ("Selecione uma opção").

Esse comportamento é o que permite ao sistema, por exemplo, alternar entre um menu simples de
botões (feedback, agendamento) e listas mais longas (opções de um `Step` do fluxo programado) sem
que o chamador (`webhookController.ts`, `llmService.ts`) precise se preocupar com qual formato a
Meta exige em cada caso.

### Tratamento de erro

Ambas as funções capturam erros do Axios, logam `error.response?.data` (o corpo de erro
estruturado que a Meta normalmente retorna) ou `error.message` como fallback, e **relançam** a
exceção — quem chama (`webhookController.ts`) decide o que fazer com a falha de envio.
