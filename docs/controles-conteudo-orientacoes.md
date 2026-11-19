# Controles delimitados de conteúdo das orientações

## Escopo autorizado

Correção das falhas encontradas na [validação pontual da fusão](validacao-fusao-gemma.md): condição temporal de arrependimento omitida, lista incompleta de alternativas do art. 20, atribuição de correção de dados ao art. 72 e juros/indenização apresentados sem suporte adequado.

Mantém a responsabilidade de geração no Gemma e a arquitetura atual. Não monta uma nova orientação por preenchimento automático nem executa outro modelo como juiz. Quando uma verificação reprova a resposta, o fluxo existente substitui o texto por pergunta segura ou encaminhamento à equipe/agendamento; o conteúdo reprovado não é enviado ao consumidor.

Não altera classificador, recuperação, keywords, embeddings, seed ou aprovação de regras. O modo `preview` permanece exclusivo da avaliação explícita; os controles de saída também se aplicam ao fluxo normal.

## Implementação

`legalKnowledge/outputClaims.ts` contém verificações chamadas por `inspectLegalSafety`. O mesmo caminho é usado por `evaluateGeneratedSafety`, pelo serviço RAG, pela conservação de reescritas oficiais e pelos replays. O prompt também solicita preservar as condições, para reduzir a necessidade de descartar a orientação.

As referências negadas explicitamente não passam a ser o fundamento herdado das frases seguintes. Menções a juros em outro tema, como crédito, não sustentam automaticamente juros de restituição. Keywords de busca não são tratadas como conteúdo normativo da fonte.

| Controle | Motivo de descarte |
| --- | --- |
| Recomenda arrependimento pelo art. 49 sem sete dias | `prazo_arrependimento_omitido` |
| Lista alternativas do art. 20, mas omite uma das três previstas na fonte | `art20_reexecucao_omitida`, `art20_restituicao_omitida`, `art20_abatimento_omitido` |
| Atribui infração por não corrigir dados ao art. 72 | `art72_correcao_atribuicao_incompativel` |
| Acrescenta juros à restituição sem suporte na referência da afirmação | `juros_restituicao_sem_fonte` |
| Promete resultado de indenização | `indenizacao_resultado_nao_verificado` |

O contrato de lista do art. 20 reconhece os três componentes na fonte e verifica respostas que enumeram alternativas. Não exige todas as opções em toda menção ao artigo nem em uma resposta focada em uma única possibilidade. “Direito de pedir indenização” não é tratado como resultado garantido. Sinônimos usuais e algumas negações diretas são reconhecidos; não há interpretação universal do português.

Base normativa: [CDC consolidado oficial](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html), cotejado anteriormente com as fontes do catálogo. O art. 73 não foi acrescentado ao corpus: o controle impede a atribuição equivocada ao art. 72; não autoriza o modelo a citar norma ausente do contexto.

## Replay das respostas que motivaram a etapa

```powershell
docker exec backend_api npm run test:safety:replay
```

Padrão: `.ci-generated/eval-fusion-gemma.json` como origem e `.ci-generated/eval-output-claims-replay.json` como destino. A origem não é sobrescrita. O relatório guarda SHA-256 da origem e da base legal, conjunto de referências salvo, decisões atuais e motivos anteriores. Lê a base legal atual e não faz chamadas aos modelos. Não recalcula métricas end-to-end nem refaz recuperação/classificação.

Opções `SAFETY_REPLAY_INPUT` (caminho relativo ao backend) e `SAFETY_REPLAY_RESULTS_FILE` (nome JSON em `.ci-generated`) permitem repetir outra rodada sem misturar os arquivos. O campo `sources` explicita que são usadas fontes atuais com as referências históricas; não prova que uma base posteriormente editada seja idêntica àquela da geração original.

Na origem de onze entradas, havia dez gerações RAG e uma pergunta do classificador sem geração capturada. Os quatro textos problemáticos foram rejeitados; os outros seis continuaram aceitos. No replay da rodada completa anterior (72 entradas, 63 gerações), surgiu um bloqueio adicional em OD-28, cuja resposta também enumerava somente duas alternativas do art. 20. Esse resultado não constitui nova medição de precisão do modelo.

## Nova geração e refinamentos

Depois de build e reinício, foram executados OD-03/04 como controles e OD-05/26/46/PC-03 como problemas. Foram sete entradas, com `preview`, Gemma 12B e thinking desabilitado. Arquivo: [eval-output-claims-live.json](../backend/.ci-generated/eval-output-claims-live.json).

As cinco categorias/tipos/artigos diretos passaram; a pergunta inicial do PC-03 passou, mas o principal continuou Art. 35 em vez do Art. 20 esperado. A leitura do texto mostrou melhora no ponto original: OD-26 trouxe as três alternativas, e os juros não foram repetidos no PC-03. Contudo, o modelo acrescentou outras afirmações incorretas nos mesmos casos. As métricas acima correspondem à geração antes dos últimos refinamentos; não descrevem o comportamento do verificador final.

Foram adicionados três controles de fonte/finalidade:

- `cancelamento_vinculado_nao_verificado`: promessa de cancelamento também de outro contrato, sem ônus, vinculada à venda casada.
- `art43_prazo_finalidade_incorreta`: usa cinco dias como prazo de correção do cadastro; não confundir com comunicação da alteração aos destinatários anteriores. Duração histórica (“há cinco dias”) e explicações corretas de comunicação são preservadas.
- `reexecucao_terceiro_referencia_incompativel`: atribui contratar outro profissional com ressarcimento à alternativa do art. 35, em lugar de manter o fundamento/hipótese próprios da reexecução por terceiros.

O replay da nova geração ([eval-output-claims-live-replay.json](../backend/.ci-generated/eval-output-claims-live-replay.json)) rejeitou os textos de OD-05, OD-46 e PC-03 final; manteve OD-03, OD-04 e OD-26. Os erros não foram corrigidos retroativamente no JSON da geração. O prompt recebeu instruções correspondentes, mas isso não comprova obediência futura.

## Verificação local e limites

Suíte total: 181 aprovações, dois skips históricos, zero falhas e zero TODOs; tipos e build aprovados. Testes independentes usam outros serviços e formulações, incluem respostas válidas, negações, referências negadas, hipótese de juros de crédito, contraste de arts. 72/73 e verificação de que o texto reprovado não reaparece no encaminhamento. Uma fonte de art. 73 usada em teste é fictícia e não foi adicionada ao sistema.

Os controles são padrões delimitados. Não certificam aplicabilidade de todas as normas, todas as alternativas legais ou todo conteúdo institucional. Falta de atualização monetária/gratuidade em uma descrição, recomendações institucionais não verificadas, escopo complexo entre artigos e paráfrases fora dos padrões ainda exigem revisão. Não converter resposta aceita em selo de segurança nem descarte em acerto automático.

Uma última confirmação real de OD-05/46/PC-03 foi executada após os refinamentos e novo build/reinício: [eval-output-claims-confirmation.json](../backend/.ci-generated/eval-output-claims-confirmation.json). OD-05 voltou a recomendar arrependimento sem sete dias e foi redirecionado por `prazo_arrependimento_omitido`. OD-46 respondeu com art. 43, associando corretamente os cinco dias úteis à comunicação da alteração aos destinatários, e foi aceito. PC-03 fez a pergunta inicial esperada, mas sua orientação final repetiu a contratação de terceiro com ressarcimento sob art. 35 e foi redirecionada por `reexecucao_terceiro_referencia_incompativel`.

As duas categorias diretas passaram; tipo/artigo passaram em um dos dois casos. A categoria final e a clarificação de PC-03 passaram, mas o artigo final não: o encaminhamento seguro não atende à expectativa de art. 20 do benchmark. Esses descartes mostram a atuação dos controles, não que o modelo deixou de gerar afirmações inadequadas. Não houve benchmark completo novo; não foram iniciadas as mudanças de keywords.
