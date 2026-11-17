# Disponibilidade compartilhada de atendimentos

## Uso no painel

O perfil ADMIN acessa **Disponibilidade**. Funcionários continuam consultando e gerenciando os agendamentos conforme suas permissões, mas não alteram as regras gerais.

- Regra geral: capacidade simultânea, dias da semana, início/fim do expediente, duração e antecedência mínima.
- Exceções: capacidade total para uma data inteira ou um horário específico dessa data. Exemplo: dia 16 às 11:00 com capacidade 2; os demais horários continuam seguindo a regra geral, salvo outras exceções.
- Bloqueios: dia inteiro, período de datas inclusive, intervalo de horas ou recorrência por dias da semana. Podem ter motivo opcional de até 300 caracteres.
- Todos os tipos de regra podem ser alterados/removidos; a prévia permite conferir a disponibilidade resultante.

A precedência é: **bloqueio > capacidade do horário > capacidade do dia > capacidade geral**. Capacidade significa total simultâneo, não vagas adicionais. Para fechar um horário, use bloqueio. Uma exceção de capacidade não abre horários fora da grade/expediente.

Exemplos de bloqueio: 02/11–03/11 inteiros; férias 22/12–02/01 usando os anos correspondentes; segunda a sexta das 12:00 às 13:00; toda sexta das 15:00 até o fechamento. Recorrências admitem limites de data opcionais. Datas finais são inclusivas; horários finais são exclusivos: almoço até 13:00 permite começar às 13:00. Uma sessão que atravesse o bloqueio também fica indisponível.

Horários seguem Brasília. Fim 00:00 significa final do dia (24:00). Não há intervalo único atravessando a meia-noite; divida-o entre os dias necessários. A duração deve caber integralmente no expediente; não se oferece uma última sessão parcial.

Limites: capacidade 1–1000, duração 5–480 minutos, antecedência 0–10080 minutos, ao menos um dia semanal. Salvar aplica as regras às próximas consultas, sem reiniciar o sistema. Edições concorrentes de configuração retornam 409 e pedem recarregamento, evitando sobrescrever regras silenciosamente.

## Reservas existentes e concorrência

Bloquear ou reduzir capacidade não cancela reservas. A tela lista marcações pendentes afetadas por bloqueios, expediente/grade ou excesso de ocupação. A equipe deve revisar e combinar remarcação/cancelamento com o consumidor. Não há aviso automático ao consumidor nesta etapa.

Marcações existentes preservam sua duração. Novas reservas e remarcações usam a duração atual, considerando todo o intervalo ocupado pelas marcações anteriores. Um funcionário atribuído não pode receber atendimentos sobrepostos, mesmo quando há capacidade global livre. Continua valendo uma reserva futura pendente por consumidor.

`getAvailability` e a validação final de reserva carregam a mesma política persistida. Reservas, remarcações, cancelamentos e alterações de configuração compartilham um lock transacional PostgreSQL; a validação ocorre depois de adquirir o lock, em READ COMMITTED. Isso coordena processos/conexões distintos e evita ultrapassar a capacidade por concorrência. A consulta de disponibilidade é uma fotografia; a confirmação sempre revalida.

O bot procura datas nos próximos 90 dias corridos conforme os dias configurados, remove dias sem vagas e oferece os primeiros cinco disponíveis. Horários bloqueados deixam de ser oferecidos tanto no bot quanto na agenda. Selecionar um botão antigo não contorna o bloqueio. Não houve alteração de prompts, modelo, RAG ou seed.

## Persistência e API

Migração: `20261116000400_shared_schedule`. Tabelas `ScheduleSettings`, `ScheduleCapacity` e `ScheduleBlock`. A capacidade inicial captura uma única vez a capacidade efetiva anterior (mínimo 1); depois passa a depender exclusivamente da configuração ADMIN. Ativar/desativar funcionários não muda esse valor.

O motivo do bloqueio é criptografado pelo cliente Prisma protegido e fica restrito às rotas ADMIN; não aparece nas opções enviadas ao consumidor.

Rotas autenticadas ADMIN em `/api/schedule`:

- GET `/`: regras, versão e conflitos preservados.
- GET `/preview?date=AAAA-MM-DD`: prévia, incluindo linhas bloqueadas para conferência administrativa.
- PUT `/settings`, POST/PUT `/capacities[/id]`, POST/PUT `/blocks[/id]`: corpo `{version, value}`.
- DELETE `/capacities/:id` e `/blocks/:id`: corpo `{version}`.

Datas são civis `AAAA-MM-DD`. Horários da API são minutos desde meia-noite, fim máximo 1440; `minute=-1` identifica capacidade para o dia inteiro. Bloqueios de dia inteiro usam início/fim de horário nulos. A versão vem de `settings.version` e muda a cada edição. Criar capacidade para a mesma data/horário atualiza a exceção existente.

Na instalação local, foi criado backup criptografado em `.private-backups` e aplicado `migrate deploy`, incluindo a compatibilidade histórica `20261115000000_restore_core_schema` e a nova migração da agenda, sem resetar dados ou trocar chaves. Em outra instalação, executar as migrações antes de iniciar o backend atualizado e gerar o cliente Prisma correspondente.

## Validação e continuidade

Tipos/build do backend, lint/build do frontend e 79 testes locais passaram; dois testes históricos de artefatos removidos continuam pulados. Os cinco testes de integração PostgreSQL passaram. A integração usa bancos descartáveis e testa capacidade independente de funcionários, concorrência, exceções, bloqueios, recorrência, férias atravessando o ano, conservação de reservas/durações, redução de capacidade, permissões e recusa de botão antigo pelo handler do bot. Também verifica reconstrução por migrações, ausência de divergência de schema e inicialização compilada.

Não foi feita validação visual manual do painel nem envio real pelo WhatsApp nesta etapa. O fluxo do bot foi exercitado com dependências de transporte simuladas e PostgreSQL real.
