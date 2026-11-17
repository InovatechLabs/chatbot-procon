# Testes e integração contínua

## O que executa

O workflow `.github/workflows/ci.yml` substitui a antiga checagem de containers ligados. Em push/PR para main e dev, ou execução manual, roda dois jobs com Node 24:

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

## Cobertura relevante

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
