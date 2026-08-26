# Fluxo de Mensagens e Webhook

Arquivo: `webhookController.ts`

## Responsabilidade

Este é o ponto de entrada de tudo: recebe os eventos de webhook enviados pela Meta WhatsApp Cloud
API, mantém o estado de conversa de cada cidadão (`UserSession`) e decide, a cada mensagem, se ela
deve ser tratada pelo **fluxo de menu programado** (baseado em `Step`/`Option` no banco) ou pelo
**modo de chat livre com IA**.

## Verificação do webhook

```ts
export const verifyWebhook = async (req: Request, res: Response): Promise<any> => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  // ...valida contra META_VERIFY_TOKEN e responde com o challenge
};
```

Implementa o handshake padrão exigido pela Meta para registrar a URL do webhook (`GET` com
`hub.mode=subscribe` e verificação do token configurado em `META_VERIFY_TOKEN`).

## Gerenciamento de sessão

Para cada mensagem recebida, o controlador busca a `UserSession` pelo número de telefone. Se não
existir, cria uma nova com `isChat: false` (começa no fluxo de menu). Se a sessão existente estava
`RESOLVED`/`CLOSED`, ela é reaberta (`status: OPEN`) e o passo atual (`currentStepId`) é resetado.

O campo **`isChat`** é o interruptor central do sistema: `true` significa "esta conversa está em
modo IA de texto livre", `false` significa "esta conversa segue o fluxo de botões programado".

## Roteamento de mensagens de texto

Ao receber uma mensagem do tipo `text`, o fluxo é:

1. A mensagem é salva imediatamente em `ChatLog` (`direction: INBOUND`).
2. Se o texto for um **comando de fuga** (`menu`, `sair`, `voltar`, `cancelar`, `iniciar`), a
   sessão volta para `isChat: false` e `currentStepId: null` — o cidadão retorna ao menu.
3. Bifurcação por estado da sessão:
   - **`isChat === true`**: a mensagem vai direto para `answerWithRAG`, ignorando qualquer lógica
     de menu.
   - **`isChat === false`**:
     - Se for uma saudação (`oi`, `olá`, `bom dia`...) ou comando de fuga → busca o `Step` inicial
       (`isStart: true`) e envia o menu de botões.
     - Caso contrário (o cidadão já escreveu uma reclamação direta, sem passar pelo menu) → a
       sessão é automaticamente promovida para `isChat: true` e a mensagem é processada pelo RAG.
       Esse comportamento evita forçar o cidadão a navegar por botões quando ele já demonstrou
       intenção de descrever o problema em texto livre.

### Formato de envio da resposta do RAG

A resposta de `answerWithRAG` pode ser de dois tipos, distinguidos por conter ou não um `?`:

- **Pergunta de clarificação** (contém `?`) → enviada como texto simples (`sendTextMessage`), sem
  botões de feedback, já que o fluxo ainda não terminou.
- **Orientação final** (sem `?`) → enviada como mensagem interativa com botões de feedback
  (`👍 Sim, resolveu` / `👎 Não resolveu`).

Além disso, se a resposta contiver a tag de controle `[AGENDAR]` (emitida pelo prompt quando o
caso deve ser redirecionado para atendimento humano — ver `03-prompts.md`), o controlador limpa a
tag do texto e oferece botões específicos de agendamento (`Sim, quero agendar` / `Não, obrigado`).

## Tratamento de mensagens interativas (botões/listas)

Mensagens do tipo `interactive` chegam como `button_reply` ou `list_reply`, das quais se extrai o
`selectedOptionId`. Dois caminhos possíveis:

1. **Feedback do atendimento** (`btn_feedback_sim` / `btn_feedback_nao`): encerra a sessão
   (`status: RESOLVED`, `isChat: false`) e grava uma nota simplificada (`rating: 5` ou `1`). Em
   caso de feedback negativo, tenta buscar um `Step` de agendamento e envia a mensagem
   correspondente.
2. **Navegação de menu normal**: busca a `Option` clicada. Se ela representa a entrada para o
   "atendente virtual" (identificada pelo texto da opção), ativa `isChat: true` e envia a mensagem
   de boas-vindas do modo IA. Caso contrário, avança para o próximo `Step` do fluxo programado.

## Envio de passos do fluxo programado

Quando o roteamento resulta em um `Step` do menu (`responseStep`):

- Se o passo tem opções (`options.length > 0`) → envia como mensagem interativa (lista ou
  botões, decidido dentro de `sendInteractiveMessage`).
- Se é um passo terminal (sem opções) → o texto oficial do passo é **humanizado** por
  `generateOrientativeResponse` (ver `03-prompts.md`) antes de ser enviado, junto dos botões de
  feedback.

## Pontos de atenção

- O `try/catch` externo em `handleWebhookEvent` apenas loga o erro (`console.error`) — como a
  resposta HTTP `200 EVENT_RECEIVED` já foi enviada antes do processamento (padrão exigido pela
  Meta, que espera ACK rápido), qualquer falha no processamento downstream não é reportada de
  volta ao cidadão além do que já esteja tratado nos try/catch internos de `llmService.ts`.
- A checagem de opção do "atendente virtual" depende de um `includes('atendente virtual')` no
  texto da opção — um acoplamento implícito entre conteúdo do banco e lógica de código, sinalizado
  no próprio comentário do arquivo como algo a adaptar/formalizar (ex.: um flag booleano dedicado
  na tabela `Option`).
