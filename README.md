# Chatbot PROCON

Atendimento ao consumidor do PROCON Jacareí via WhatsApp (Meta Cloud API), com painel administrativo e IA local (Ollama) para orientação com base de conhecimento (RAG).

## Arquitetura
- **backend/**: Node.js + TypeScript, Express, Prisma e PostgreSQL com pgvector. Webhook da Meta, fila durável de mensagens, agenda, análises e API do painel.
- **frontend/**: painel em React, TypeScript e Vite.
- **docs/** e **backend/docs/**: documentação técnica. **documentation/**: documentos formais do projeto.

## Executar em desenvolvimento
Pré-requisitos: Docker Desktop e um arquivo `backend/.env` (modelo em `backend/.env.example`).

    docker compose -f docker-compose.yml -f compose.dev.yml up -d

| Serviço | Endereço |
|---|---|
| Painel | http://localhost:5173 |
| API | http://localhost:3000 (`/health` processo, `/ready` banco) |
| PostgreSQL | localhost:5433 |
| pgAdmin (opcional) | `docker compose --profile tools up -d pgadmin` → http://localhost:5050 |

A primeira instalação (chaves de privacidade, migrações, administrador, guias de documentos) está em `docs/setup-e-execucao.md`.

## Variáveis principais (`backend/.env`)
`DATABASE_URL`, `PORT`, `PANEL_ORIGINS`, `TRUST_PROXY`, `DATA_ENCRYPTION_KEY`, `DATA_LOOKUP_KEY`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_WA_TOKEN`, `META_PHONE_NUMBER_ID`, `META_GRAPH_VERSION`, `OLLAMA_EMBED_URL`, `OLLAMA_GENERATE_URL`, `OLLAMA_EMBEDDING_MODEL_NAME`, `OLLAMA_GENERATE_MODEL_NAME`.
Nunca versione o `.env`. As chaves de criptografia não podem ser regeneradas depois que há dados protegidos: guarde-as em um gerenciador de senhas, separadas dos backups.

## Testes
    cd backend && npm run check          # tipos, build e testes unitários
    npm run test:integration              # exige TEST_DATABASE_URL (base procon_ci_*)

O CI (GitHub Actions, branches `main` e `dev`) executa lint e build do frontend e a verificação completa do backend com PostgreSQL.

## Documentação
`docs/setup-e-execucao.md`, `docs/protecao-dados.md`, `docs/autenticacao-painel.md`, `docs/webhook-meta.md`, `docs/mensagens-duraveis.md`, `docs/testes-ci.md`.