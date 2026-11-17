# Precisão do RAG — implementação e avaliação

## Correção posterior — esclarecimentos sem prefixo

Removida a dependência de `CLARIFICATION_PREFIX`. O estado existente da sessão registra `AI_CLARIFY:1`/`AI_CLARIFY:2`, sem migração de banco. Só perguntas efetivamente enviadas incrementam a contagem; contatos administrativos a preservam. Orientação final, retorno ao menu e saídas do fluxo removem o estado de esclarecimento. Depois de duas perguntas, uma nova necessidade de esclarecer gera encaminhamento; detalhes suficientes ainda permitem orientação. Prompts pedem somente a pergunta direta, sem introdução duplicada. Verificação: TypeScript e 52 testes UX aprovados, com serviços simulados; sem executar novo benchmark ou enviar WhatsApp.

15/11/2026. Alterações somente no backend; sem mudanças de seeds ou conteúdo jurídico.

## Alterações

- Preservada a reutilização da classificação no eval, feita pelo outro agente. Adicionados filtro `EVAL_CASE_IDS`, destino `EVAL_RESULTS_PATH` e backup automático antes de sobrescrever um resultado.
- Diagnóstico registra referência gerada, normalizada e permitidas. Separa formato inválido de referência válida fora do contexto.
- Identidade legal separada do título descritivo; suporte a sufixos e ao documento composto 66/67. Schema da resposta limita a escolha aos artigos recuperados. Validação em runtime e barreiras de prazo continuam ativas.
- Intenções explícitas tratadas antes do modelo, reaproveitando os reconhecedores de risco, saudações, logística e alteração de agenda. Acrescentados reconhecedores limitados de agendamento, acompanhamento, procedimento administrativo e pedido explícito de parecer. Relatos anexados não são consumidos como saudação. O modelo faz triagem material com nove categorias, sem disputar categorias administrativas. Ambiguidade pede esclarecimento; em consumo reconhecido, a orientação posterior ainda pode esclarecer detalhes.
- Busca lexical combina relato original e paráfrase antes da fusão com os vetores. Quando a paráfrase não passa no limiar vetorial, tenta o relato original com o mesmo limiar. Esse fallback pode acrescentar uma chamada de embedding; não usa outro modelo.
- Temperatura zero para classificação e geração RAG. Removido o `maxLength` do schema de texto; prompt pede concisão e frases completas. Runtime aceita até 900 caracteres, sem cortar strings. Excesso continua encaminhado à equipe.

## Verificações e evidências

TypeScript aprovado e 50 testes UX aprovados. Novos testes verificam referências compostas, enum dinâmico, motivos de descarte, intenções explícitas, evidência de identidade falsa, coleta antes da busca e fallback da paráfrase para o relato original. Esses testes usam dependências simuladas e não certificam qualidade jurídica.

Ensaios reais com Gemma3 12B/BGE-M3, sem WhatsApp:

| Arquivo | Resultado e interpretação |
| --- | --- |
| `eval-results-architecture-sample.json` | Iteração inicial: instruções adicionais no classificador plano foram insuficientes. |
| `eval-results-architecture-v2.json` | Separar campos sem priorizar domínio também desviava casos de consumo. |
| `eval-results-architecture-v3.json` | Oito casos diretos problemáticos: categoria 8/8, tipo 6/8 e artigo 6/8. Não representa o benchmark geral. |
| `eval-results-architecture-final-check.json` | Após ajustes finais: OD-11 e OD-39 com categoria e tipo corretos; artigo correto em um dos dois. PC-03 e PC-06 pediram esclarecimento inicial. Categoria final 1/2, artigo final 1/2, incluindo um `null` esperado. |

Os ensaios representam versões sucessivas. Não somar percentuais nem tratar todos como resultado da mesma implementação. Uma execução anterior foi interrompida antes de salvar por pedir esclarecimentos excessivos; os arquivos concluídos foram conservados. Os resultados originais e o baseline não foram sobrescritos.

A variante de domínio/intenção separados no JSON foi **rejeitada**: acertou somente 15/33 controles de categorias especiais (`classifier-results-rejected-domain-intent.json`). A variante reduzida seguinte fez 28/33; duas falhas eram reconhecedores de “ok, entendi” e “onde fica o Procon?”, corrigidos e cobertos por testes. Permaneceram erros do modelo em violência, trabalho e figura de linguagem. Os resultados v2/v3 da tabela são históricos dessa variante rejeitada, não evidência de validação geral da versão final.

O ensaio `eval-results-architecture-reduced.json` ainda tinha uma pergunta redundante bloqueando consumo já reconhecido. Isso foi removido; `eval-results-architecture-current.json` registra a checagem posterior. Não usar os resultados dos ensaios descartados como números finais.

A checagem `current` fez 7/8 em categoria, tipo e artigo nos casos diretos, mas ainda errou categoria e artigo no aluguel e artigo no serviço. Após essa checagem, acrescentou-se a exigência de evidência declarada para identidade falsa. A versão seguinte foi congelada para executar `eval-results-architecture-full.json`. Esse resultado completo, quando concluído, é a referência para os percentuais gerais.

## Limitações comprovadas

- OD-11 recuperou artigo 19, enquanto o gabarito espera 35; o artigo esperado não estava entre os candidatos da checagem final.
- PC-03 final escolheu artigo 40, enquanto o gabarito espera 20; novamente faltou o artigo esperado na recuperação final.
- PC-06 final continuou com categoria de consumo para aluguel entre particulares. A última resposta encaminhou à equipe, mas a categoria ainda está errada.
- PC-05 do dataset original espera esclarecimento para uma pergunta administrativa; revisar esse critério sem mudar o gabarito para esconder regressões.
- Não foi executado novamente o benchmark completo de 60+6 casos. Não há novo percentual geral demonstrado. Artigo igual ao gabarito não comprova correção do texto ou preservação de condições jurídicas.

## Reexecutar

```powershell
# Amostra focal, com arquivo separado.
docker exec -e EVAL_CASE_IDS=OD-03,OD-04,OD-05,OD-11,OD-31,OD-32,OD-39,OD-57,PC-03,PC-06 -e EVAL_RESULTS_PATH=eval-results-architecture-check.json backend_api npx tsx tests/llm/run-eval.ts

# Completo: sem filtro de IDs.
docker exec -e EVAL_RESULTS_PATH=eval-results-architecture-full.json backend_api npx tsx tests/llm/run-eval.ts
```

O eval cria/reinicia sessões `eval-*` no banco local; não envia WhatsApp nem cria reservas. A CLI importa o código montado em `/app`. O processo web pode precisar de reinício: o watcher já falhou neste ambiente.

Próxima prioridade: medir presença do artigo esperado nos candidatos separadamente da escolha da IA, investigar os casos residuais acima e executar o conjunto completo antes de declarar ganho geral. Evitar novas regras específicas por ID de teste e não enfraquecer barreiras para elevar cobertura.
