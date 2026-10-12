# Documentação Técnica — Chatbot PROCON (Módulo de Chat Livre / RAG)

## Índice

1. [Visão geral](#visão-geral)
2. [Objetivo do sistema](#objetivo-do-sistema)
3. [Arquitetura geral](#arquitetura-geral)
4. [Fluxo ponta a ponta](#fluxo-ponta-a-ponta)
5. [Estrutura da documentação](#estrutura-da-documentação)

---

## Visão geral

Este módulo implementa o **"chat livre"** do assistente virtual do PROCON: um canal, dentro do
mesmo bot de WhatsApp baseado em menus/botões, onde o cidadão pode descrever seu caso em
linguagem natural. Em vez de navegar por um fluxo de opções pré-definidas, o sistema:

1. Recebe o relato em texto livre;
2. **Classifica** a natureza da relação (relação de consumo, fora do escopo do PROCON, ou
   ambígua);
3. Se aplicável, busca os artigos do **Código de Defesa do Consumidor (CDC)** mais relevantes
   usando uma busca híbrida (vetorial + léxica);
4. Gera, com um modelo de linguagem rodando localmente via **Ollama**, uma orientação final
   citando o artigo aplicável — ou uma pergunta de clarificação, quando o relato é vago demais.

Todo o processamento de IA roda **localmente** (Ollama), sem enviar o conteúdo dos relatos dos
cidadãos para APIs de terceiros — apenas a camada de mensageria (envio/recebimento) depende de
um serviço externo, a **Meta WhatsApp Cloud API**.

## Objetivo do sistema

- Dar ao cidadão uma **orientação inicial e confiável**, fundamentada em texto de lei (CDC), sem
  substituir o atendimento humano do PROCON.
- Reduzir a carga de triagem manual, direcionando casos simples/claros para uma resposta
  automática, e casos ambíguos ou fora de escopo para o caminho adequado (pergunta de
  clarificação, redirecionamento para outro órgão, ou agendamento presencial).
- Evitar "alucinação jurídica": a IA só pode citar artigos que estejam de fato na base de
  conhecimento recuperada — nunca inventa número de lei, prazo ou dispositivo.

## Arquitetura geral

```
                    ┌─────────────────────┐
   Cidadão (WhatsApp)│   Meta WhatsApp     │
   ───────────────► │   Cloud API         │
                    └──────────┬──────────┘
                               │ webhook (POST)
                               ▼
                    ┌─────────────────────┐
                    │ webhookController.ts│  ← gerencia sessão (UserSession)
                    │ (Express)           │    e decide: menu de botões x chat livre (IA)
                    └──────────┬──────────┘
                               │ (modo chat livre)
                               ▼
                    ┌─────────────────────┐
                    │   llmService.ts      │  ← orquestra o pipeline RAG
                    │   answerWithRAG()    │
                    └──┬───────┬───────┬──┘
                       │       │       │
          ┌────────────┘       │       └─────────────┐
          ▼                    ▼                      ▼
 ┌──────────────────┐ ┌─────────────────┐   ┌──────────────────────┐
 │ classifyReport.ts │ │ ollamaClient.ts │   │ knowledgeRepository.ts│
 │ (classificação    │ │ (embeddings +   │   │ (pgvector: busca      │
 │  jurídica em JSON)│ │  geração de     │   │  vetorial + todos os  │
 │                    │ │  texto)         │   │  artigos do CDC)      │
 └──────────────────┘ └─────────────────┘   └──────────────────────┘
                                                       │
                                                       ▼
                                             ┌──────────────────────┐
                                             │ bm25.ts +             │
                                             │ hybridSearch.ts       │
                                             │ (busca léxica + RRF)  │
                                             └──────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     metaAPI.ts       │  → envia a resposta final
                    │ (texto ou interativo)│    de volta ao cidadão
                    └─────────────────────┘
```

Camadas envolvidas:

| Camada | Arquivo(s) | Responsabilidade |
|---|---|---|
| Mensageria (I/O) | `metaAPI.ts` | Enviar mensagens de texto e interativas via Meta WhatsApp Cloud API |
| Controlador HTTP | `webhookController.ts` | Receber eventos do webhook, gerenciar sessão do cidadão, decidir o roteamento (menu x IA) |
| Orquestração RAG | `llmService.ts` | Coordenar classificação → recuperação híbrida → geração da resposta final |
| Classificação | `classifyReport.ts` | Classificar o relato em `CONSUMO`, `AMBIGUO` ou categorias fora de escopo |
| Cliente do LLM local | `ollamaClient.ts` | Gerar embeddings e texto via Ollama |
| Prompts | `index.ts` (prompts) | Templates de prompt para classificação, RAG e orientação por menu |
| Repositório de conhecimento | `knowledgeRepository.ts` | Acesso à base de artigos do CDC (`KnowledgeBase`) e busca vetorial (pgvector) |
| Busca híbrida | `bm25.ts` / `hybridSearch.ts` | Ranqueamento léxico (BM25) e fusão com a busca vetorial (Reciprocal Rank Fusion) |
| Avaliação | `run-eval.ts` / `test-cases.json` | Harness de testes automatizados do pipeline RAG |

## Fluxo ponta a ponta

1. Cidadão envia mensagem de texto pelo WhatsApp.
2. `webhookController` recebe o evento, busca ou cria a `UserSession` (por número de telefone) e
   salva a mensagem em `ChatLog`.
3. Se a sessão já está em modo chat livre (`isChat: true`) — ou se o texto recebido não é uma
   saudação nem um comando de menu, o que ativa o modo automaticamente — o controlador chama
   `answerWithRAG()`.
4. `answerWithRAG` monta o histórico recente da conversa, chama `classifyReport` para classificar
   o relato e decide o próximo passo:
   - Categoria fora de escopo → devolve uma resposta fixa de redirecionamento.
   - `CONSUMO` ou `AMBIGUO` → segue para a busca híbrida de artigos do CDC.
5. A busca híbrida combina resultado vetorial (pgvector/bge-m3) e BM25 sobre palavras-chave,
   fundidos por Reciprocal Rank Fusion, selecionando os 4 artigos mais relevantes.
6. Os artigos selecionados entram no `ragPrompt`, que instrui o modelo a: pedir clarificação (se
   o relato for vago), dar uma orientação final citando **um único** artigo, ou redirecionar para
   atendimento humano (se nenhuma lei se aplicar).
7. A resposta é limpa (remoção de tags de controle como `[AGENDAR]`) e devolvida ao
   `webhookController`, que decide o formato de envio (texto simples para perguntas de
   clarificação, ou mensagem interativa com botões de feedback/agendamento para respostas
   finais).
8. `metaAPI.ts` realiza o envio via Meta WhatsApp Cloud API.

## Estrutura da documentação

- **`01-fluxo-mensagens-webhook.md`** — Gerenciamento de sessão e roteamento de mensagens
  (`webhookController.ts`).
- **`02-pipeline-rag.md`** — Classificação jurídica, orquestração RAG e busca híbrida
  (`classifyReport.ts`, `llmService.ts`, `knowledgeRepository.ts`, `bm25.ts`, `hybridSearch.ts`).
- **`03-prompts.md`** — Engenharia de prompt: classificação, RAG e orientação por menu
  (`index.ts`).
- **`04-integracoes-externas.md`** — Integrações com Ollama (LLM local) e Meta WhatsApp Cloud API
  (`ollamaClient.ts`, `metaAPI.ts`).
- **`05-avaliacao.md`** — Harness de avaliação automatizada do pipeline (`run-eval.ts`,
  `test-cases.json`).
