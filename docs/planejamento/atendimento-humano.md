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
