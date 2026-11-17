# Autenticação do painel — etapa concluída

Escopo: autenticação e autorização (itens 1–5 da Fase 1 do comparativo). Não conclui a parte de proteção de dados/LGPD. Código próprio; nenhuma codebase de outro grupo foi copiada. Não depende de Kaggle, Ollama ou Meta.

## Funcionamento

- Contas `PanelUser` separadas dos consumidores e dos perfis da agenda. Usuário normalizado em minúsculas; senha de 12–128 caracteres, sem credencial padrão ou cadastro público.
- Hash com scrypt do Node: sal aleatório de 16 bytes, N=32768, r=8, p=3. É uma alternativa apropriada a bcrypt/Argon2, sem acrescentar dependência nativa. [Parâmetros recomendados pela OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Sessão aleatória de 256 bits; somente SHA-256 do token fica no PostgreSQL. Expira após 8 horas, inclusive se o painel continuar aberto. Login rotaciona a sessão apresentada; logout revoga a sessão no servidor; troca de senha revoga todas as sessões da conta.
- Cookie `procon_session`: HttpOnly, SameSite=Strict, Path=/api, Secure com `NODE_ENV=production`. Nenhum token ou flag autentica via localStorage.
- Mudanças de estado exigem Origin na lista `PANEL_ORIGINS`, inclusive login/logout. CORS aceita somente origens configuradas e permite credenciais. GETs administrativos também exigem sessão.
- Limite persistido de 10 tentativas por conta e 30 por IP por janela fixa de 15 minutos, compartilhado entre instâncias. Também conta logins bem-sucedidos. Respostas de credenciais inválidas não revelam se a conta existe.
- Backend relê estado ativo e papel a cada requisição. Não confia na função informada pelo navegador. Mudança de senha e criação de sessão são coordenadas transacionalmente.
- Contas criadas pelo painel e senhas redefinidas são temporárias. Até escolher uma senha pessoal diferente, a conta só pode consultar a própria sessão, alterar senha ou sair. A restrição também é aplicada na API.

## Permissões

| Operação | ADMIN | ATTENDANT |
|---|---|---|
| Agenda, disponibilidade, alterações e histórico vinculado | Sim | Sim |
| Nós e editor do fluxo | Sim | Não |
| Cadastro, edição, exclusão, ativação/desativação de contas, redefinição de senha e encerramento de sessões | Sim | Não |
| Alterar a própria senha e sair | Sim | Sim |

Todos os ADMIN possuem a mesma autoridade; não existe um papel ROOT separado. O administrador inicial é o responsável pela configuração, e pode cadastrar outros administradores se necessário. O servidor impede remover, desativar ou rebaixar o último ADMIN ativo, inclusive em operações simultâneas. Alterações de usuário/perfil/situação revogam todas as sessões da conta; reativá-la não recupera as sessões antigas. Senhas e hashes nunca aparecem na listagem. Exclusão é permanente; prefira desativação quando quiser preservar a conta. A exclusão só remove a conta do painel e suas sessões, sem excluir consumidores ou agendamentos.

Rotas administrativas passam pelo middleware antes dos controllers. Analytics já não estava montado no router: continua indisponível para ADMIN (404), sem passar a ser público; correção funcional fica para etapa própria. `/health` e `/api/webhook` permanecem públicos por necessidade operacional. Assinatura da Meta é uma etapa posterior, independente do login do painel.

## Preparação local

As migrações `20261116000100_panel_auth` e `20261116000200_panel_user_management` adicionam as tabelas de autenticação e o indicador de senha temporária, sem modificar os dados dos consumidores. Para outra instalação, a partir da raiz:

```powershell
docker exec backend_api npx prisma generate
docker exec backend_api npx prisma migrate deploy
docker exec -it backend_api npm run auth:setup
```

O último comando solicita usuário e senha oculta e cria somente o primeiro ADMIN. Havendo qualquer conta, recusa executar; a verificação é transacional e compartilhada com a gestão do painel. `auth:create-user` continua como alias de compatibilidade, com a mesma restrição. Para automação da configuração inicial, injetar AUTH_BOOTSTRAP_USERNAME e AUTH_BOOTSTRAP_PASSWORD por mecanismo de secrets. AUTH_BOOTSTRAP_ROLE=ATTENDANT não é mais aceito. Nenhuma conta real foi criada automaticamente nesta entrega.

Depois da configuração, entre no painel e abra **Usuários → Cadastrar conta**. Informe usuário, perfil e senha temporária; o padrão é Atendente. Entregue a senha por canal privado. No primeiro acesso o funcionário escolhe a senha pessoal e entra novamente. Use **Editar** para mudar nome de acesso, perfil ou ativação; **Redefinir senha** para fornecer outra senha temporária; **Encerrar sessões** para revogar os acessos atuais; **Excluir** para remoção definitiva, confirmando o nome da conta. Cada conta pode alterar a própria senha em **Alterar senha**. Alterar a própria conta pela gestão pode encerrar a sessão do administrador.

A senha de uma conta nunca pode ser consultada. Um ADMIN pode redefinir a senha de outro ADMIN. Não existe recuperação pública por e-mail nem desbloqueio automático pelo setup; se todos os administradores perderem suas credenciais, a recuperação exige intervenção do responsável pelo servidor no banco. Preserve acesso operacional e credenciais de recuperação conforme os procedimentos da instituição.

O Vite encaminha `/api` ao backend. Localmente usa localhost:3000; no Compose usa `API_PROXY_TARGET=http://backend:3000`. O painel continua em localhost:5173. Não é necessário rebuildar embeddings, executar seed ou alterar os modelos.

## Produção

Configurar `NODE_ENV=production` e `PANEL_ORIGINS=https://painel.seudominio` (origem exata, sem barra final; múltiplas separadas por vírgula). Servir frontend e `/api` pela mesma origem HTTPS usando um reverse proxy; a configuração proxy do Vite é apenas de desenvolvimento. O backend recusa iniciar em produção sem origens HTTPS explícitas.

O backend não confia em X-Forwarded-For. Atrás de proxy, o limite por IP pode ser agregado no endereço do proxy; só configurar trust proxy quando a topologia e os proxies confiáveis forem conhecidos. Não expor o backend para contornar o proxy. Revisão geral de portas, credenciais do pgAdmin, criptografia de consumidores e assinatura do webhook continuam pendentes nas próximas etapas; esta entrega não declara o sistema inteiro pronto para produção.

## Verificação

- `cd backend; npm exec -- tsc --noEmit`
- `cd backend; npm run test:auth`: testes de senhas, sessão, configuração, autorização, origem/CSRF e cookies; integração PostgreSQL fica pulada sem opt-in.
- Integração real: criar banco vazio com nome `procon_auth_test_*`, aplicar o SQL das duas migrações de autenticação, na ordem, e executar, no container, `docker exec -e AUTH_TEST_DB_NAME=procon_auth_test_20261116 backend_api npm run test:auth`. O teste troca somente o nome do banco na conexão existente e recusa nomes fora desse prefixo. Não executar migrations deploy nessa base contendo apenas as tabelas auth. Usar uma base exclusiva e vazia de contas: os testes também verificam a configuração inicial.
- `cd backend; npm run test:ux`: 50 passaram; dois testes do atualizador pontual do menu são pulados porque o script e seu snapshot já foram removidos anteriormente. O teste de preservação do menu continua ativo.
- `cd frontend; npm run build`: compilação e tipos do painel.

Resultado após a gestão de contas: nove testes de autenticação passaram, incluindo configuração inicial por CLI, operações HTTP de gestão, troca obrigatória de senha, revogação, exclusão, permissões e concorrência de bootstrap/último administrador em PostgreSQL real. Tipos do backend e build do frontend passaram. A suíte UX anterior teve 50 testes aprovados e dois pulados pelos arquivos pontuais removidos anteriormente.

Validado por HTTP e PostgreSQL real: sessão reconhecida entre duas instâncias, logout/troca de senha/desativação, limite concorrente compartilhado, cookie e bloqueio de rotas. Não foi realizado teste manual de navegação no navegador nesta etapa. A base isolada de teste não contém consumidores; o teste remove a conta fictícia ao terminar.

## Continuidade

Proteção/minimização foi autorizada e implementada na etapa seguinte: ver [protecao-dados.md](protecao-dados.md), incluindo limites e configuração das chaves. Assinatura Meta também foi concluída e validada com entrega real: ver [webhook-meta.md](webhook-meta.md). Continuar pedindo autorização ao terminar cada etapa. Planejamento de atendimento humano preservado em [planejamento/atendimento-humano.md](planejamento/atendimento-humano.md).
