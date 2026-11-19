# Estados tipados e retomada da conversa

Etapa autorizada após testes/CI. Não altera prompts, normas jurídicas nem os modelos. Mantém menu, conversa livre, agendamento, documentos e avaliação; o formato antigo continua legível.

## Estrutura

`backend/src/services/conversation/state.ts` define a união discriminada ConversationState e validação Zod. O campo existente UserSession.stepState guarda um snapshot JSON com version=1, state, contexto de navegação e opções exibidas (somente ID/texto). Categoria, data e página são campos separados e validados, sem strings compostas no motor. Nome/CPF/telefone continuam nos campos criptografados existentes, sem duplicação no snapshot. currentStepId/isChat/status são espelhados na mesma atualização para manter os contratos anteriores.

Não é necessária nova coluna ou execução de seed nesta etapa. Sessões antigas são interpretadas pelo codec e convertidas no próximo uso. Registros históricos não foram reescritos em lote. O snapshot versiona o formato da conversa; não congela uma cópia inteira do menu. Nós/opções excluídos pelo painel continuam tendo recuperação controlada para o menu atual.

## Estados e transições

| Estado | Continuação principal |
|---|---|
| READY | Nova dúvida, menu, oferta/agendamento ou avaliação explicitamente permitida |
| MENU | Submenu, resposta oficial, documentos ou conversa livre |
| FREE_CHAT | Outra pergunta de clarificação (até duas), orientação final ou encaminhamento |
| POST_ANSWER | Continuação livre, avaliação, oferta de agenda ou menu |
| SCHEDULE_OFFER | Aceitar inicia categoria; recusar volta a READY; dúvida nova pode ir ao chat |
| SCHEDULE_CATEGORY | Escolher categoria leva a SCHEDULE_NAME |
| SCHEDULE_NAME | Nome validado leva a SCHEDULE_NAME_CONFIRM |
| SCHEDULE_NAME_CONFIRM | Confirmar leva a SCHEDULE_CPF; corrigir volta ao nome |
| SCHEDULE_CPF | CPF validado leva a SCHEDULE_DATE |
| SCHEDULE_DATE | Data válida leva a SCHEDULE_SLOT |
| SCHEDULE_SLOT | Paginação mantém etapa/data; outra data volta à seleção; reserva confirmada leva a READY |
| DOCUMENT_CATEGORY | Seleção apresenta documentos e volta a READY |
| RATING | Nota válida e transição a READY na mesma transação |
| FEEDBACK_COMMENT | Comentário e transição a READY na mesma transação; dúvida pode ir ao chat |
| FINISHED | Sessão encerrada, não reabre; nova interação cria outra sessão |

A função central transition valida destinos e payloads antes da gravação. Não permite pular de nome para horário, alterar categoria durante coleta, mudar a data diretamente dentro de uma página de horários nem reabrir sessão FINISHED. Menu, encerramento e intenções globais possuem destinos explícitos; os handlers validam em qual etapa cada botão pode ser usado. Os fluxos sem coleta usam a tabela normal do módulo; não há comparação de prefixos/split de estado fora do codec de compatibilidade.

Agendamento e avaliação estão separados em scheduling.ts e feedback.ts, com contexto comum em context.ts. O controller principal coordena navegação, intenções globais e resposta da IA. O agrupamento de mensagens do webhook usa o mesmo estado tipado; coleta e avaliação não são agrupadas como relato livre.

## Persistência, retomada e falhas

- Opções de datas/horários deixam de depender de Map local. Recriar o handler mantém a correspondência entre número digitado e escolha persistida. Revalidar disponibilidade/página continua obrigatório antes de reservar.
- Um formato legado sem opções conhecidas, ou transição interrompida antes de salvá-las, reapresenta as escolhas atuais antes de interpretar um número; não adivinha o que “1” significava.
- JSON inválido, categoria/data/página inválida ou versão desconhecida têm recuperação controlada para o menu, sem chamada à IA ou reserva. Dados pessoais já coletados não são apagados por essa recuperação.
- Informações de contato durante agendamento preservam coleta e opções; consulta de endereço durante clarificação preserva o contador.
- Botões antigos de avaliação, documentos e agendar não descartam uma coleta em andamento. Nota repetida não cria outra avaliação. Menu continua uma saída explícita.
- Novas gravações de estado/opções usam a versão anterior do snapshot no filtro da atualização, impedindo sobrescrever silenciosamente uma transição concorrente. Em conflito, a atualização falha; não há retry cego com efeito duplicado.
- Avaliação/comentário e estado são gravados atomicamente. Reserva originada pelo WhatsApp e saída da escolha de horário também são confirmadas na transação da agenda. O handler relê o estado confirmado antes de enviar a confirmação, evitando trabalhar com o snapshot anterior.
- Mantidos os limites anteriores: sessão comum expira após 30 minutos; coleta de agendamento pode continuar por até 24 horas, com aviso de retomada depois de 30 minutos.

Isso não implementa uma fila durável ou entrega exatamente uma vez. Envios de rede e commits PostgreSQL não são uma única transação. Outbox, deduplicação compartilhada, processamento após crash e política de retry continuam na etapa correspondente. Não reverter para binário antigo sem tratar os snapshots JSON, pois a versão anterior só reconhecia strings.

## Validação

Testes locais cobrem compatibilidade de todas as etapas antigas, validação de payload/versionamento, transições inválidas, menu e follow-up livre, limite de clarificação, reinício do handler entre todos os turnos da coleta, datas/paginação por número, retorno ao menu, controles antigos e rollback da avaliação. Os testes anteriores continuam verificando conteúdo enviado, histórico, recuperação e proteção contra respostas de IA obsoletas.

Integrações PostgreSQL verificam reserva/estado atômicos, rejeição de sessão fora da etapa com rollback, confirmação pelo handler após a transação e avaliação sem duplicação depois de recriar o handler. Tipos e build são verificados pelo check, e os testes novos entram automaticamente no CI.

Resultado local desta etapa: 74 testes aprovados, dois históricos do atualizador removido pulados, quatro integrações PostgreSQL aprovadas, comparação de schema sem divergência e smoke do backend compilado aprovado.

Foi feita uma checagem curta real com as URLs do Kaggle configuradas pelo usuário, sem executar o eval completo:

1. Banco descartável próprio, seed oficial de menu e caminho até faq-01, recriando o handler entre interações. Chegou a POST_ANSWER. A reescrita do modelo foi recusada pela guarda de fidelidade já existente; a fonte oficial foi preservada e apresentada.
2. Relato fictício de cobrança após cancelamento: orientacao_final, Art. 42, estado POST_ANSWER, sem descarte.
3. Continuação fictícia informando pagamento e perguntando sobre devolução, após recriar o handler: orientacao_final, Art. 42, estado POST_ANSWER, sem descarte.

O transporte WhatsApp foi substituído por captura local nesse smoke, sem enviar mensagens a consumidores. O RAG usou a base legal pública existente; o histórico e as sessões de teste ficaram em uma base separada, removida ao terminar. Não foi acessado histórico real de consumidores nem executada reserva real no smoke. Isso verifica integração com modelo/embeddings e retomada; não mede taxa geral de acerto nem substitui benchmark jurídico completo.

Para repetir manualmente, com ambiente de IA ativo e usuário do banco autorizado a criar bases:

```powershell
docker exec backend_api npm run test:states:live
```

Esse comando é opt-in, fora do CI, e usa as URLs reais do .env. Cria somente uma base com prefixo procon_states_test_live_, usa credenciais criptográficas efêmeras para os dados fictícios e a remove ao terminar. A sessão do Kaggle já pode ser desligada depois dessa checagem.

## Continuidade

Encerrar esta etapa e solicitar autorização antes da próxima. Não iniciar automaticamente refatorações de RAG, agenda compartilhada, outbox ou atendimento humano.

A etapa posterior de [agenda compartilhada](agenda-compartilhada.md) foi autorizada e implementada, mantendo as transações de reserva/estado e a revalidação de botões antigos. Outbox e atendimento humano continuam etapas separadas.

A [inbox/outbox persistente](mensagens-duraveis.md) foi implementada em etapa posterior autorizada. No caminho de produção, o turno inteiro agora confirma estado/reserva/feedback/logs/saídas em uma transação compartilhada; a limitação de durabilidade descrita na seção original foi tratada por essa etapa. A entrega de rede continua sujeita a resultado incerto e revisão operacional.

### Reconhecimento de pedidos de agendamento

Pedidos escritos livremente passam pelo classificador LLM, cujo schema e prompt agora incluem AGENDAMENTO. Não há reconhecimento de agendamento por uma lista de frases ou expressão regular. O resultado AGENDAMENTO encerra o pipeline antes de embeddings/busca/geração jurídica e oferece a confirmação com o botão de agendar. Se já existe reserva pendente, apresenta essa reserva e impede outra. A coleta já iniciada e os botões continuam sendo tratados pela máquina de estados.

Validação adicional: quatro consultas reais ao Gemma configurado reconheceram três formulações de pedido (incluindo “eu gostaria de agendar um atendimento”) e mantiveram como CONSUMO uma reclamação sobre revisão agendada em oficina. Essa checagem curta não mede precisão geral; os quatro casos foram acrescentados ao benchmark manual do classificador. Testes sem modelo exercitam o parser/schema e a integração do resultado classificado com a conversa, sem busca jurídica ou nova reserva indevida.

A correção posterior do inbox separa a espera do Ollama das transações, com lease renovável, token de fencing e comparação do snapshot da sessão. Preparações intermediárias sofrem rollback; somente a passagem final confirma os efeitos do turno. Detalhes e política de recuperação em [mensagens duráveis](mensagens-duraveis.md).
