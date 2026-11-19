# Eventos e analytics funcionais

## O que mudou

O dashboard de ADMIN consulta `/api/analytics?days=7|30|90`, agora montado atrás das mesmas proteções de autenticação/perfil do painel. Foram removidos percentuais, tendências e resultados fixos, a falsa equivalência entre quantidade de nós e resolução e filtros que não consultavam o backend. Erro de banco retorna 503 e aparece como erro no painel; não vira um conjunto de números zero.

O filtro usa dias civis completos de Brasília, incluindo hoje, com início incluído e fim excluído. Dias sem eventos aparecem com contagens zero. Uma taxa sem denominador aparece como “—”, e não como 0% ou valor demonstrativo. A data inicial da coleta é informada; o histórico anterior não foi reconstruído a partir de transcrições ou de conclusões presumidas.

## Eventos mínimos

`ConversationEvent` guarda tipo, horário, identificador interno de sessão, IDs de nós/opções, categoria predefinida, etapa, tipo de resposta, nota e origem quando aplicável. Não aceita texto livre, telefone, CPF, nomes ou JSON arbitrário. O identificador de sessão é pseudônimo e ainda pode ser relacionado operacionalmente à sessão existente; não se trata de anonimização irreversível. A API do dashboard entrega somente agregações, sem expor esses identificadores.

Tipos registrados:

- CONVERSATION_STARTED e TURN_RECEIVED.
- CATEGORY_SELECTED e QUESTION_SELECTED.
- ANSWER_PREPARED: resultado do pipeline ou orientação terminal do menu, incluindo pergunta de esclarecimento ou encaminhamento. Não conta cada mensagem de navegação/coleta e não comprova entrega pelo WhatsApp.
- USER_CONFIRMED_RESOLUTION e USER_REJECTED_RESOLUTION: respostas válidas aos botões “Ajudou, obrigado” e “Não ajudou”. Os nomes internos não significam que o problema jurídico foi resolvido.
- SCHEDULE_OFFERED e APPOINTMENT_CREATED.
- HANDOFF_REQUESTED: pedido de pessoa reconhecido pelo fluxo, sem afirmar transferência realizada.
- RATING_SUBMITTED: avaliação opcional, com valores 1, 3 e 5.
- CONVERSATION_ENDED e CONVERSATION_ABANDONED: encerramento ou expiração técnica por inatividade, sem presumir satisfação/desistência.

No fluxo de produção, os eventos participam da transação da inbox junto ao estado, reserva, avaliação, logs e outbox. Se houver rollback, o evento também reverte. Reentrega de webhook não executa outro turno; reserva e início de sessão têm ainda chave de unicidade própria. Respostas antigas de botões não repetem avaliação/confirmação. Um primeiro comando “menu” usa a sessão recém-criada, evitando abrir uma segunda sessão vazia só para mostrar o menu.

Os títulos apresentados nos rankings são os títulos atuais dos nós administráveis; se um nó tiver sido removido, aparece “Item removido do menu”. Os eventos preservam o ID e a contagem, sem duplicar textos do menu ou transcrições no ledger.

## Definições dos indicadores

| Indicador | Cálculo no período selecionado |
| --- | --- |
| Sessões com eventos | IDs de sessão distintos com eventos de origem WhatsApp; pode incluir expiração de uma sessão iniciada antes do período |
| Novas sessões | Eventos CONVERSATION_STARTED registrados quando o sistema cria a sessão; sessões antigas observadas após a atualização não recebem um início inventado |
| Turnos recebidos | TURN_RECEIVED; textos agrupados pela inbox contam como um turno |
| Respostas preparadas | ANSWER_PREPARED; inclui menu, orientação, resposta fixa, esclarecimento e encaminhamento |
| Pedidos de atendente | Sessões distintas com HANDOFF_REQUESTED; não é taxa de transferência para atendimento humano |
| Agendamentos criados | APPOINTMENT_CREATED no período, incluindo painel e WhatsApp, mesmo se depois cancelados; não usa a data marcada como data de criação |
| Orientação ajudou | Confirmações / (confirmações + rejeições) dos botões pós-resposta; conta respostas, não consumidores distintos |
| CSAT: Ajudou | Notas 5 / total de avaliações; a nota 3 não é classificada como satisfeita |
| Média de avaliação | Média de notas 1, 3 e 5, com a quantidade de avaliações mostrada |
| Agendamento após oferta | Sessões que tiveram oferta e criaram reserva pelo WhatsApp no período / sessões com oferta no período; ofertas repetidas na mesma sessão contam uma vez |
| Expiração por etapa | Eventos CONVERSATION_ABANDONED agrupados pela etapa na expiração |

Uma reserva originada em oferta anterior ao período aparece no total de agendamentos criados, mas não no numerador da conversão daquele período. Por dia, uma sessão pode aparecer em mais de uma data; somar sessões diárias não equivale à quantidade de sessões distintas no período.

Não há métrica de resolução do conflito de consumo, retenção, transferência efetiva, fila humana ou comparação percentual com período anterior sem dados que a sustentem.

## Expiração por inatividade

O prazo já aplicado na retomada da conversa permanece: 30 minutos normalmente e 24 horas enquanto coleta assunto/nome/CPF/data/horário para agendar. Um worker confere até cinquenta sessões elegíveis por minuto. Usa os mesmos locks PostgreSQL por telefone da inbox, ignora sessões bloqueadas por processamento ativo e sessões com entrada pendente/DEAD, preservando o contexto até a fila ser tratada.

Sessão em READY expira como CONVERSATION_ENDED; etapas que aguardam interação expiram como CONVERSATION_ABANDONED, com a etapa registrada. O encerramento usa o estado FINISHED já existente. `status=RESOLVED` é um legado técnico do estado FINISHED e não alimenta a taxa “Orientação ajudou”. O mecanismo não apaga sessões, agendamentos, mensagens ou avaliações. A limpeza por prazo continua desativada enquanto o PROCON não aprovar retenção.

Uma expiração sem nova mensagem pode ser registrada no próximo ciclo do worker. Se houver mais de cinquenta sessões elegíveis, os próximos ciclos continuam o trabalho. A retomada por mensagem também registra a expiração quando necessário. A chave `expiry:sessionId` impede registrar duas vezes.

## Instalação e verificação

Migração aditiva: `20261117000200_functional_events`. Gerar o cliente Prisma e executar `prisma migrate deploy` antes do backend atualizado. Não precisa de seed, alteração de chaves ou Kaggle. Foi criado backup criptografado antes da aplicação local.

Resultado validado: 85 testes locais aprovados e dois skips históricos; 16 verificações PostgreSQL aprovadas, incluindo os subtestes novos; reconstrução de cinco bancos descartáveis sem divergência e smoke do backend compilado. Frontend passou em lint e build.

Os testes exercitam o menu, confirmação, avaliação, pedido de pessoa e reserva reais através da inbox, reentrega sem contagem repetida, rollback, fronteiras de data em Brasília, taxas/denominadores, dados vazios, privacidade das respostas, autorização ADMIN e expiração sem prejudicar coletas de 24 horas ou mensagens pendentes. Não foi feito envio real pelo WhatsApp, teste de carga ou validação visual manual do dashboard nesta etapa.

## Continuidade

Esta etapa cobre os dados e o funcionamento do dashboard, reutilizando os estilos existentes. A próxima etapa solicitada pelo usuário é a melhoria do design do painel administrativo. Parar ao concluir e pedir confirmação antes de iniciar essa revisão visual.
