# Testes e integração contínua

## O que executa

O workflow `.github/workflows/ci.yml` roda dois jobs com Node 24 em pushes para `main`, `dev`, `chat-support` e `feat/**`, em PRs para `main`/`dev` e sob execução manual. Um push com vários commits dispara uma execução para o evento.

- Frontend: npm ci, ESLint e build com checagem TypeScript.
- Backend: npm ci, geração Prisma, tipos, build e suíte sem serviços externos; PostgreSQL com pgvector para integrações reais; reconstrução completa por migrate deploy e comparação com schema; preservação de fixture ao reaplicar compatibilidade; inicialização do JavaScript compilado, conferindo health 200 e API sem sessão 401.

Há limite de tempo, cancelamento de execução antiga da mesma referência e permissão contents:read. Não há deploy, seed com embeddings, teste contra WhatsApp ou uso de credenciais reais. O workflow só será executado no GitHub quando as mudanças forem enviadas ao repositório; não foi disparado remotamente nesta etapa. [Referência do GitHub para serviços PostgreSQL](https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers).

## Executar localmente

Backend (a partir de backend, depois de npm ci e npx prisma generate):

```powershell
npm run check
```

Combina typecheck, build e npm test. O build agora vai para dist, inclui somente src, e `npm start` encontra dist/index.js; não gera JavaScript/declarations no meio da árvore de fontes. A checagem de tipos continua incluindo scripts e testes e ignora dist.

Frontend, em frontend:

```powershell
npm ci
npm run lint
npm run build
```

Para PostgreSQL descartável, na raiz:

```powershell
docker compose -f compose.tests.yml up -d --wait
cd backend
$env:TEST_DATABASE_URL = 'postgresql://ci:ci-only-disposable@127.0.0.1:55432/procon_ci_control'
npm run build
npm run test:integration
Remove-Item Env:TEST_DATABASE_URL
cd ..
docker compose -f compose.tests.yml down
```

Esse Compose tem projeto próprio, porta 55432 e armazenamento temporário; não usa o volume/banco do sistema. A credencial mostrada é fictícia e exclusiva desse serviço de testes local, publicado apenas em loopback.

O runner não lê backend/.env: gera chaves criptográficas efêmeras, substitui tokens Meta por valores fictícios e desabilita URLs reais do Ollama. Cada arquivo de teste roda em processo isolado. O modo sem banco exclui arquivos postgres. O modo de integração exige TEST_DATABASE_URL apontando a uma base procon_ci_* e cria três bancos com sufixos aleatórios, exclusivos de auth, privacidade e agenda. Apaga apenas os bancos que criou, inclusive se houver falha. Nunca apontar os testes a um servidor de produção; usar a instância descartável acima. A conta do serviço precisa criar bancos e instalar vector.

Os comandos especializados antigos (test:ux, test:auth, test:privacy e test:webhook) continuam disponíveis para depuração; o isolamento de ambiente consolidado é aplicado por npm test / test:integration. O benchmark tests/llm/run-eval.ts permanece manual e fora do CI.

O runner descobre automaticamente os arquivos `.test.ts` nas pastas configuradas: `ux`, `auth`, `privacy` e `webhook` no modo sem banco; arquivos com `postgres` no nome em `auth`, `privacy`, `appointments`, `messaging` e `analytics` nas integrações. Um arquivo colocado em outra pasta precisa ser incluído no runner. Avaliações reais, replays e testes de recuperação em `tests/llm` não são acionados pelo workflow. O número de casos pode crescer: acompanhar duração, estabilidade e utilidade das verificações, sem remover regressões importantes apenas para reduzir a contagem.

## Cobertura relevante

O backend mede cobertura de linhas, branches, funções e instruções com [c8](https://github.com/bcoe/c8). A configuração inclui os arquivos TypeScript em `backend/src`, inclusive os que nenhuma suíte carregou. Scripts, testes, dependências e artefatos compilados ficam fora da medição.

Em `backend`, `npm run test:coverage` mede a suíte sem banco. Para medir a integração, siga a preparação do PostgreSQL descartável acima e use `npm run test:coverage:integration` no lugar de `npm run test:integration`. Abra `coverage/unit/index.html` ou `coverage/integration/index.html` para ver os trechos descobertos. Cada pasta também contém `coverage-summary.json`.

O job de backend da CI executa cada suíte uma vez, com a cobertura habilitada, e publica os relatórios no artefato `backend-test-coverage` da execução. Os percentuais são independentes e podem cobrir as mesmas linhas. Compare cada suíte com sua própria linha de base. Nesta etapa, falhas de testes continuam bloqueando a CI e os percentuais servem para diagnóstico, sem mínimo obrigatório. O frontend segue com lint e build. Benchmarks e serviços reais de IA/WhatsApp ficam fora da medição.

Linha de base local de 19/11/2026, com Node 24 e 78 arquivos TypeScript em cada relatório.

| Suíte | Linhas | Branches | Funções | Instruções | Resultado |
| --- | ---: | ---: | ---: | ---: | --- |
| Sem banco | 71,46% | 86,99% | 67,95% | 71,46% | 184 aprovados, 2 ignorados |
| PostgreSQL | 80,73% | 70,82% | 88,76% | 80,73% | 26 aprovados |

Na integração, `durableInbox.ts` e `retention.ts` atingiram 100% de linhas e `durableMessages.ts` atingiu 93,20%. Para revisar um fluxo crítico, abra o arquivo no HTML e confira as condições e os caminhos de falha exercitados. Cobertura de linhas indica execução, enquanto a qualidade das asserções depende dos casos testados.

A retenção automática substitui a simulação operacional por exclusão real periódica. Resultado: 184 aprovações sem banco, dois skips históricos e 26 aprovações PostgreSQL; tipos/build do backend e lint/build do frontend aprovados. O teste em banco exclui conversa com 31 dias e histórico sob política de 30 dias, preserva conversa com 29 dias e sessão antiga com receipt pendente, verifica cadência horária persistida, duas instâncias, edição de prazo e revogação concorrente. Testes do worker cobrem falha/retry sem conteúdo pessoal no log, ausência de sobreposição e shutdown aguardando a operação atual. As cinco bases foram reconstruídas sem divergência e o smoke compilado passou. Não houve uso de Kaggle/Meta ou exclusão de dados reais nos testes.

A configuração de retenção pelo painel acrescenta testes de valores/autorização e HTTP/PostgreSQL para ADMIN, atendente, senha temporária, origem, persistência, CAS, simulação, execução pelo comando e revogação enquanto uma execução aguarda o lock. Resultado: 182 aprovações sem banco, dois skips históricos e 26 aprovações PostgreSQL; tipos/build do backend e lint/build do frontend aprovados. A migração reconstruiu as cinco bases de teste sem divergência de schema e o smoke compilado passou. Não usa Kaggle ou WhatsApp.

A etapa de retenção de inbox/outbox acrescenta `tests/privacy/retention-postgres.test.ts`, descoberto automaticamente pelo runner de integração. Verifica TTL explícito, simulação sem exclusão, idempotência, vínculos de saída, pendências, estados para revisão, ausência de data terminal e lock do inbox. Resultado da etapa: 181 aprovações sem banco e dois skips históricos; 25 aprovações PostgreSQL, reconstrução de cinco bases sem divergência e smoke compilado aprovado. Tipos e build passaram. A suíte sem banco foi executada no container devido à falha conhecida `uv_os_get_passwd/ENOMEM` do tsx no Windows restrito. A limpeza real continua desativada; detalhes em [proteção dos dados e retenção](protecao-dados.md#retenção).

- Fluxo do bot, coleta/saída, menu, clarificação, agrupamento de mensagens, ordenação e proteção contra resposta de IA obsoleta.
- RAG com dependências simuladas, referência/prazo, reescrita fiel e minimização de identificadores.
- Autenticação, perfis, origem, cookies, senha temporária, revogação e concorrência do último administrador.
- Webhook: assinatura bruta, chave/corpo divergentes, parser e confirmação GET.
- Privacidade: criptografia/HMAC, migração, relações, transações, DTO e retenção em dados fictícios.
- Agenda real por HTTP: duas reservas concorrentes disputam uma vaga; só uma passa, outra recebe 409; duplicidade por consumidor, cancelamento e liberação de vaga. Esse teste revelou e corrigiu a resposta 500 do conflito de serialização retornado diretamente pelo adapter pg do Prisma; agora esse conflito recebe 409, sem expor detalhes do banco.
- Seed completo: cada opção é avaliada antes de truncamento; botões até 20 caracteres, títulos de itens de lista até 24; payloads reais montados pelo cliente são capturados em adaptador fictício, sem rede, verificando também IDs, seções, descrições e preservação das opções. Falha informa menu/opção/limite. O seed atual passou sem precisar alterar textos. [Limites documentados pela Meta](https://developers.facebook.com/docs/whatsapp/guides/interactive-messages/).

Não é cobertura de todos os cenários nem um teste visual do frontend. ESLint foi corrigido sem desabilitar globalmente regras: tipos explícitos, callbacks estáveis e carregamento com atualizações após resposta da API. Dois testes históricos do updateMenuUx permanecem pulados porque seus artefatos já tinham sido removidos; preservação do seed e limites do menu continuam testados.

## Lacuna histórica de migrações

A primeira migração continha apenas quatro tabelas e não reconstruía as funcionalidades atuais. Foi adicionada `20261115000000_restore_core_schema`, antes das migrações recentes na ordem de uma instalação limpa. Nenhuma migração já aplicada foi editada. A nova migração cria a estrutura faltante, remove a unicidade antiga de telefone em sessão e usa verificações de existência para compatibilidade com bases já atualizadas por db push.

Em bases muito antigas com ChatLog sem sessionId preenchido, ela interrompe e reverte sua transação, sem excluir ou adivinhar o histórico. Exige vinculação revisada antes de nova tentativa. Campos/enum já existentes com definição divergente não são corrigidos silenciosamente: revisar o diff, sem resetar uma base existente.

As integrações criam o banco exclusivamente por migrate deploy, sem db push, e usam migrate diff --exit-code para falhar quando o banco reconstruído divergir do schema. Referência: [Prisma migrate diff](https://www.prisma.io/docs/cli/v7/migrate/diff).

O banco local da aplicação não foi resetado nem usado como destino dos testes. A migração de compatibilidade foi posteriormente aplicada na instalação local, junto à etapa de agenda compartilhada, após backup criptografado. Ela também foi validada sobre schema atual com fixture preservada em bases isoladas. O CI não executa migrações no banco de produção.

## Estado e continuidade

Validação local: lint/build do frontend, tipos/build do backend, 65 testes sem banco aprovados e dois históricos pulados; quatro testes de integração PostgreSQL, reconstrução/verificação de schema e smoke compilado também executados. Nenhum Kaggle/ngrok foi necessário.

Encerrar esta etapa e pedir autorização antes de iniciar as próximas mudanças do plano. CI não mede precisão do modelo: o benchmark manual continua necessário quando a etapa alterar prompts/modelos/RAG.

Etapa seguinte autorizada e concluída: [estados tipados da conversa](estados-conversa.md), com novos testes de retomada e transações, agora totalizando 74 testes locais aprovados e quatro integrações PostgreSQL. O smoke com Kaggle continua manual, fora do CI.

A etapa posterior de [agenda compartilhada](agenda-compartilhada.md) acrescenta políticas de capacidade/bloqueios e testes reais de reservas concorrentes, alterações administrativas e preservação das marcações existentes. A suíte local passa a 79 aprovações e dois skips históricos; a integração inclui cinco testes PostgreSQL.

A etapa de [mensagens duráveis](mensagens-duraveis.md) acrescenta uma quarta base descartável exclusiva de inbox/outbox. O runner também executa `tests/messaging/*postgres.test.ts`, com falhas de processamento/envio, retomada, locks e preservação da ordem. Não usa tokens reais ou Kaggle. A suíte local atual tem 83 aprovações e dois skips históricos; inclui também a correção de agendamento pelo classificador.

Integração local dessa etapa: 11 aprovações incluindo subtestes, schema sem divergências nas quatro bases e smoke compilado aprovado.

A etapa de [eventos e analytics](eventos-analytics.md) acrescenta uma quinta base descartável e `tests/analytics/*postgres.test.ts`: eventos de jornadas, fórmulas/denominadores, datas de Brasília, privacidade, permissões e expiração. Resultado atual: 85 aprovações locais, dois skips históricos e 16 aprovações PostgreSQL incluindo subtestes; lint/build do frontend, tipos/build, comparação de schema e smoke compilado aprovados.

A correção do inbox acrescenta testes de leases em banco real e HTTP local simulando Ollama: exclusividade, paralelismo entre telefones, espera sem transação, heartbeat, recuperação, fencing, CAS, falha no commit e ausência de duplicação. Classificação, embedding, geração, reescrita e fallback são exercitados sem Kaggle. O runner continua reconstruindo as cinco bases descartáveis e verificando o schema.

Resultado da etapa de leases: 85 testes locais aprovados e dois skips históricos; 24 aprovações PostgreSQL incluindo subtestes, cinco bases sem divergência e smoke compilado aprovado. No Windows, o runner local apresentou uv_os_get_passwd/ENOMEM ao carregar tsx no ambiente restrito; a suíte completa passou no container.

A [auditoria jurídica — etapa 1](auditoria-seguranca-juridica.md) acrescenta vinte cenários sem modelo real: cinco controles passam e quinze reproduzem lacunas conhecidas, marcadas como TODO executável. Resultado: tipos/build aprovados, 90 testes aprovados, dois skips históricos e quinze TODOs. Esses TODOs não quebram o CI e não comprovam proteção; devem ser resolvidos e convertidos em asserções obrigatórias nas próximas etapas. A baseline do Gemma permanece inalterada.

A [base auxiliar — etapa 2](base-auxiliar-juridica.md) acrescenta sete testes de schema, fontes, revisão, fatos, prazos e abstenção. Resultado no container: tipos/build aprovados, 97 testes aprovados, dois skips históricos e quinze TODOs. Os rascunhos não participam do RAG; os TODOs da auditoria não foram promovidos a proteções implementadas.

A [integração seletiva — etapa 3](integracao-regras-juridicas.md) acrescenta sete testes de contexto e empacotamento do catálogo no build. Resultado local: 104 aprovações, dois skips históricos e quinze TODOs. A prévia é opt-in e não aprova rascunhos nem altera a baseline do benchmark. O teste HTTP/PostgreSQL do inbox também exerce geração com regras auxiliares.

Verificação PostgreSQL da etapa 3: 24 aprovações incluindo subtestes, cinco bases descartáveis sem divergência e smoke compilado aprovado. A [comparação real com o Gemma](validacao-regras-juridicas-2026-11-17.md) foi executada após confirmação do Kaggle: integração exercitada, melhora no marco de vício oculto e falha de aplicabilidade persistente no PIX. Não substitui benchmark amplo nem resolve os quinze TODOs.

A [etapa 4](barreiras-juridicas.md) transforma os vinte contratos da auditoria em verificações obrigatórias e adiciona variações/controles. Resultado final local: 142 aprovações, dois skips históricos, zero TODOs, tipos/build aprovados. Integração: 24 aprovações PostgreSQL incluindo subtestes e smoke compilado aprovado. A [rodada real ampliada](validacao-ampliada-etapa4.md) cobriu 39 entradas; o replay posterior preserva gerações e baseline, sem apresentar bloqueios como novos acertos do modelo.
