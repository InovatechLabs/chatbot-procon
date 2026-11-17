# Proteção e minimização de dados pessoais

Etapa autorizada depois da autenticação. Implementação própria, sem copiar outros projetos. Não requer Kaggle/Ollama: todos os testes desta etapa usam respostas de IA simuladas. Esta entrega reduz exposição técnica e não declara, por si, conformidade integral com a LGPD.

## Armazenamento

O cliente compartilhado em `backend/src/database/index.ts` aplica a proteção ao acessar os modelos pessoais. A aplicação continua trabalhando com valores recuperados em memória; o PostgreSQL guarda os campos protegidos com AES-256-GCM, nonce aleatório de 12 bytes e tag de 16 bytes. O contexto autenticado distingue modelo/campo. Envelope `enc:v1:<iv>:<tag>:<ciphertext>`. Texto legado, chave ausente/incorreta ou falha de autenticação não viram texto em claro por fallback.

| Modelo | Campos criptografados |
|---|---|
| UserSession | Telefone, nome, CPF |
| ChatLog | Telefone, texto da mensagem |
| Appointment | Telefone, nomes, CPF, assunto/categoria, resumo e observações |
| SessionFeedback | Telefone, comentário e observações da equipe |

`phoneLookup` e `cpfLookup` guardam HMAC-SHA256 para igualdade, com chave independente e separação por tipo. Filtros de telefone/CPF são traduzidos para os índices; normalização ignora pontuação em números reais e preserva identificadores sintéticos do eval. As variantes brasileiras de telefone continuam tratadas pelo serviço de agenda. HMAC também é dado pseudonimizado: não permite chamar o conjunto de dados de anônimo.

Transações e leitura de relações são cobertas. A extensão recusa escritas aninhadas nas relações protegidas e buscas textuais/ordenações incompatíveis com ciphertext, em vez de gravar dados desprotegidos. Novos modelos/relações sensíveis devem ser registrados em `protectedPrisma.ts` e testados. Não criar outro PrismaClient em funcionalidades comuns nem usar SQL bruto para dados pessoais; SQL bruto não passa pela proteção. Scripts de migração/testes usam cliente sem extensão deliberadamente. A base legal/RAG permanece sem criptografia para preservar busca vetorial.

## Chaves e migração

Dois segredos independentes de 32 bytes em base64: `DATA_ENCRYPTION_KEY` e `DATA_LOOKUP_KEY`. Localmente são gerados uma única vez no `.env` ignorado do backend, sem exibir valores. Não são enviados à IA nem gravados no banco. Produção deve injetá-los por armazenamento de secrets com controle de acesso; `.env` local não substitui isso. Referências: [OWASP — armazenamento criptográfico](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html) e [gestão de chaves](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet).

**Preservar as chaves e manter backup seguro separado do dump é obrigatório para recuperar os dados. Não substituir/apagar as chaves de uma base já criptografada.** O setup preserva valores existentes. Não há rotação automática nesta versão: exige procedimento de recriptografia e reconstrução de HMAC, em manutenção, com ambas as chaves antigas disponíveis.

Em outra instalação, bloquear entrada de mensagens e uso do painel durante a conversão. Depois, executar na raiz:

```powershell
docker exec backend_api npm run privacy:setup
docker exec backend_api npx prisma generate
# Fazer backup antes de alterar schema e conteúdo.
docker exec backend_api npx prisma migrate deploy
docker exec backend_api npm run privacy:migrate
docker exec backend_api npm run privacy:migrate -- --apply
docker exec backend_api npm run privacy:migrate
```

O último comando deve retornar zero alterações pendentes. A migração é idempotente, valida ciphertext e HMAC já existentes, preserva IDs, vínculos e datas, e usa lotes transacionais de 100 linhas. Exige manutenção: execução concorrente com usuários gravando dados não é suportada. Em caso de interrupção, manter o serviço fora de uso e repetir com as mesmas chaves. Não usar `db push` no banco existente.

Na execução local de 16/11/2026, a migração `20261116000300_personal_data_protection` foi aplicada e convertidos **91 sessões, 102 mensagens, 2 agendamentos e 4 avaliações**, sem exclusão. Simulação posterior retornou zero pendências.

Antes da conversão foi criado um dump SQL criptografado em `.private-backups/`, ignorado pelo Git. O script local `cd backend; npm run privacy:backup` usa Docker CLI e o container `database`; não funciona dentro do container backend sem acesso ao Docker. `npm run privacy:verify-backup` autentica o conteúdo sem exibir dados. A verificação passou; não foi feita restauração destrutiva no banco local. Recuperação: decifrar com a chave original e contexto `database-backup`, em ambiente restrito, e restaurar primeiro em uma base isolada. A cópia criptografada deve entrar no procedimento institucional de backup junto com a custódia separada da chave.

A migração não elimina cópias antigas, logs históricos do Docker, WAL, snapshots ou páginas antigas do PostgreSQL. Esses suportes precisam de proteção e descarte próprios; não executar limpeza destrutiva automática para tentar apagá-los.

## Painel e API

Listagem/criação/edição/cancelamento da agenda retornam DTO explícito: ID, telefone mascarado, nome necessário ao atendimento, assunto filtrado, horário, situação e origem. CPF, HMAC, observações internas e o objeto completo da sessão não são retornados. O status é mantido em maiúsculas no contrato da API usado pelo frontend.

O histórico continua restrito a ADMIN/ATTENDANT, paginado pelo limite existente, com filtros de identificadores nas mensagens. A consulta explícita `GET /api/appointments/:id/contact`, também autenticada e com `Cache-Control: no-store`, devolve somente o telefone integral. No painel, **Ver telefone** revela um contato por vez e **Ocultar telefone** recolhe. Nome e conversa ainda são dados pessoais autorizados para atendimento; não compartilhar capturas ou exportações indiscriminadamente.

Logs técnicos de erros de Meta, conversa e controllers não imprimem objetos de erro/payloads que possam conter tokens, telefone, texto do cidadão ou parâmetros SQL. Não foi implantado um produto de observabilidade nem modificadas métricas nesta etapa.

## Limite de envio à IA

No RAG, pergunta, histórico, consulta de busca e prompts são filtrados antes de classificação, embedding e geração. Nome/CPF/telefone cadastrados da sessão são removidos; CPF em formatos comuns, telefone, e-mail, CNPJ, CEP e alguns identificadores rotulados também recebem substituições. O cliente Ollama reaplica o filtro genérico como última barreira, incluindo reescrita de menu. Os testes verificam o conteúdo entregue às três etapas, preservando prazo, artigo e valor do relato.

**Não é anonimização universal de texto livre.** Nomes não cadastrados, endereços sem rótulo e identificadores escritos de forma incomum podem escapar de filtros determinísticos. Conteúdo arbitrário sensível, anexos/OCR e identificadores inéditos exigem tratamento adicional. Não afirmar que qualquer texto enviado à IA ficou completamente anônimo. Os limites de tamanho, validação jurídica e busca RAG anteriores continuam ativos.

## Retenção

Decisão do usuário: **não há prazos aprovados pelo PROCON; limpeza automática permanece desativada**. Não foi instalado agendamento de limpeza nem aplicada exclusão na base local.

`npm run privacy:retention` apenas simula. Sem prazos, não seleciona registros. Depois de aprovação institucional, configurar separadamente `RETENTION_SESSION_DAYS`, `RETENTION_APPOINTMENT_DAYS` e `RETENTION_APPROVED=true`; somente `npm run privacy:retention -- --apply` remove. Sessões antigas só são removidas se não houver agendamento vinculado ainda preservado; mensagens e avaliações são removidas em cascata. Agendamentos PENDING são sempre preservados, inclusive atrasados. Na simulação, sessões com agendamento elegível que ainda não foi removido não entram na contagem; avaliar novamente depois da remoção de agendamentos. Testes de exclusão usam apenas banco isolado fictício.

## Exposição de serviços

No Compose, backend, PostgreSQL e pgAdmin passam a publicar apenas em loopback. O painel também usa loopback por padrão; acesso pela LAN exige `PANEL_BIND_HOST` na configuração de implantação, origens exatas em PANEL_ORIGINS e HTTPS na instalação compartilhada. O túnel local para o webhook continua podendo alcançar localhost:3000.

pgAdmin deixou de ter a senha fixa `admin` no Compose e passou ao perfil opcional `tools`; configurar `PGADMIN_EMAIL` e `PGADMIN_PASSWORD` no `.env` da raiz antes de `docker compose --profile tools up -d pgadmin`. Alterar variáveis não redefine senha de conta já existente no pgAdmin. As mudanças de portas/perfil serão efetivadas ao recriar os containers; os containers atuais não foram recriados nem suas contas administrativas alteradas nesta etapa. Revisar contas antigas do pgAdmin antes de expor serviços à rede.

Autenticação/origens seguem em [autenticacao-painel.md](autenticacao-painel.md). Assinatura de webhook Meta, implantação TLS completa e demais fases do comparativo não foram antecipadas.

## Verificação e continuidade

- Cinco testes de privacidade aprovados, com PostgreSQL real isolado: migração e repetição, ciphertext e integridade, HMAC, relações, transações, API mascarada/contato autorizado, retenção e filtragem do RAG.
- Nove testes de autenticação aprovados; suíte UX com 50 aprovados e dois testes antigos pulados por remoção prévia do atualizador pontual do menu.
- Tipos do backend, build do frontend e sintaxe do Compose verificados. Não foi feito novo benchmark com modelo real nem teste manual pelo WhatsApp/navegador nesta etapa.
- Para reproduzir integração: criar uma base exclusiva `procon_privacy_test_*`, instalar extensão vector, configurar PRIVACY_TEST_DB_NAME e preparar com `node --import tsx tests/privacy/prepare-db.ts` dentro do backend. Esse preparador usa db push somente na base de teste. Depois executar `npm run test:privacy` com o mesmo nome; ele recusa nomes fora do prefixo.

Assinatura de webhook Meta foi autorizada e concluída depois desta etapa: ver [webhook-meta.md](webhook-meta.md), incluindo teste real via ngrok. Continuar solicitando autorização ao encerrar cada etapa. Retenção institucional e limites de texto livre ficam registrados como decisões/limitações, sem promessa de conformidade jurídica ou anonimização perfeita.
