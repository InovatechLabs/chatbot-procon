# Comparação curta com Gemma — 17/11/2026

Estado: execução real concluída; resultado misto. A integração funciona, mas o conteúdo gerado ainda não atende aos critérios de segurança em todos os casos. Nenhum rascunho foi aprovado ou ativado em produção.

## Método

Com Kaggle, túneis e modelo aquecido confirmados pelo usuário, foi executado uma vez `docker exec backend_api npm run test:legal:live`. Foram dois relatos fictícios e duas gerações por relato: `off` e `preview`, reutilizando a classificação inicial. A classificação foi CONSUMO nos dois relatos. O comando terminou com código zero, confirmando o exercício técnico da integração; isso não é uma aprovação semântica das quatro respostas.

O script leu somente a base legal no banco, simulou identificação/histórico e não criou sessões nem enviou WhatsApp. A baseline `tests/llm/eval-results.json` não foi alterada. Não houve repetição para selecionar respostas mais favoráveis.

## Resultados observados

| Caso | Sem regras | Prévia com regras |
|---|---|---|
| Possível vício oculto | Orientação, art. 26; contou desde a entrega apesar do relato | Orientação, art. 26; distinguiu a evidência do defeito como marco |
| PIX para terceiro, causa desconhecida | Clarificação genérica sobre loja/produto | Orientação, art. 42, ainda sem estabelecer cobrança indevida no relato |

### Relato de vício oculto

Entrada: geladeira comprada há meses; defeito impossível de perceber antes, evidenciado ontem; pergunta sobre início da contagem.

Trecho sem regras:

> O prazo para reclamar de um defeito em produtos duráveis, como a sua geladeira, é de 90 dias a partir da data da entrega.

Trecho com regras:

> Se o defeito foi oculto, ou seja, não apareceu logo de cara, o prazo começa a contar a partir do momento em que o defeito se tornou evidente.

A prévia melhorou o marco informado, que é a diferença pertinente ao art. 26, § 3º. A definição coloquial do enquadramento ainda é simplificada; aparecimento posterior, isoladamente, não deve ser promovido pelo sistema a fato jurídico confirmado. O teste não demonstra que a resposta esteja completa ou que todos os casos desse tema terão o mesmo resultado. Conferência normativa: [CDC, art. 26 — publicação oficial da Câmara](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html), com [referência principal do Planalto](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm).

Os quatro candidatos originais permaneceram iguais: arts. 18, 26, 49 e 12. A prévia incluiu as quatro alternativas condicionais do art. 26, a distinção de produto e a regra de reparo. Acrescentou texto do art. 14 para comparação e substituiu a distinção antiga do art. 26 somente no contexto. Esse acréscimo também merece acompanhamento de relevância; documento disponível não implica fundamento adequado para a conclusão.

### Relato de PIX

Entrada: PIX destinado a uma loja chegou a terceiro; consumidor não sabe quem errou os dados e pergunta sobre devolução em dobro.

Sem regras, o modelo perguntou:

> Qual tipo de loja foi contatada e qual tipo de produto ou serviço foi adquirido?

Essa pergunta é genérica e não resolve diretamente a incerteza sobre a transferência, mas não ofereceu a orientação final do teste anterior.

Com regras, respondeu:

> De acordo com o Art. 42, se você pagou um valor indevido, pode ter direito à repetição do indébito, que é a devolução do que você pagou a mais.

O texto também mencionou correção, juros, engano justificável e análise das circunstâncias pelo PROCON. Apesar dessas ressalvas, continuou apresentando o art. 42 sem estabelecer a condição de cobrança pertinente; não explicou adequadamente a distinção entre transferência incorreta e cobrança/pagamento excessivo. O [art. 42 na fonte oficial](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html) não deve ser convertido pelo sistema em regra geral de todo PIX incorreto.

A seleção técnica incluiu `PIX-DESTINO-INCERTO` e `CDC42-COBRANCA`, portanto a regra de distinção chegou ao contexto e não foi suficiente para controlar a resposta. Os candidatos originais foram arts. 42, 72, 13 e 54-F. A prévia acrescentou os textos dos arts. 3 e 14. O modelo não foi obrigado a escolher o art. 42; esse foi o resultado da geração.

## Tamanho do contexto

| Caso | Prompt sem regras | Prompt em prévia | Somente bloco de regras |
|---|---:|---:|---:|
| Vício oculto | 8.361 caracteres | 14.019 caracteres | 3.989 caracteres |
| PIX | 6.187 caracteres | 9.707 caracteres | 1.172 caracteres |

Os valores são caracteres, não tokens. Não foi medida nesta execução a configuração efetiva de `num_ctx`, a contagem de tokens nem a eventual truncagem pelo servidor. O restante do aumento inclui textos legais acrescentados e instruções. Não atribuir o erro do PIX a limite de contexto sem essa medição. A amostra não mede precisão geral, estabilidade entre execuções ou efeito isolado de cada regra.
