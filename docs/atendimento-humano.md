# Contexto: atendimento humano pelo painel

Proposta: nova página Conversas com fila, acompanhamento do bot em tempo real, solicitação de humano, assumir/transferir/encerrar/devolver ao bot, histórico com autoria e responsáveis identificados pelo servidor. Mensagens do funcionário usam a Cloud API existente, sem WhatsApp Web ou número individual.

Base existente: React/Vite, Express/Prisma/PostgreSQL, Meta API, ChatLog/UserSession e histórico atualmente vinculado à agenda. Login anterior era admin/admin validado no navegador, sem autenticação de API.

Projeto do módulo futuro:
- Atendimento persistente independente da expiração de 30 minutos da sessão do bot e independente de agendamento presencial.
- Estados bot, aguardando humano, atendimento humano e encerrado. Responsável persistido e tomada de controle atômica para impedir dois atendentes simultâneos.
- Tomada de controle coordenada com envios. Invalidar geração de IA em andamento e avisos pendentes antes de confirmar o controle humano. Não reativar o bot porque o funcionário atualizou/fechou o painel.
- SSE autenticado para eventos e notificações no painel aberto; HTTP para comandos e mensagens. Web Push para navegador fechado é etapa adicional.
- Registrar mensagens antes de rotear, incluindo botões e representação de mídias; distinguir consumidor, bot e funcionário. Guardar ID da Meta, estados de entrega e deduplicação persistente. Tratar reenvio/timeout sem prometer entrega exatamente uma vez.
- Histórico paginado e retomada após desconexão; notas internas separadas do conteúdo enviado ao consumidor.
- Respeitar janela de 24 horas desde a última mensagem do consumidor; fora dela, usar template aprovado. Operador humano não elimina essa regra.
- Primeira entrega: autenticação real, fila, histórico, texto, assumir/encerrar/devolver e notificações com painel aberto. Depois anexos completos, presença/digitação e notificações externas.

Referências: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages e https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events .

## Etapa 1 — Pedido e fila inicial

O webhook usa o inbox durável existente. O comando `atendente` e pedidos diretos como “passa pra um atendente falar comigo” seguem sem IA. Para outras formulações no chat livre, o classificador distingue `ATENDIMENTO_HUMANO_CHAT`, `CANAL_ATENDIMENTO_INDEFINIDO` e `AGENDAMENTO` antes da busca jurídica. Pedidos sem indicação de horário ou comparecimento exigem escolha entre **Falar por aqui** e **Agendar presencial**. A escolha pode ser feita pelo botão ou pelo texto da opção apresentada. O menu principal conserva os três botões e, quando o recurso está ativo, ensina o comando por texto.

`HumanHandoff` guarda um pedido por índice HMAC do telefone. Fila, evento, confirmação pela outbox e conclusão do receipt fazem parte da transação do turno. Mensagens comuns do bot que ainda estão pendentes são descartadas ao enfileirar. Envios já iniciados não podem ser recolhidos. Enquanto aguarda, o contato não entra no fluxo normal do bot, mesmo que a sessão expire. As mensagens recebidas ainda são registradas no histórico existente, protegido da limpeza enquanto o pedido está aberto. A resposta de crise permanece disponível.

Para uma instalação de teste, aplique a migração `20261119000100_human_handoff_queue` e gere o cliente Prisma. `HUMAN_HANDOFF_ENABLED` começa desativada. Mantenha a flag desativada no número de uso até existir uma operação para assumir e encerrar os pedidos. A primeira etapa ainda depende de uma nova etapa para tomada de controle, autoria humana, histórico consolidado no painel e notificações.

A validação pontual cobriu 11 mensagens fictícias, sete classificadas pelo Gemma e quatro por regras diretas. Incluiu agendamento, horário, negação, citação e atendimento de outra empresa. O teste PostgreSQL usou o inbox e a outbox reais com dados fictícios, sem envio pela Meta. A migração foi testada em banco descartável.

## Etapa 2 — Controle e troca de mensagens

O backend mantém a fila e o responsável no PostgreSQL. A tomada de controle verifica a versão e usa os locks do inbox e da outbox. Em caso de conflito, a API retorna HTTP 409. Envios em andamento e respostas humanas ainda pendentes precisam avançar antes de mudar o controle. Uma falha definitiva ou um envio incerto permanece no histórico para revisão e a fila avança. Saídas pendentes do bot de uma fase anterior são descartadas. Quando chega um comando direto de atendimento enquanto o modelo processa um relato anterior, a resposta jurídica ainda não enfileirada é suprimida.

O responsável envia texto, encerra ou devolve ao bot. Um ADMIN pode encerrar ou devolver uma conversa da equipe. Ao finalizar, as sessões abertas do bot são encerradas. A próxima mensagem do consumidor inicia uma sessão limpa, e um novo pedido pode colocar o contato de volta na fila. O contexto anterior continua disponível no histórico enquanto a retenção o preservar.

| Método | Rota | Entrada |
| --- | --- | --- |
| GET | `/api/conversations` | `cursor` opcional |
| GET | `/api/conversations/:id/messages` | `cursor` opcional |
| POST | `/api/conversations/:id/claim` | `version` |
| POST | `/api/conversations/:id/messages` | `version`, `requestId` UUID e `text` |
| POST | `/api/conversations/:id/close` | `version` |
| POST | `/api/conversations/:id/return` | `version` |

Lista e histórico retornam até 50 itens, do mais recente para o mais antigo, e `nextCursor` quando há outra página. Atendentes veem a fila e seus próprios atendimentos. ADMIN pode consultar os demais. A autoria das respostas vem da sessão autenticada. Repetir o mesmo `requestId` com o mesmo texto e versão devolve o registro original. HTTP 202 indica gravação na outbox. O histórico distingue esse estado de confirmação da Meta, entrega, leitura, falha ou resultado incerto. As mensagens antigas seguem a granularidade do `ChatLog` existente.

A janela de 24 horas é calculada a partir do timestamp da mensagem de entrada da Meta e conferida de novo pela outbox antes do envio. Reentregas do webhook preservam o timestamp original. Uma resposta que vence enquanto espera na fila é marcada como descartada. Fora da janela, o fluxo de texto aguarda uma nova mensagem do consumidor. Os status do webhook assinado atualizam o histórico de entrega com idempotência.

Em instalação de teste, aplicar também a migração `20261119000200_human_handoff_control`. A flag continua desativada por padrão. A próxima etapa agrega a página Conversas, as atualizações em tempo real e a validação com WhatsApp de teste.

Validação local com 184 testes sem banco aprovados, dois ignorados e 28 testes PostgreSQL aprovados. O cenário novo usa o caminho HTTP autenticado, inbox, outbox e webhook assinado, com dados fictícios e transporte Meta simulado. Typecheck, build, migrações em bases descartáveis e smoke passaram.

## Etapa 3 — Painel Conversas e atualizações ao vivo

ADMIN e ATTENDANT acessam **Conversas**. A página reúne a fila de espera, os atendimentos da equipe conforme a permissão, sessões em andamento com o bot e o histórico. A conversa selecionada exibe mensagens em ordem cronológica, com paginação e autoria. O responsável pode responder por texto, devolver ao bot ou encerrar. O painel acompanha o estado de entrega e sinaliza quando a janela de WhatsApp está fechada. Uma tentativa de envio que falha no navegador conserva o identificador para evitar duplicidade ao repetir o mesmo texto.

O painel mantém uma conexão autenticada com `GET /api/conversations/events`. O backend verifica mudanças no PostgreSQL a cada 2,5 segundos por conexão e transmite avisos de atualização com contagem da fila. Mensagens e dados da conversa são buscados pelos endpoints HTTP, com autorização própria. O stream revalida a sessão a cada verificação. Na reconexão, o painel recarrega a lista e a conversa aberta. O aviso de novo pedido aparece dentro do painel, inclusive nas outras páginas. Em implantação com proxy reverso, preservar streaming e evitar buffering nesta rota.

As abas da fila usam `GET /api/conversations?view=waiting|active|history`. A observação de sessões do bot usa `GET /api/conversations/bot` e `GET /api/conversations/bot/:id/messages`. O acesso por essa última rota termina quando a sessão fecha ou a conversa entra na fila humana. As regras de responsável passam a controlar o histórico do atendimento a partir desse ponto.

Para um piloto, usar `HUMAN_HANDOFF_ENABLED=true` e `HUMAN_HANDOFF_TEST_PHONE` com o número **remetente** no formato entregue pela Meta, só dígitos e com DDI e DDD. O filtro restringe tanto o gatilho no WhatsApp quanto os dados do piloto no painel. Aplicar as duas migrações do módulo e gerar o cliente Prisma antes de iniciar. O teste do comando direto e da resposta humana dispensa o Kaggle. Ativar em toda a instalação é uma decisão separada do piloto.

Validação em 19/11/2026. Lint e build do frontend, typecheck e build do backend, 184 testes sem banco (dois ignorados), 28 integrações PostgreSQL e o teste final focado do stream passaram. No piloto real via ngrok, o usuário enviou `atendente` pelo WhatsApp, assumiu pelo painel e confirmou o recebimento da resposta. O backend registrou a passagem de `WAITING` para `ACTIVE` e recebeu o status `read` da Meta. O piloto local ficou limitado ao remetente de teste e a configuração versionada mantém a ativação desabilitada por padrão.

## Avisos, assinatura e posição na fila

Assumir ou devolver uma conversa ao bot enfileira um aviso na mesma transação da mudança de controle. O histórico do painel acompanha a entrega. A janela de atendimento precisa estar aberta para enfileirar e enviar o aviso. O painel sinaliza quando o aviso não pôde ser enfileirado. Versões antigas são descartadas para evitar enviar um aviso depois que o controle já mudou novamente.

Em **Usuários e acessos**, o ADMIN pode cadastrar o **Nome público no WhatsApp**. O texto enviado começa com esse nome em negrito e uma linha em branco. Contas sem nome público assinam como **Atendente do PROCON**. O limite de texto desconta o espaço usado pela assinatura. A migração `20261119000300_panel_display_name` adiciona o campo.

A posição é calculada sobre os pedidos em espera, ordenados pela entrada. O aviso inicial informa a posição daquele momento. Durante a espera, o consumidor pode digitar `posição` para consultar novamente. O atendimento pode ser escolhido fora da ordem pelo painel, portanto a posição não é uma previsão de tempo. A integração usa a [Cloud API de mensagens](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api), que não documenta a edição do texto de mensagens já enviadas.

Durante a espera, o consumidor pode tocar em **Sair da fila** ou digitar `sair da fila`. O mesmo turno cancela a espera, invalida avisos pendentes e enfileira o menu com a confirmação. O botão só atua enquanto o pedido estiver em espera.

## Reprodução de áudio sob demanda

Áudios enviados durante a espera ou atendimento humano aparecem no histórico de **Conversas**. O backend guarda apenas a referência criptografada da mídia junto ao registro, que segue a retenção do histórico. O bot continua orientando pelo texto e apresenta o caminho para falar com a equipe quando recebe áudio fora do atendimento humano.

Ao clicar em **Ouvir áudio**, o servidor aplica as permissões do histórico, busca uma URL temporária na Meta e entrega o arquivo com limite de 16 MiB e sem cache. O arquivo passa pela memória durante a reprodução. A expiração ou indisponibilidade da mídia aparece no painel. A migração `20261120000100_chat_audio_reference` adiciona a referência opcional. [Download de mídia da Meta](https://www.postman.com/meta/whatsapp-business-platform/request/ptjyi84/retrieve-media-url)

Cada consumidor tem uma fila de saída e um controle por contato. Um envio pendente de resposta da Meta para um consumidor pode avançar em paralelo com um envio para outro. A disputa para assumir o mesmo contato segue protegida pela versão e pelo lock.
