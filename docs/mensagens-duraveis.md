# Inbox persistente e outbox do WhatsApp

## Comportamento

O webhook assinado valida/minimiza as mensagens e grava todos os novos IDs antes de responder 200. Se o banco falhar, responde 503. `MessageReceipt.metaMessageId` tem unicidade persistida: uma reentrega, inclusive após reinício, não cria outro turno. Lotes são persistidos em transação; nenhum item novo do lote fica confirmado apenas na memória.

Workers iniciados pelo `src/index.ts` procuram trabalho no PostgreSQL. São duas rotinas de entrada e duas de saída por processo. `FOR UPDATE SKIP LOCKED` e locks transacionais por identificador HMAC do telefone coordenam instâncias distintas. Mensagens do mesmo telefone seguem a sequência de recebimento no banco; outros telefones podem progredir em paralelo. Essa sequência representa a ordem em que o sistema recebeu os eventos, não reconstitui eventos que a Meta eventualmente entregue fora da ordem original.

O agrupamento de texto continua com janela de cinco segundos, no máximo vinte mensagens por turno; comandos, seleções e estados de coleta formam barreiras. Complementos que chegam durante a consulta ao modelo ainda impedem a exibição de uma orientação obsoleta. Os IDs originais agrupados são marcados como concluídos juntos.

Estado da conversa, logs, feedback, eventual reserva e respostas na outbox são gravados na mesma transação. Se o processo cai antes do commit, essas alterações são revertidas e a entrada continua pendente para outra execução. Depois do commit, a entrada está concluída e uma falha de envio repete apenas a saída, sem consultar novamente a IA nem criar outra reserva. Envios de documentos, textos longos, botões e listas passam pelo mesmo adaptador.

O proxy Prisma usa contexto assíncrono restrito ao turno. Transações internas dos serviços participam da transação externa, sem commits independentes. Fora desse contexto, os serviços do painel mantêm suas transações normais. Consultas ao modelo podem manter a transação/lock do telefone abertos: o limite do turno é cinco minutos, com duas conversas simultâneas por processo. Esse é um custo deliberado da atomicidade nesta implementação; dimensionar pool e workers antes de aumentar concorrência. O aviso inicial “Irei analisar…” também só fica disponível para envio quando o turno confirma seu commit. O aviso adicional de quatro segundos removido pelo usuário não foi reintroduzido, e seu try/catch foi preservado.

## Tentativas e resultados incertos

Entrada: PENDING → DONE; falhas inesperadas revertem o turno e aguardam nova tentativa. Cinco falhas levam a DEAD.

Saída: PENDING → SENDING → SENT. O HTTP de envio tem timeout de quinze segundos e o lease dura quarenta e cinco. Erros HTTP 429, 5xx ou explicitamente transitórios permitem nova tentativa com backoff de 2, 4, 8… segundos, limitado a sessenta segundos e cinco tentativas. Outros erros HTTP vão para DEAD. Códigos numéricos da Meta são registrados sem guardar o corpo do erro.

Timeout, desconexão ou queda do processo com lease expirado produzem UNKNOWN: a Meta pode ter aceitado o envio. Não existe reenvio automático desses casos. DEAD/UNKNOWN bloqueiam as saídas seguintes daquele telefone até revisão, preservando ordem. Entradas DEAD também precisam de revisão antes dos próximos turnos daquele telefone. Outros consumidores continuam sendo atendidos.

SENT significa aceitação pela API com ID de mensagem; não comprova entrega/leitura no aparelho. Os webhooks de status continuam sendo reconhecidos sem gerar turnos; rastreamento completo de entrega/leitura não foi adicionado nesta etapa. A distinção entre mensagens recebidas e notificações de status está na [referência oficial da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages).

Não há promessa de entrega exatamente uma vez na rede. UNKNOWN evita repetição cega, mas exige acompanhamento operacional. Até uma tentativa após erro transitório pode ter resultado ambíguo no provedor. Mensagens antigas também podem ser recusadas pela política de janela de atendimento da Meta; não se tenta contorná-la com envios repetidos ou templates automáticos.

## Operação

A partir de backend, ou com `docker exec backend_api` antes do comando:

```powershell
npm run messages:queue -- status
npm run messages:queue -- retry inbox UUID --confirm
npm run messages:queue -- retry outbox UUID --confirm
npm run messages:queue -- skip outbox UUID --confirm
```

Status apresenta contagens e até cem registros DEAD/UNKNOWN por fila, com ID interno, tentativas, data e tipo/código do erro. Não mostra telefone ou conteúdo. `retry` autoriza uma nova tentativa; em UNKNOWN pode duplicar uma mensagem já recebida. `skip` abandona explicitamente o item e libera os seguintes. Revisar os IDs e o histórico do atendimento antes de executar. Não existe operação em massa nem reenvio de SENT/DONE. O acesso é operacional pelo servidor nesta etapa; não foi criada uma tela administrativa de filas.

Se o serviço encerrar normalmente, para de buscar novos trabalhos e aguarda até vinte segundos. Interrupção forçada reverte a entrada em andamento; uma saída já reclamada pode ficar UNKNOWN após o lease. Reiniciar o processo basta para retomar itens pendentes.

## Dados e instalação

Telefone e payload das duas filas usam as mesmas chaves de criptografia/HMAC da aplicação. Apenas os campos consumidos pelo bot são persistidos; perfis, URLs e conteúdo de mídias não são armazenados. Payload de entrada é eliminado no commit do turno; payload de saída é eliminado após aceitação ou descarte explícito. IDs e metadados continuam preservados para deduplicação/diagnóstico. A limpeza geral por prazo continua desativada enquanto o PROCON não aprovar a política de retenção.

Aplicar `20261117000100_durable_messages` com `prisma migrate deploy`, gerar Prisma e iniciar o backend atualizado. A mudança adiciona tabelas e índices, sem alterar conteúdo das conversas existentes. Não iniciar binário antigo junto do novo: o antigo não participa dos locks e ainda envia mensagens diretamente. Scripts/testes que importam somente o adaptador conservam o transporte direto; o ponto de entrada de produção configura obrigatoriamente a fila antes de abrir HTTP.

## Verificação

Testes unitários cobrem assinatura/ACK após persistência/503, minimização e política de retry. A suíte PostgreSQL cria uma quarta base descartável exclusiva das mensagens e verifica reentrega concorrente, duas instâncias de worker, rollback depois de reserva, retomada em nova instância, estado/outbox invisíveis antes do commit, agrupamento/barreiras/complementos, limites de tentativas, lease expirado e resolução manual. Migrações são reconstruídas e comparadas com o schema; o backend compilado também inicia e encerra no smoke.

Não é teste de carga, entrega real pelo WhatsApp ou benchmark de precisão do modelo. Não requer Kaggle. Encerrar esta etapa e pedir autorização antes de iniciar outra fase.

Resultado local: tipos/build aprovados, 83 testes locais aprovados e dois skips históricos; 11 verificações PostgreSQL aprovadas (incluindo os subtestes de mensagens), quatro bancos reconstruídos sem divergência e smoke compilado aprovado. Foi criado backup criptografado antes da migração local. Nenhuma chave foi trocada e não houve reset ou exclusão de conversas existentes.
