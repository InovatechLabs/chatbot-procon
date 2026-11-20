# Instalação, configuração e execução do projeto

Este guia descreve o estado atual do repositório: backend Node/Express, frontend React/Vite/Tailwind, PostgreSQL com pgvector, autenticação pelo backend, proteção dos dados pessoais, inbox/outbox e métricas. O Compose atual é de **desenvolvimento/local**, com código montado em volumes e comandos `dev`. Não existe Redis ou serviço Ollama nesse Compose.

Depois de clonar o repositório, abrir um terminal na sua raiz. Os exemplos usam PowerShell; trocar o caminho se necessário:

```powershell
cd D:\chatbot-procon
```

Para uma instalação nova, seguir as seções 1 a 8. Para o ambiente que já está funcionando, usar as seções 9 e 10: não recriar contas, chaves ou base de conhecimento.

## 1. Pré-requisitos

- Git e acesso ao repositório.
- Docker Desktop iniciado, com Docker Compose e containers Linux.
- Portas locais 3000, 5173 e 5432 disponíveis.
- Node.js 24 para comandos opcionais executados diretamente na máquina; os Dockerfiles atuais usam Node 20.
- Ollama acessível para usar IA; pode estar na máquina, em outro servidor ou no Kaggle.
- Aplicativo Meta/WhatsApp Business configurado e túnel HTTPS para o webhook, quando for testar mensagens reais.

O painel, a criação de contas, as migrações, os seeds de menu/documentos e os testes automatizados comuns **não precisam do Kaggle**. A conversa livre, a reescrita com IA e a geração de embeddings precisam do serviço correspondente disponível.

## 2. Preparar os dois arquivos de ambiente

Existem dois arquivos diferentes:

| Arquivo | Utilização |
| --- | --- |
| `.env` na raiz | Interpolação do Docker Compose: banco, publicação do painel e pgAdmin opcional |
| `backend/.env` | Configurações carregadas pelo backend e seus scripts: proteção de dados, Meta, Ollama e origens do painel |

Copiar os exemplos somente se os arquivos locais ainda não existirem:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

Editar `.env` na raiz. Exemplo de estrutura, usando uma senha própria no lugar do marcador:

```dotenv
DB_USER=procon_admin
DB_PASS=SUBSTITUA_POR_UMA_SENHA_FORTE
DB_NAME=procon_db
PANEL_BIND_HOST=127.0.0.1
```

O exemplo antigo da raiz contém `admin/admin`: substituir antes da primeira instalação. O Compose atual interpola a senha diretamente em uma URL PostgreSQL; para esse formato, usar uma senha longa com letras, números e caracteres como `_` ou `-`. Caracteres reservados de URL exigem ajustar a construção da conexão.

Em `backend/.env`, conferir:

| Variável | Configuração |
| --- | --- |
| `PORT` | `3000` |
| `DATABASE_URL` | Conexão PostgreSQL; ver explicação abaixo |
| `PANEL_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` no desenvolvimento local |
| `DATA_ENCRYPTION_KEY` e `DATA_LOOKUP_KEY` | Geradas/verificadas pelo setup da seção 4 |
| `META_WA_TOKEN` | Token de envio do aplicativo Meta |
| `META_PHONE_NUMBER_ID` | ID do número do bot, não o telefone em formato legível |
| `META_VERIFY_TOKEN` | Token escolhido para a confirmação GET do webhook |
| `META_APP_SECRET` | Segredo do aplicativo que assina os POSTs do webhook |
| `OLLAMA_GENERATE_URL` | URL completa de geração, terminando em `/api/generate` |
| `OLLAMA_EMBED_URL` | URL completa de embeddings, terminando em `/api/embeddings` |
| `OLLAMA_GENERATE_MODEL_NAME` | Modelo inicial de geração, por exemplo `gemma3:12b` |
| `OLLAMA_EMBEDDING_MODEL_NAME` | Modelo instalado para embeddings; atualmente usado `bge-m3:latest` |
| `LLM_ENABLE_THINKING` | Valor inicial do thinking mode, `false` ou `true` |

Em **Configurações de IA**, um ADMIN pode selecionar um modelo já instalado no Ollama e definir o thinking mode. Antes de salvar, o backend testa a geração de JSON com uma pergunta sintética. Se a configuração passar, vale para as próximas mensagens do chatbot. O modelo e o thinking mode do `.env` servem de padrão até o primeiro salvamento no painel. Os scripts de benchmark continuam usando os valores do ambiente para permitir comparações controladas. Os endpoints do Ollama e o modelo de embeddings são configurados no `.env`.

No container, o Compose fornece `DATABASE_URL` usando o serviço `postgres` e as credenciais do `.env` da raiz. Essa variável tem precedência sobre a URL carregada por dotenv. Para executar scripts no host, configurar `backend/.env` com as mesmas credenciais, mas host `127.0.0.1:5432`, pois o nome `postgres` pertence à rede Docker.

Por exemplo, para os nomes sugeridos acima, a URL do host é `postgresql://procon_admin:SUA_SENHA@127.0.0.1:5432/procon_db`. Substituir a senha pelo valor configurado na raiz; não usar o marcador literalmente.

Dentro de um container, `localhost` identifica o próprio container. Para acessar Ollama instalado no Windows, usar `host.docker.internal` em vez de `localhost`, com o serviço configurado para aceitar essa conexão. Para Kaggle, usar as URLs HTTPS do túnel ativo.

Preservar `.env` e chaves fora do Git. O dump do banco e suas chaves devem ter cópias de recuperação separadas e protegidas.

## 3. Construir as imagens e iniciar o banco

```powershell
docker compose build backend frontend
docker compose up -d postgres
docker compose exec postgres sh -c 'pg_isready -U $POSTGRES_USER -d $POSTGRES_DB'
```

Aguardar `accepting connections` antes de continuar; repetir apenas a verificação se o banco ainda estiver iniciando.

Alterar `DB_USER`, `DB_PASS` ou `DB_NAME` não reconfigura automaticamente um banco que já existe no volume `pgdata`. Em uma instalação existente, preservar as credenciais em uso ou realizar uma alteração administrada do PostgreSQL.

## 4. Executar o setup das chaves de proteção

```powershell
docker compose run --rm --no-deps backend npm run privacy:setup
```

O comando:

- Gera duas chaves independentes quando faltam valores.
- Grava as chaves no `backend/.env`, acessível pela montagem `/app` do container.
- Preserva valores já configurados.
- Valida o formato das chaves sem imprimir seus valores.

Em uma base já criptografada, usar as chaves originais. Gerar outras não recupera o acesso aos dados existentes. Esse comando não realiza rotação de chaves.

Para instalação com secrets externos, o script suporta `PRIVACY_KEYS_EXTERNAL=1` com as duas chaves previamente injetadas; nesse modo não grava novas chaves no arquivo. O Compose local não injeta essas variáveis automaticamente: a configuração de secrets deve ser preparada pelo responsável pela implantação.

## 5. Aplicar as migrações do banco

```powershell
docker compose run --rm --no-deps backend npx prisma migrate deploy
```

Esse comando cria/aplica a estrutura versionada: fluxo, sessões, autenticação, proteção de dados, agenda, filas e eventos. Não cria o administrador nem carrega os conteúdos do menu ou do CDC.

Para instalação ou atualização com dados, usar as migrações. Não usar `prisma migrate reset`, `db push` ou remoção do volume como procedimento de atualização.

## 6. Criar o menu e os documentos iniciais

```powershell
docker compose run --rm --no-deps backend sh -c 'npx prisma generate && npx tsx prisma/seed/seed.ts'
docker compose run --rm --no-deps backend sh -c 'npx prisma generate && npx tsx prisma/seed/docs.ts'
```

No painel, entre com uma conta ADMIN e abra **Institucional** para conferir o nome da unidade, os contatos, o endereço, o horário informado e as mensagens de encaminhamento. As próximas respostas usam os dados salvos imediatamente. Instalações antigas que definiram `PROCON_ENDERECO` ou `PROCON_HORARIO` usam esses valores até o primeiro salvamento. Configure horários e vagas na página **Disponibilidade**.

O seed do menu preenche uma base vazia e preserva um menu existente. O seed de documentos cria as categorias ausentes e preserva edições existentes. Nenhum desses dois comandos precisa de embeddings ou IA.

O antigo `updateMenuUx.ts` foi um atualizador pontual e não faz parte da instalação atual. Não é necessário procurar ou recriar esse script para iniciar o sistema.

### Base de conhecimento para a conversa livre

Menu e documentos não equivalem à base vetorial do CDC. A conversa livre precisa dos registros de `KnowledgeBase` com embeddings compatíveis com o modelo configurado.

**Particularidade atual:** `backend/prisma/seed/test.ts` é o importador dessa base, apesar do nome. Ele ainda possui uma URL de embeddings fixa no código e executa `TRUNCATE` da tabela antes de carregar os dados. Não segue automaticamente `OLLAMA_EMBED_URL` e não deve ser executado como atualização cotidiana.

Para uma primeira carga, confirmar que a base de destino está vazia, que os dados de `backend/src/database/data/cdcData.json` são os aprovados e que o serviço de embeddings está funcionando. Revisar nesse importador a URL fixa e o modelo antes de executá-lo. Com esses pontos conferidos:

```powershell
docker compose run --rm --no-deps backend sh -c 'npx prisma generate && npx tsx prisma/seed/test.ts'
```

Esse comando precisa do Ollama/Kaggle ativo. Não executá-lo em uma base com conhecimento válido sem backup e uma decisão explícita de reconstruí-la. Uma falha após o `TRUNCATE` pode deixar uma carga parcial. A criação de um importador administrável e seguro é uma melhoria pendente.

## 7. Criar o primeiro administrador

Em um terminal interativo:

```powershell
docker compose run --rm --no-deps backend sh -c 'npx prisma generate && npm run auth:setup'
```

Informar:

- Usuário de 3 a 64 caracteres: letras minúsculas, números, ponto, `_` ou `-`, começando por letra ou número.
- Senha de 12 a 128 caracteres, solicitada de forma oculta.

O comando cria somente o primeiro ADMIN e recusa execução se já houver qualquer conta. `npm run auth:create-user` é um alias com a mesma restrição; não é um cadastro alternativo de funcionários.

Para automação, o script aceita `AUTH_BOOTSTRAP_USERNAME` e `AUTH_BOOTSTRAP_PASSWORD` injetados de forma privada. Não colocar senhas em comandos compartilhados ou no repositório.

Após entrar, usar **Usuários e acessos → Cadastrar conta** para criar outros administradores/atendentes. Contas criadas pelo painel recebem senha temporária e devem alterá-la no primeiro acesso. O cadastro de usuário do painel é independente do registro de atendente vinculado à agenda.

## 8. Iniciar backend e frontend

O Compose atual não inclui geração do cliente Prisma no comando de inicialização. Além disso, o `node_modules` dos comandos `run --rm` pode ser temporário e não é o mesmo volume usado pelo serviço permanente. Para uma instalação reproduzível, criar na raiz um override `compose.dev.yml` com:

```yaml
services:
  backend:
    command: sh -c "npx prisma generate && npm run dev"
```

Esse arquivo complementa o Compose existente; não substitui seus serviços. Usar os dois arquivos na inicialização:

```powershell
docker compose -f docker-compose.yml -f compose.dev.yml up -d backend frontend
docker compose ps
docker compose logs --tail=60 backend frontend
```

O override pode ser versionado se adotado pela equipe. Nesta entrega ele está documentado como conteúdo a criar; o guia não alterou o Compose existente.

| Serviço | Endereço local | Container |
| --- | --- | --- |
| Painel | http://localhost:5173 | `web_panel` |
| Saúde do backend | http://localhost:3000/health | `backend_api` |
| PostgreSQL | `127.0.0.1:5432` | `database` |

Verificar:

```powershell
(Invoke-WebRequest http://localhost:3000/health -UseBasicParsing).StatusCode
(Invoke-WebRequest http://localhost:5173 -UseBasicParsing).StatusCode
```

Ambos devem retornar 200. A API administrativa exige autenticação; receber 401 em `/api/analytics` sem sessão é esperado. Entrar no painel com o ADMIN criado e conferir as áreas disponíveis.

pgAdmin é opcional. Para usá-lo, configurar `PGADMIN_EMAIL` e `PGADMIN_PASSWORD` no `.env` da raiz e executar:

```powershell
docker compose --profile tools up -d pgadmin
```

Acesso em http://localhost:5050. Dentro da rede Docker, o host do PostgreSQL é `postgres`. As variáveis de pgAdmin não redefinem a senha de uma conta já existente em seu armazenamento.

### Testar WhatsApp com Kaggle e ngrok

1. Iniciar o notebook do Kaggle, carregar os modelos e colocar o Ollama em execução.
2. Subir o túnel do Ollama e atualizar `OLLAMA_GENERATE_URL`/`OLLAMA_EMBED_URL` no `backend/.env`, preservando os caminhos dos endpoints.
3. Confirmar que os nomes dos modelos configurados correspondem aos instalados e aquecê-los antes do teste.
4. Reiniciar o backend para carregar as variáveis modificadas:

   ```powershell
   docker compose restart backend
   ```

5. Iniciar o ngrok local apontando para a porta 3000, usando o domínio fixo já registrado na Meta. O notebook fornece o túnel da IA; o ngrok local fornece o túnel do webhook.
6. Na configuração do aplicativo Meta, a callback deve terminar em `/api/webhook`. Usar o mesmo `META_VERIFY_TOKEN` e o `META_APP_SECRET` do aplicativo correto.
7. Enviar `menu` ao bot e conferir a recepção/assinatura nos logs. A navegação inicial do menu não precisa de IA; uma resposta terminal pode tentar a reescrita configurada.
8. Testar uma orientação livre somente com modelo, embeddings e base vetorial disponíveis.

O webhook confirma a mensagem depois de persistir a entrada. Workers do backend processam a inbox e enviam pela outbox. Um timeout de envio pode ficar UNKNOWN para revisão operacional, sem reenvio automático cego.

## 9. Execução cotidiana e atualizações

Para iniciar o ambiente preparado:

```powershell
docker compose -f docker-compose.yml -f compose.dev.yml up -d
```

Para parar os serviços mantendo containers e volumes:

```powershell
docker compose stop
```

Consultar logs:

```powershell
docker compose logs -f --tail=60 backend
docker compose logs -f --tail=60 frontend
```

Interromper o acompanhamento com Ctrl+C não encerra os serviços.

Atualizar o frontend após mudanças de código/dependências:

```powershell
docker compose -f docker-compose.yml -f compose.dev.yml up -d --build --no-deps --renew-anon-volumes frontend
```

Para atualizar o backend, interromper o acesso ao painel/webhook, fazer backup antes de mudanças no banco e executar:

```powershell
docker compose stop backend
docker compose build backend
docker compose run --rm --no-deps backend npx prisma migrate deploy
docker compose -f docker-compose.yml -f compose.dev.yml up -d --no-deps --renew-anon-volumes backend
```

`--renew-anon-volumes` renova as dependências do serviço selecionado, não o volume nomeado do PostgreSQL. Não usar `docker compose down -v` como atualização: essa opção pode remover o volume do banco.

Alterações no `backend/.env` exigem reinício. Configurações persistidas pelo painel, como capacidade e bloqueios de agenda, passam a valer sem rebuild.

## 10. Base existente, backup e conversão de dados antigos

Uma base que já passou pela proteção de dados não precisa repetir a conversão a cada inicialização. Preservar chaves, contas e conteúdo existente.

Para backup usando o script atual, no host com Node e dependências instaladas em `backend`:

```powershell
cd backend
npm ci
npm run privacy:backup
npm run privacy:verify-backup
cd ..
```

O Docker Desktop e o container `database` precisam estar ativos. O script de backup executa `docker exec database pg_dump`; ele foi escrito para o host e não deve ser presumido funcional dentro do container Node, que não inclui Docker CLI. O arquivo criptografado é gravado em `.private-backups` na raiz. A verificação autentica o arquivo e confere o conteúdo SQL; não equivale a um teste completo de restauração.

Para converter uma base antiga que ainda guarda dados em claro, manter o atendimento interrompido, preparar/preservar as chaves, fazer backup, aplicar as migrações e executar:

```powershell
docker compose run --rm --no-deps backend sh -c 'npx prisma generate && npm run privacy:migrate'
docker compose run --rm --no-deps backend sh -c 'npx prisma generate && npm run privacy:migrate -- --apply'
docker compose run --rm --no-deps backend sh -c 'npx prisma generate && npm run privacy:migrate'
```

A primeira e a última execução são simulações. A última deve mostrar zero alterações pendentes. Só liberar a aplicação depois de confirmar a conversão; o processo não deve concorrer com gravações normais.

A limpeza automática continua desativada por decisão do projeto, até aprovação dos prazos pelo PROCON. `privacy:retention` sem `--apply` simula; não adicionar execução destrutiva ao startup.

## 11. Comandos de manutenção e testes

| Objetivo | Comando com os serviços iniciados |
| --- | --- |
| Tipos, build e testes comuns do backend | `docker compose exec backend npm run check` |
| Lint do frontend | `docker compose exec frontend npm run lint` |
| Build/tipos do frontend | `docker compose exec frontend npm run build` |
| Consultar filas, sem exibir conteúdo pessoal | `docker compose exec backend npm run messages:queue -- status` |
| Repetir entrada DEAD após revisão | `docker compose exec backend npm run messages:queue -- retry inbox UUID --confirm` |
| Repetir saída DEAD/UNKNOWN após revisão | `docker compose exec backend npm run messages:queue -- retry outbox UUID --confirm` |
| Abandonar saída revisada e liberar as seguintes | `docker compose exec backend npm run messages:queue -- skip outbox UUID --confirm` |

Repetir uma saída UNKNOWN pode duplicar uma mensagem já recebida. Conferir o atendimento antes de autorizar a ação.

Os testes comuns usam dependências simuladas para IA/Meta. Para integrações PostgreSQL descartáveis, executar na raiz e depois em `backend`:

```powershell
docker compose -f compose.tests.yml up -d --wait
cd backend
npm ci
npx prisma generate
npm run build
$env:TEST_DATABASE_URL = 'postgresql://ci:ci-only-disposable@127.0.0.1:55432/procon_ci_control'
npm run test:integration
Remove-Item Env:TEST_DATABASE_URL
cd ..
docker compose -f compose.tests.yml down
```

A credencial acima é exclusiva da instância descartável de testes. O runner cria cinco bases próprias e remove apenas as que criou. Não usar a URL do banco da aplicação em `TEST_DATABASE_URL`.

O benchmark LLM e `npm run test:states:live` são opt-in: precisam dos serviços de IA reais e ficam fora do CI. Não são etapas obrigatórias do startup cotidiano.

## 12. Problemas comuns

### Configurar retenção pelo painel

Depois das migrações e da geração do Prisma, entre como ADMIN e abra **Retenção de dados**. Defina os quatro prazos em dias, ou deixe cada campo vazio para preservar a categoria. Instalações novas começam sem prazos e desativadas. Marque **Ativar exclusão automática** e salve: isso autoriza exclusões reais, incluindo registros antigos já vencidos. Para interromper, desmarque e salve.

A rotina inicia junto ao backend, verifica a ativação a cada minuto e aplica a política uma vez por hora. Após ativar ou editar, a primeira execução pode ocorrer na próxima verificação. Enquanto o backend estiver desligado não há limpeza; ao iniciar, retoma a política salva. O painel exibe a última execução e seus totais. As antigas variáveis `RETENTION_*` não são usadas. Não há simulação ou comando obrigatório na operação normal.

Opcionalmente, para antecipar uma execução real da política ativa, a partir de `backend`:

```powershell
npm run privacy:retention -- --apply
```

O comando aplica a política salva mais recente; se estiver desativada, recusa a exclusão. Sem `--apply`, apenas informa o funcionamento automático. Configuração e execução são serializadas por lock no banco. A migração de automação desativa eventuais autorizações antigas que eram apenas manuais; reativar pelo painel. Manter backup conforme a operação da instituição. Detalhes e proteções em [Proteção dos dados — retenção](protecao-dados.md#retenção).

| Sintoma | Conferir |
| --- | --- |
| PrismaClient não inicializado/modelos ausentes | Geração Prisma no mesmo ambiente/volume que executa o backend; usar o override da seção 8 |
| Tabela inexistente | Executar `prisma migrate deploy` antes da aplicação atualizada |
| Erro de chave ou dado legado | Conferir chaves originais e executar a simulação de conversão; não regenerar chaves para tentar reparar |
| `auth:setup` diz que já existe conta | Entrar com ADMIN existente e gerenciar contas pelo painel; setup não é recuperação de senha |
| Login/origem recusado | Usar origem exata presente em PANEL_ORIGINS; conferir proxy e cookies |
| POST do webhook retorna 403 | Conferir META_APP_SECRET, assinatura e preservação do corpo pelo proxy |
| Webhook retorna 503 | Conferir segredo configurado, disponibilidade do banco e migrações |
| Bot não responde apesar do ACK 200 | Consultar filas, logs, tokens Meta e eventuais itens DEAD/UNKNOWN |
| Menu funciona, mas conversa livre falha | Conferir URLs/modelos Ollama e carga compatível de KnowledgeBase |
| Alteração visual não aparece | Recriar frontend com dependências corretas e atualizar o navegador com Ctrl+F5 |
| Aviso de `version` obsoleto no Compose | É aviso do campo histórico do YAML; verificar o resultado do comando, não confundir com falha de inicialização |

## 13. Implantação no PROCON

O Compose atual não é a configuração final de produção. Essa etapa ainda precisa contemplar imagens executando artefatos compilados, frontend estático, HTTPS/reverse proxy com `/api` na mesma origem do painel, secrets, monitoramento e política de backup/restauração.

No backend de produção, configurar `NODE_ENV=production` e origens HTTPS exatas em `PANEL_ORIGINS`. O proxy do Vite é de desenvolvimento. As portas estão em loopback por padrão; acesso de outras máquinas exige uma implantação de rede/origens/HTTPS coerente, não apenas trocar localhost por um IP.

Não é necessário tornar o painel administrativo público para a Meta receber mensagens. O webhook precisa ser alcançável pela Meta; o painel pode ficar restrito à rede/equipe, conforme a implantação definida.

## Referências internas

- [Autenticação e gestão de contas](autenticacao-painel.md)
- [Proteção dos dados e retenção](protecao-dados.md)
- [Webhook Meta](webhook-meta.md)
- [Agenda compartilhada](agenda-compartilhada.md)
- [Inbox/outbox e manutenção](mensagens-duraveis.md)
- [Eventos e indicadores](eventos-analytics.md)
- [Testes e CI](testes-ci.md)
- [Tailwind no frontend](tailwind-frontend.md)

Este guia usa os nomes de serviços, scripts e variáveis do código atual. Documentos históricos podem mencionar nomes antigos ou arquitetura planejada; para os comandos operacionais atuais, seguir este arquivo.
