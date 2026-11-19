# Lembretes de agendamento

O bot envia um lembrete pelo WhatsApp antes de cada atendimento presencial pendente e permite que o cidadão **confirme presença** ou **cancele** com um toque. Cancelar libera o horário na agenda.

## Como funciona

1. A cada minuto, um worker (`startMessageWorkers`) procura agendamentos `PENDING` que ocorrem nas próximas `REMINDER_HOURS_BEFORE` horas (padrão 24), com pelo menos 1 hora de antecedência, marcados há pelo menos `REMINDER_MIN_AGE_MINUTES` (padrão 120) e sem lembrete anterior.
2. O lembrete é enfileirado **uma única vez** (`Appointment.reminderQueuedAt`), na mesma transação que marca o agendamento. Várias instâncias podem rodar juntas (`FOR UPDATE SKIP LOCKED`).
3. A mensagem é um **template** da Meta (necessário fora da janela de 24 h) com dois botões de resposta rápida. A entrega usa a outbox durável já existente.
4. Só envia entre 08:00 e 20:00 (Brasília). Fora disso, espera a próxima janela.
5. Ao tocar em um botão, o webhook recebe uma mensagem do tipo `button` com payload `rem_ok:<id>` ou `rem_no:<id>`:
   - **Confirmar**: grava `Appointment.confirmedAt` e responde com o endereço e o que levar.
   - **Cancelar**: cancela o agendamento (libera a vaga) e oferece **Agendar novo horário**.
   - O número que responde precisa ser o do agendamento; atendimento já cancelado, concluído ou passado recebe uma mensagem neutra.
6. Remarcar ou reativar um agendamento zera `reminderQueuedAt` e `confirmedAt`; o novo horário recebe um novo lembrete.
7. A agenda do painel recebe `confirmedAt` e `reminderSentAt` em cada agendamento (sem dados pessoais adicionais).

## Configuração (`backend/.env`)

| Variável | Padrão | Função |
|---|---|---|
| `REMINDERS_ENABLED` | `false` | Liga o envio. Exige também `REMINDER_TEMPLATE_NAME`. |
| `REMINDER_TEMPLATE_NAME` | — | Nome do template aprovado na Meta. |
| `REMINDER_TEMPLATE_LANG` | `pt_BR` | Idioma do template. |
| `REMINDER_HOURS_BEFORE` | `24` | Antecedência (2 a 72 h). |
| `REMINDER_MIN_AGE_MINUTES` | `120` | Não lembra agendamentos recém-criados. |
| `PROCON_ENDERECO` | `PROCON de Jacareí` | Endereço enviado no lembrete. |

## Template na Meta (WhatsApp Manager → Modelos de mensagem)

- **Categoria:** Utilidade. **Nome:** `lembrete_agendamento`. **Idioma:** Português (BR).
- **Corpo:**

```
Olá, {{1}}! Lembramos do seu atendimento presencial no PROCON de Jacareí: {{2}}, às {{3}}.

Local: {{4}}.
Leve um documento com foto e os documentos do seu caso.

Você confirma sua presença?
```

- **Exemplos das variáveis:** `Maria`, `quinta-feira, 19/11/2026`, `14:00`, `Rua Capitão Joaquim Pinheiro do Prado, 222, Centro, Jacareí-SP`.
- **Botões (resposta rápida), nesta ordem:** `Confirmar presença` e `Cancelar horário`.

A ordem dos botões importa: o código envia `rem_ok` no botão 0 e `rem_no` no botão 1. Se o texto ou a ordem mudarem, ajuste `buildReminderPayload`.

## Operação

- Se o template não existir ou for recusado pela Meta, a falha **não trava** a conversa do cidadão: a mensagem vai para `SKIPPED` com o motivo em `lastError` (por exemplo `HTTP_400_META_132001`). Acompanhe com `npm run messages:queue`.
- Cada agendamento recebe no máximo um lembrete. Para reenviar um específico, zere `reminderQueuedAt` no banco.
- O custo de mensagens de template é cobrado pela Meta por mensagem entregue. Confira a tabela de preços vigente.

## Como testar

1. Crie o template e espere a aprovação.
2. Em `backend/.env`: `REMINDERS_ENABLED=true`, `REMINDER_TEMPLATE_NAME=lembrete_agendamento`, `REMINDER_HOURS_BEFORE=72`, `REMINDER_MIN_AGE_MINUTES=0`.
3. Reinicie o backend e crie, pelo painel, um agendamento para o seu número dentro das próximas 72 horas e entre 08:00 e 20:00.
4. Em até 1 minuto o lembrete chega. Toque em **Confirmar presença** e confira `confirmedAt`; crie outro e toque em **Cancelar horário** para ver a vaga liberada.
