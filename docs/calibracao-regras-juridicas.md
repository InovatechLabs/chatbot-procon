# Calibração delimitada das regras e barreiras jurídicas

## Escopo

Correção motivada pelo benchmark `tests/llm/eval-preview-results.json`: famílias de produto, serviço e reparo eram incluídas por palavras funcionais ou apenas pela presença de artigos entre candidatos. No OD-12, a família específica de PIX perdia espaço para famílias tangenciais. A rodada também mostrou marcos de arrependimento inventados, restituição sem pagamento confirmado e troca de “crédito em confiança” por “cobrança em confiança”.

Não altera o classificador, o modelo, os gabaritos nem a aprovação das regras. O modo de produção continua `approved`; rascunhos só entram na avaliação `preview` explicitamente solicitada.

## Seleção de contexto

- Termos compostos correspondem à expressão completa: “não funciona” não corresponde somente a “não”. A seleção auxiliar não modifica o BM25 da recuperação principal de artigos.
- A normalização contempla plurais simples, inclusive “dano”/“danos”, sem reduzir a expressão composta a palavras soltas.
- Um artigo entre os candidatos só desempata uma correspondência temática já existente; sozinho não ativa uma família.
- Produto e serviço exigem sinais adicionais de vício/qualidade. Reparo não é ativado apenas por “assistência” genérica; cobrança não é ativada apenas por pagamento ou devolução; entrega não ativa sozinha os quatro cenários de prazo para reclamar.
- Transferência explícita prioriza a família de PIX. Quando necessário, ela substitui candidatos finais que não sustentam as regras selecionadas, mantendo o limite de seis documentos. `displacedArticles` registra as referências removidas; `addedArticles` registra as fontes acrescentadas.
- Famílias de prazo continuam indivisíveis. Não se cortam alternativas ou condições para caber nos limites de caracteres ou artigos.

A seleção é temática, não comprovação dos fatos ou da aplicabilidade jurídica. Vocabulário não previsto pode deixar de ativar uma família; isso não cria uma categoria nova nem elimina o fluxo principal.

## Saída e prompt

- Bloqueio delimitado de arrependimento contado da entrega prevista, em lugar de recebimento efetivo.
- Detecta também substituição por data da compra diante de não recebimento e ausência de marco na explicação dos sete dias.
- Preserva a explicação geral “você tem sete dias desde o recebimento”; não a confunde automaticamente com cálculo de dias restantes. Expressões como “restam três dias” continuam sujeitas ao veto de conclusão individual.
- Bloqueio de “cobrança em confiança” quando a orientação invoca o art. 54-G.
- Verificação de pagamento também em formulações como “você pode ter direito à repetição do indébito” e “valor cobrado”, preservando explicações expressamente condicionadas a pagamento.
- Verificação de dano e autoria também quando o art. 27 é o artigo principal, sem equiparar conhecimento de defeito a conhecimento do dano.
- Distingue quantidade de prazo de reclamação de quantidade de prazo de conserto nos controles de natureza e marco.
- O prompt diferencia dúvidas conceituais de relatos que realmente precisam identificar produto/serviço, explicita as condições de restituição e desencoraja direitos/prazos tangenciais.

Continuam sendo controles delimitados de linguagem. Uma resposta aceita não recebe certificação jurídica automática.

## Registro para avaliação

`RagOptions.onGeneratedForEvaluation` é uma captura explícita anterior ao descarte, após sanitização e normalização de texto. Exige `includeDiagnostics`. O atendimento normal não a configura; o texto não é acrescentado aos diagnósticos comuns nem aos logs do servidor.

O benchmark de relatos fictícios configura essa captura e salva `generatedBeforeGuard` em cada caso/turno. O campo é nulo se não houve geração RAG, por exemplo em resposta fixa ou clarificação inicial do classificador. Não guarda a cadeia de raciocínio nem o payload bruto do provedor. Permite revisar respostas descartadas por tamanho, prazo ou outras barreiras sem enviá-las ao consumidor.

## Execução e revisão

Após `npm run check`, reiniciar o backend e verificar `/health`. Não é necessário reconstruir a imagem Docker quando só houve alteração de fontes com volume montado e nenhuma dependência mudou; o build TypeScript e o reinício foram executados.

O avaliador aceita `EVAL_CASE_IDS` separado por vírgulas, `EVAL_LEGAL_RULES_MODE=preview` e `EVAL_RESULTS_PATH` para arquivo separado. `run-eval.ts` usa sessões identificadas como `eval-*` com relatos fictícios; não envia WhatsApp. Não confundir esse comportamento com o avaliador ampliado de memória simulada, que apenas lê a base legal.

Relatórios desta correção ficam em `backend/.ci-generated/`, ignorada pelo Git. A rodada anterior e a baseline histórica são preservadas. Primeiro revisar a rodada focada, incluindo a geração descartada; somente depois considerar benchmark completo. Comparar artigo, categoria, tipo, conteúdo, seleção das regras e motivos de descarte separadamente, sem modificar o gabarito para favorecer os resultados.

## Validação focada

Tipos, build e suíte local: 153 aprovações, dois skips históricos, zero TODOs. Backend reiniciado após o build; `/health` respondeu 200 na primeira rodada.

Primeira rodada real: 19 casos diretos e três casos de clarificação (25 entradas/turnos), em `.ci-generated/eval-calibration-targeted.json`. A captura revelou dois bloqueios excessivos relativos a dano/quantidade e trouxe uma variante do marco inventado no PC-01. Foram ajustados com regressões obrigatórias, sem alterar gabaritos.

Confirmação: oito casos diretos e dois de clarificação (12 entradas/turnos), em `.ci-generated/eval-calibration-confirmation.json`, com novo build e reinício. OD-20, OD-24, OD-26 e OD-30 produziram orientações aceitas. OD-01 e OD-60 foram substituídos por pergunta sobre pagamento; PC-02 final também. OD-32 foi encaminhado por condições/marco incompletos. OD-33 trocou conhecimento do dano por conhecimento do defeito e foi encaminhado. PC-01 final substituiu recebimento por data da compra e foi encaminhado.

A confirmação não mede precisão geral: o subconjunto foi escolhido pelos problemas. As métricas estritas foram 8/8 categorias, 4/8 tipos e 4/8 artigos nos diretos, e 0/2 artigos finais nas clarificações, incluindo descartes que impediram orientação insegura. Não converter esses descartes em “acertos jurídicos” nem suprimir o custo de utilidade que eles representam.

## Benchmark completo e revisão final

Executados os 60 casos diretos e os seis casos de clarificação (72 entradas/turnos). Todos concluídos; sem falhas técnicas, JSON inválido ou ausência de diagnóstico. Arquivo preservado: `.ci-generated/eval-calibration-full.json`.

| Métrica | Preview anterior | Rodada completa desta correção |
| --- | --- | --- |
| Categoria direta | 58/60 | 58/60 |
| Tipo direto | 52/60 | 50/60 |
| Artigo direto | 43/60 | 39/60 |
| Pergunta inicial | 4/5 | 4/5 |
| Tipo inicial | 5/6 | 5/6 |
| Categoria final | 5/6 | 5/6 |
| Artigo final | 3/6 | 3/6 |

As métricas não demonstram aumento global de precisão. Há custo de utilidade nos descartes; não reclassificar um bloqueio como acerto nem atribuir toda variação às regras a partir de uma única rodada.

Nas mesmas 72 entradas/turnos, as inclusões de `CDC18-VICIO-PRODUTO` caíram de 45 para oito e `CDC18-REPARO` de 41 para três. `PIX-DESTINO-INCERTO` entrou no OD-12, em vez de perder orçamento para conserto. Na rodada completa, `SEM-FUNDAMENTO-SUFICIENTE` foi incluída em 39 entradas: é uma alternativa operacional condicional, não afirma ausência de fundamento nas leis recuperadas.

A leitura das gerações descartadas confirmou problemas concretos: OD-01/02 e OD-60 acrescentaram restituição sem pagamento confirmado; OD-05 inventou contratação fora do estabelecimento e acrescentou arrependimento sem marco; OD-19 acrescentou cinco anos sem marco; OD-33 trocou dano por defeito; OD-34 acrescentou devolução em dobro sem a exceção. OD-32 omitiu a natureza e o marco da hipótese aparente. Não significa que todo encaminhamento seja inevitável: um gerador que se limitasse à orientação sustentada poderia responder sem esse custo.

A revisão final também encontrou uma falha do próprio verificador: “receber seu dinheiro” satisfazia erroneamente o teste de recebimento do art. 49. O reconhecimento agora distingue recebimento do produto/serviço de reembolso. Foi acrescentada regressão obrigatória. Após essa correção, o replay de todas as 72 entradas (63 gerações RAG disponíveis) alterou somente **PC-01 inicial**, rejeitando a explicação de sete dias sem marco. O replay rejeitou 13 gerações no total; isso não equivale a 13 acertos e as demais não estão certificadas juridicamente.

O replay usa o mesmo `evaluateGeneratedSafety`, as referências efetivamente incluídas e leitura da base legal; não faz geração, classificação ou busca. Preserva o SHA-256 do relatório original em `.ci-generated/eval-calibration-full-replay.json`. Não houve nova rodada end-to-end após essa última correção delimitada: a distinção foi validada por teste obrigatório e replay. As métricas acima continuam sendo da rodada real, sem reescrever resultados históricos.

**Limites restantes observados em respostas aceitas:** OD-46 respondeu sobre publicidade a uma pergunta de cadastro; OD-48 escolheu art. 54 e afirmou possibilidade de discutir/modificar o conteúdo, contrariando a definição apresentada; OD-26 misturou linguagem de segurança do serviço com vício de qualidade; PC-05 ainda não priorizou descumprimento da oferta. PC-01 inicial ainda precisa de clarificação útil (o veto evita enviar o prazo, mas encaminhamento não resolve a intenção). A correção delimitada está implementada; a qualidade geral das orientações não deve ser declarada concluída.

Verificação local final: 153 aprovações, dois skips históricos, zero falhas e zero TODOs, incluindo o caso de reembolso confundido com recebimento. Build e novo reinício ao final; health conferido separadamente. Não houve alteração de schema, seed, modelo ou aprovação automática de regras. A etapa de medição de tokens/contexto/custo não foi iniciada.

## Correção posterior: anonimização e preservação do relato

A análise da recuperação identificou que `redactIdentifiers` consumia “meu nome em um cadastro...” como apresentação de nome: a alternativa `e` aceitava o início de `em` e removia o resto da frase. A mesma falta de delimitação existia nos introdutores de endereço e em “me chamo”.

Foi exigido fim do introdutor por espaço, separador de valor ou fim de texto. O controle usa lookahead explícito, inclusive após “é”, sem depender de `\b` após letra acentuada. Apresentações explícitas continuam ocultas; menções como “meu nome está negativado”, “meu endereço em um cadastro” e “o banco me chamou” preservam os fatos.

Regressões cobrem apresentações com/sem acento, endereço, pontuação, preservação do relato e passagem íntegra pela classificação, embedding e geração simulados. Verificação desta correção: 157 aprovações, dois skips históricos, zero falhas/TODOs; tipos e build aprovados, seguido de reinício do backend.

Teste real pontual com Gemma, somente OD-46: categoria `CONSUMO`, tipo `orientacao_final`, artigo `Art. 43`, todos iguais ao gabarito. A consulta passou a ser “Inclusão em cadastro de consumidores com informação negativa incorreta”; o art. 43 veio em primeiro entre os candidatos, seguido dos arts. 72, 42-A e 44. Resultado separado em `.ci-generated/eval-redaction-OD46.json`, sem substituir os benchmarks anteriores. A resposta tratou de acesso aos dados; não considerar um teste pontual certificação de completude ou acerto geral.

Não houve alteração da busca, das keywords, dos vetores nem do catálogo nesta correção. A avaliação isolada de recuperação permanece para a próxima etapa, mediante autorização.
