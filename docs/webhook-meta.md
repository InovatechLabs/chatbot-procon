# Validação dos webhooks da Meta

Etapa independente da autenticação do painel. A URL permanece `/api/webhook`; não é necessário trocar o endereço fixo do ngrok cadastrado na Meta. Não depende do Ollama/Kaggle.

## Configuração

Adicionar ao `backend/.env` o segredo do **mesmo aplicativo Meta** que envia os eventos:

```dotenv
META_APP_SECRET=""
```

Preencher localmente com o App Secret; não enviar pelo chat, commitar ou registrar nos logs. É diferente de META_VERIFY_TOKEN (confirmação GET do webhook) e META_WA_TOKEN (envio de mensagens). Reiniciar o backend depois de alterar o `.env`; em Docker, `docker compose restart backend`. O segredo não é gerado pelo nosso sistema nem pelas ferramentas de privacidade.

## Recebimento

O router do webhook é montado antes do parser JSON das APIs administrativas. POST recebe os bytes originais, limitados a 100 KiB, sem descompressão automática. Calcula HMAC-SHA256 com META_APP_SECRET e compara com `X-Hub-Signature-256: sha256=<64 caracteres hexadecimais>` usando `timingSafeEqual`. Assinatura inválida não chega ao parser JSON, à fila, ao banco ou à IA. Cabeçalhos duplicados são recusados. Não há fallback para aceitar chamadas sem assinatura, nem em desenvolvimento.

| Caso | HTTP |
|---|---|
| Segredo ausente | 503 |
| Assinatura ausente, malformada ou divergente | 403 |
| JSON inválido ou estrutura inválida, com assinatura válida | 400 |
| Corpo acima do limite | 413 |
| Tipo diferente de application/json ou corpo comprimido | 415 |
| Objeto não suportado, com assinatura válida | 404 |
| Evento válido | 200 / EVENT_RECEIVED |

GET continua público para a confirmação da Meta: exige `hub.mode=subscribe`, verify token correto e challenge textual não vazio, de até 512 caracteres; devolve challenge como `text/plain`. Cookie, login e Origin do painel não são exigidos para a Meta. Rotas administrativas continuam usando o parser JSON normal e sua autenticação própria.

Referência primária: [Meta — validação de notificações](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/#validate-payloads).

## Testes

`cd backend; npm run test:webhook`: três testes com múltiplos cenários passaram. Incluem corpo bruto com espaços/Unicode, alteração de corpo/chave, assinatura inválida/ausente, segredo ausente, cabeçalhos repetidos, POST válido sem Origin, handshake GET, limite/tipo/encoding e parser administrativo intacto. Não enviam mensagens reais ou chamadas de IA. Tipos do backend passaram. Regressão de auth: sete testes locais aprovados; dois testes PostgreSQL opcionais não foram executados novamente nesta etapa.

Na instância local, o backend foi reiniciado para carregar o código e o segredo; POST sem assinatura foi confirmado como 403. Só a existência de META_APP_SECRET foi conferida, sem imprimir seu valor. Em 16/11/2026, o usuário enviou **menu** ao bot e confirmou a resposta. Foram observados POSTs reais pelo ngrok com HTTP 200 e registros correspondentes de assinatura validada no backend, sem exibir conteúdo pessoal. O teste real confirmou a compatibilidade com o aplicativo Meta atual e a URL fixa existente. Kaggle permaneceu desligado.

Para conferência real:

1. Configurar META_APP_SECRET e reiniciar o backend.
2. Iniciar o ngrok fixo para localhost:3000; manter a URL cadastrada terminando em `/api/webhook`.
3. Enviar **menu** ao número do bot ou usar o teste de webhook no painel Meta. Menu permite conferir a entrega sem ligar modelos de IA.
4. Conferir POST 200 no inspetor do ngrok e `Webhook Meta: assinatura validada.` no log do backend. Esse log não inclui telefone, assinatura, segredo ou conteúdo da mensagem.
5. Uma tentativa sem assinatura deve retornar 403 e não criar conversa ou responder pelo WhatsApp. Evitar compartilhar os payloads do inspetor: podem conter dados pessoais.

Se retornar 503, o processo ainda não leu o segredo. Se 403 em entrega real, confirmar aplicativo/segredo correto e se o proxy preservou corpo e cabeçalho originais. Não resolver desabilitando a verificação.

## Limites e continuidade

A assinatura valida integridade e conhecimento do App Secret; não comprova que uma entrega é inédita. Deduplicação durável, processamento após falhas e outbox continuam na etapa correspondente do comparativo. O comportamento anterior de confirmar recebimento antes do processamento foi preservado; esta entrega não cria fila durável.

Parar e solicitar autorização ao encerrar a etapa, sem iniciar automaticamente as próximas melhorias.

Na etapa posterior de [inbox/outbox persistentes](mensagens-duraveis.md), autorizada pelo usuário, o ACK passou a ocorrer depois da persistência dos IDs/mensagens. Falha no banco também pode produzir 503. A deduplicação e o processamento deixam de depender da memória do processo; a validação da assinatura permanece inalterada.
