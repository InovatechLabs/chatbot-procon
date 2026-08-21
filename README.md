# Chatbot PROCON

Chatbot de atendimento via WhatsApp para o PROCON, com motor de navegação por árvore de decisão, painel administrativo para gestão dos fluxos e geração de respostas orientativas com apoio de um LLM local (Ollama). Solução conteinerizada, pronta para implantação via Docker Compose na infraestrutura do cliente.

Projeto acadêmico (ABP — 6º semestre, DSM).

## Sumário

- [Visão geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Configuração do ambiente](#configuração-do-ambiente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Executando o projeto](#executando-o-projeto)
- [Rodando os testes](#rodando-os-testes)
- [Estrutura de diretórios](#estrutura-de-diretórios)
- [Fluxo de contribuição](#fluxo-de-contribuição)
- [Roadmap / Sprints](#roadmap--sprints)
- [Documentação completa](#documentação-completa)
- [Licença](#licença)

## Visão geral

O sistema recebe mensagens de cidadãos via WhatsApp (WhatsApp Cloud API), conduz o atendimento por meio de um fluxo de perguntas e respostas configurável (árvore de decisão), registra as interações e, ao final, apresenta uma orientação consolidada — formatada por um modelo de linguagem local — deixando claro que o conteúdo é orientativo e não substitui aconselhamento jurídico oficial.

Principais capacidades:

- Atendimento automatizado via WhatsApp com menus interativos.
- Painel administrativo web para criar, editar e excluir os nós e alternativas do fluxo, sem necessidade de alterar código.
- Registro estruturado de todas as interações para auditoria e análise.
- Geração de texto explicativo final via LLM local (Ollama), sem envio de dados a serviços de IA externos.
- Consentimento LGPD obrigatório antes do início do atendimento.

## Arquitetura

Arquitetura em camadas, conteinerizada, com cada responsabilidade isolada em seu próprio container Docker:

```
WhatsApp Cloud API (Meta)
        |
        v
Backend (Node.js/Python) ---- PostgreSQL (dados / logs)
        |                |
        |                +--- Redis (estado da sessão)
        v
Ollama (LLM local) <--- chamada interna via rede Docker

Painel Administrativo (SPA) ---> consome/gerencia a árvore de decisão via API do backend
```

Detalhes completos (diagrama de camadas, modelo de dados, UML) estão na [documentação completa](#documentação-completa).

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Node.js (Express) ou Python (FastAPI) |
| Banco de dados | PostgreSQL |
| Cache / Sessão | Redis |
| Painel administrativo | React (ou Vue/Angular) |
| Mensageria | WhatsApp Cloud API (Meta for Developers) |
| IA / LLM | Ollama (modelo leve, ex.: Llama 3.1 8B ou Qwen) |
| Infraestrutura | Docker / Docker Compose |
| Versionamento | Git / GitHub (GitFlow) |

## Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) e Docker Compose
- [Git](https://git-scm.com/)
- Node.js (versão LTS) — opcional, apenas para desenvolvimento do painel administrativo fora do container
- Conta no [Meta for Developers](https://developers.facebook.com/) com um app configurado para a WhatsApp Cloud API

## Configuração do ambiente

1. Clone o repositório:
   ```bash
   git clone <url-do-repositorio>
   cd chatbot-procon
   ```
2. Copie o arquivo de variáveis de ambiente de exemplo e preencha os valores:
   ```bash
   cp .env.example .env
   ```
3. Suba os containers:
   ```bash
   docker compose up -d --build
   ```
4. Acompanhe os logs do backend:
   ```bash
   docker compose logs -f api
   ```
5. Acesse o painel administrativo em `http://localhost:<porta-configurada>`.
6. Em ambiente de desenvolvimento, exponha o webhook publicamente (ex.: [ngrok](https://ngrok.com/)) e configure a URL no painel do Meta for Developers.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `WHATSAPP_TOKEN` | Token de acesso gerado no Meta for Developers |
| `WHATSAPP_PHONE_ID` | ID do número de telefone de teste/produção |
| `WEBHOOK_VERIFY_TOKEN` | Token de verificação configurado no painel da Meta |
| `DATABASE_URL` | String de conexão do PostgreSQL (ex.: `postgres://user:pass@db:5432/procon`) |
| `REDIS_URL` | Endereço do serviço Redis (ex.: `redis://redis:6379`) |
| `OLLAMA_HOST` | Endereço interno do container Ollama (ex.: `http://llm:11434`) |
| `OLLAMA_MODEL` | Nome do modelo carregado (ex.: `llama3.1:8b`) |
| `ADMIN_JWT_SECRET` | Chave usada para assinar tokens de autenticação do painel administrativo |

## Executando o projeto

Após `docker compose up -d --build`, os seguintes serviços ficam disponíveis:

| Serviço | Container | Descrição |
|---|---|---|
| `api` | backend | Webhook do WhatsApp, motor de navegação, API do painel |
| `db` | PostgreSQL | Persistência de fluxos, usuários e logs |
| `redis` | Redis | Estado da sessão de conversa |
| `admin` | painel administrativo | Interface web de gestão dos fluxos |
| `llm` | Ollama | Geração de texto explicativo final |

Para especificações de hardware recomendadas e passos detalhados de implantação em VPS, consulte o manual do desenvolvedor na documentação completa.

## Rodando os testes

```bash
docker compose exec api npm test        # ou: docker compose exec api pytest
```

Estratégia de testes (unitários, integração, sistema, carga) detalhada no Plano de Testes, na documentação completa.

## Estrutura de diretórios

```
chatbot-procon/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── src/
│   │   ├── webhooks/     # endpoints GET/POST da WhatsApp Cloud API
│   │   ├── engine/       # motor de navegação da árvore de decisão
│   │   ├── session/      # gerenciamento de sessão (Redis)
│   │   ├── llm/          # cliente do serviço Ollama
│   │   ├── models/       # entidades / ORM (usuarios, nos_fluxo, etc.)
│   │   ├── routes/       # rotas REST do painel administrativo
│   │   └── utils/
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   └── Dockerfile
├── admin-panel/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/     # chamadas à API do backend
│   ├── tests/
│   └── Dockerfile
└── infra/
    ├── postgres/         # scripts de inicialização/migrations
    └── ollama/           # Modelfile / configuração do modelo
```

## Fluxo de contribuição

1. Crie uma branch a partir de `develop`: `feature/nome-da-funcionalidade`.
2. Siga os padrões de código do projeto (ESLint + Prettier, Conventional Commits).
3. Abra um Pull Request para `develop`, descrevendo o requisito atendido e anexando evidência de teste.
4. Aguarde ao menos uma aprovação de outro integrante da equipe antes do merge.

Branches: `main` (produção), `develop` (integração), `feature/*`, `release/*`, `hotfix/*` (GitFlow).

## Roadmap / Sprints

| Etapa | Período | Foco |
|---|---|---|
| Fase Zero | 10/08 – 17/08 | Repositório, Docker inicial, app Meta, draft do modelo de dados |
| Sprint 1 | 17/08 – 14/09 | Webhook, envio de mensagens, sessão, motor de navegação estático, LGPD |
| Sprint 2 | 15/09 – 19/10 | Painel administrativo (CRUD), integração dinâmica, logs, disclaimer |
| Sprint 3 | 20/10 – 23/11 | LLM local (Ollama), tratamento de exceções, testes de carga, documentação final |

## Documentação completa

A documentação técnica detalhada do projeto está disponível na pasta `docs/` (ou local combinado pela equipe):

- Especificação de Requisitos (Funcionais, Não Funcionais e Restrições de Projeto)
- Arquitetura, Modelagem de Dados e Design de Software (UML)
- Plano de Implementação e Plano de Testes
- Manual do Desenvolvedor, Manual do Usuário e Plano de Manutenção

## Licença

Projeto acadêmico — uso educacional. Ajuste esta seção conforme a licença definida pela equipe/instituição.
