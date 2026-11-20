# Inbox persistente e outbox do WhatsApp

## Comportamento

O webhook assinado valida/minimiza as mensagens e grava todos os novos IDs antes de responder 200. Se o banco falhar, responde 503. `MessageReceipt.metaMessageId` tem unicidade persistida: uma reentrega, inclusive após reinício, não cria outro turno. Lotes são persistidos em transação; nenhum item novo do lote fica confirmado apenas na memória.

Workers iniciados pelo `src/index.ts` procuram trabalho no PostgreSQL. São duas rotinas de entrada e duas de saída por processo. `FOR UPDATE SKIP LOCKED` e locks transacionais por identificador HMAC do telefone coordenam instâncias distintas. Mensagens do mesmo telefone seguem a sequência de recebimento no banco; outros telefones podem progredir em paralelo. Essa sequência representa a ordem em que o sistema recebeu os eventos, não reconstitui eventos que a Meta eventualmente entregue fora da ordem original.

O agrupamento de texto continua com janela de cinco segundos, no máximo vinte mensagens por turno; comandos, seleções e estados de coleta formam barreiras. Complementos que chegam durante a consulta ao modelo ainda impedem a exibição de uma orientação obsoleta. Os IDs originais agrupados são marcados como concluídos juntos.

Estado da conversa, logs, feedback, eventual reserva e respostas na outbox são gravados na mesma transação. Se o processo cai antes do commit, essas alterações são revertidas e a entrada PROCESSING pode ser recuperada depois de expirar o lease. Depois do commit, a entrada está concluída e uma falha de envio repete apenas a saída, sem consultar novamente a IA nem criar outra reserva. Envios de documentos, textos longos, botões e listas passam pelo mesmo adaptador.

O processamento tem claim, chamadas externas e confirmação separados. O claim curto marca o lote como PROCESSING, registra token/lease e captura o snapshot completo da sessão aberta. O lease dura sessenta segundos e é renovado a cada vinte, sem manter transação aberta. A mensagem mais antiga não terminal bloqueia as seguintes daquele telefone, inclusive durante a espera externa; outros telefones continuam elegíveis.

Para preservar os serviços e suas transações existentes, o worker prepara o turno em passagens curtas. Se uma chamada ao Ollama ainda não tem resultado, um sinal interno causa rollback da preparação; somente depois disso ocorre o HTTP externo. O resultado ou erro fica em memória durante aquela tentativa, indexado pelo hash de todos os parâmetros enviados. A preparação é refeita reutilizando os resultados já obtidos, sem repetir a chamada ao modelo para os mesmos parâmetros. Não se trata de uma resposta persistida antecipadamente: nenhuma alteração intermediária da conversa fica confirmada. Há custo de repetir SQL/cálculo local; o desenho evita introduzir uma segunda implementação da máquina de estados, reservas ou feedback. Não muda prompts, categorias ou responsabilidades do LLM.

Cada passagem verifica token, validade do lease e igualdade do snapshot da sessão. A confirmação mantém locks curtos de receipt/telefone/sessão; sessão alterada por outro fluxo provoca SessionConflict e reprocessamento posterior com contexto novo. Só a passagem final, sem chamadas externas pendentes, confirma estado/reserva/feedback/logs/eventos/outbox e DONE juntos. O timeout transacional padrão foi reduzido de trezentos para quinze segundos; o orçamento total do turno continua em cinco minutos e há limite de dezesseis passagens. O cache é descartado ao terminar; nova tentativa após falha pode consultar o modelo novamente.

Chamadas de geração/embedding passam obrigatoriamente pelo adaptador externalWork; entrega direta à Meta dentro da unidade transacional é rejeitada. Novas integrações externas do handler devem usar esse mesmo limite: a função adiada deve conter apenas a chamada externa, sem depender do cliente transacional. ExternalWorkRequired é controle interno e precisa atravessar os catches de fallback até o worker. Não adicionar efeitos externos diretamente ao handler, pois as preparações podem ser refeitas.

O aviso inicial “Irei analisar…” continua disponível na outbox somente após o commit final. O aviso adicional de quatro segundos removido pelo usuário não foi reintroduzido, e seu try/catch foi preservado.

## Tentativas e resultados incertos

Entrada: PENDING → PROCESSING → DONE. Cada claim incrementa tentativas; falhas inesperadas, conflito de sessão e estouro do orçamento revertem os efeitos e retornam o lote a PENDING com backoff de 2, 4, 8… segundos, limitado a sessenta. Ao esgotar cinco tentativas, o lote vai para DEAD. Falha no próprio claim não confirma alterações. Se não for possível registrar o erro por indisponibilidade do banco, a recuperação ocorre pela expiração do lease.

Lease expirado é recuperado automaticamente pelo próximo worker, com token novo e o mesmo lote. O worker antigo não pode renovar, finalizar nem registrar erro sobre o trabalho do sucessor. Após cinco claims abandonados, a recuperação envia o lote a DEAD para revisão. Falha de heartbeat interrompe a confiança do worker no próprio lease; ele não confirma a resposta. Erros HTTP/timeouts do Ollama conservam os fallbacks existentes do RAG e da reescrita; se esse fallback é preparado corretamente, o turno pode concluir normalmente. O timeout total do worker descarta o resultado tardio e retenta conforme o orçamento de tentativas.

Saída: PENDING → SENDING → SENT. O HTTP de envio tem timeout de quinze segundos e o lease dura quarenta e cinco. Erros HTTP 429, 5xx ou explicitamente transitórios permitem nova tentativa com backoff de 2, 4, 8… segundos, limitado a sessenta segundos e cinco tentativas. Outros erros HTTP vão para DEAD. Códigos numéricos da Meta são registrados sem guardar o corpo do erro.

Timeout, desconexão ou queda do processo com lease expirado produzem UNKNOWN, pois a Meta pode ter aceitado o envio. A tentativa incerta não é repetida automaticamente. Saídas PENDING ou SENDING ainda preservam a ordem por telefone. Saídas DEAD ou UNKNOWN ficam disponíveis para revisão e a fila avança. Um status tardio ou um retry manual pode alterar a ordem observada pelo consumidor. Entradas DEAD continuam aguardando revisão antes dos próximos turnos daquele telefone.

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

Status apresenta contagens e até cem registros DEAD/UNKNOWN por fila, com ID interno, tentativas, data e tipo/código do erro. Não mostra telefone ou conteúdo. `retry` autoriza uma nova tentativa; em UNKNOWN pode duplicar uma mensagem já recebida. `skip` abandona explicitamente o item. Em entradas, também libera as seguintes. Revisar os IDs e o histórico do atendimento antes de executar. Não existe operação em massa nem reenvio de SENT/DONE. O acesso é operacional pelo servidor nesta etapa; não foi criada uma tela administrativa de filas.

Se o serviço encerrar normalmente, para de buscar novos trabalhos e aguarda até vinte segundos. Interrupção forçada reverte a preparação/finalização em andamento; a entrada PROCESSING aguarda expiração do lease para recuperação; uma saída já reclamada pode ficar UNKNOWN após o lease. Reiniciar o processo basta para retomar itens pendentes.

## Dados e instalação

Telefone e payload das duas filas usam as mesmas chaves de criptografia/HMAC da aplicação. Apenas os campos consumidos pelo bot são persistidos; perfis, URLs e conteúdo de mídias não são armazenados. Payload de entrada é eliminado no commit do turno; payload de saída é eliminado após aceitação ou descarte explícito. IDs e metadados continuam preservados para deduplicação/diagnóstico. A limpeza geral por prazo continua desativada enquanto o PROCON não aprovar a política de retenção.

Parar todos os workers antigos, fazer backup, gerar Prisma e aplicar todas as migrações pendentes com `prisma migrate deploy`, incluindo `20261117000300_inbox_leases`, antes de iniciar o backend atualizado. Essa migração acrescenta lease/token, índices e constraints à inbox. Não executar versões anteriores dos workers em paralelo: elas não reconhecem PROCESSING e podem processar fora do protocolo de lease. A mudança adiciona tabelas e índices, sem alterar conteúdo das conversas existentes. Não iniciar binário antigo junto do novo: o antigo não participa dos locks e ainda envia mensagens diretamente. Scripts/testes que importam somente o adaptador conservam o transporte direto; o ponto de entrada de produção configura obrigatoriamente a fila antes de abrir HTTP.

## Verificação

Testes unitários cobrem assinatura/ACK após persistência/503, minimização e política de retry. A suíte PostgreSQL cria uma quarta base descartável exclusiva das mensagens e verifica reentrega concorrente, duas instâncias de worker, rollback depois de reserva, retomada em nova instância, estado/outbox invisíveis antes do commit, agrupamento/barreiras/complementos, limites de tentativas, lease expirado e resolução manual. Migrações são reconstruídas e comparadas com o schema; o backend compilado também inicia e encerra no smoke.

Não é teste de carga, entrega real pelo WhatsApp ou benchmark de precisão do modelo. Não requer Kaggle. Encerrar esta etapa e pedir autorização antes de iniciar outra fase.

A revisão dos leases acrescenta `tests/messaging/inbox-leases-postgres.test.ts`: exclusividade por telefone, paralelismo entre consumidores, espera externa sem transação aberta, heartbeat, recuperação de lote, fencing, conflito de sessão, falha diferida no commit e retry sem duplicação. Um servidor HTTP local simula o Ollama para exercitar classificação, embedding, geração, reescrita do menu e fallback sem Kaggle. O estado do PostgreSQL é consultado durante as chamadas para detectar transações ociosas abertas.

Validação desta correção: tipos/build e 85 testes locais aprovados (dois skips históricos); 24 verificações PostgreSQL aprovadas, incluindo subtestes. Cinco bases descartáveis foram reconstruídas sem divergência de schema e o smoke compilado confirmou health 200/API protegida 401. A migração de leases foi aplicada no banco local após backup criptografado, sem reset, troca de chaves ou execução de seeds. Nenhuma integração real com WhatsApp/Kaggle foi usada nestes testes.
