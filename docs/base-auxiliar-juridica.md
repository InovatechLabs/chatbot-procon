# Base auxiliar jurídica — etapa 2

## Estado e arquivos

Criada em 17/11/2026, com onze registros: dez jurídicos e uma política operacional. Todos estão em `technical_draft`, sem responsável ou data de aprovação. Nenhum registro está ativo no bot.

- [Catálogo JSON](../backend/src/database/data/legalRules.json): conteúdo versionado.
- [Schema e parser](../backend/src/services/llm/legalKnowledge/catalog.ts): validação Zod, tipos e filtro de aprovados.
- [Testes](../backend/tests/ux/legal-rule-catalog.test.ts): integridade, referências, revisão e contratos de prazo.
- [Auditoria anterior](auditoria-seguranca-juridica.md): origem dos cenários e lacunas.

O catálogo ainda não é importado por `answerWithRAG`, pelo prompt, pelo classificador ou pela reescrita. Criá-lo não corrige por si só as quinze lacunas da auditoria. Não foram alterados `cdcData.json`, embeddings ou dados já importados no PostgreSQL. Esta etapa não exige seed, migração ou Kaggle.

## Conteúdo inicial

| Regra | Objetivo |
|---|---|
| `CDC18-REPARO` | Diferenciar finalidade de reparo e reclamação; preservar condições e exceções. |
| `CDC26-APARENTE-DURAVEL` | Reclamação, natureza durável e enquadramento aparente. |
| `CDC26-APARENTE-NAO_DURAVEL` | Variante não durável. |
| `CDC26-OCULTO-DURAVEL` | Reclamação, natureza durável e evidência do defeito. |
| `CDC26-OCULTO-NAO_DURAVEL` | Variante não durável. |
| `CDC27-REPARACAO-DANOS` | Distinguir reparação por danos e conserto; contemplar produto ou serviço. |
| `CDC18-VICIO-PRODUTO` | Evitar transformar mau funcionamento em prestação de serviço. |
| `CDC20-VICIO-SERVICO` | Distinguir qualidade do serviço, danos e desconhecimento do fornecedor. |
| `CDC42-COBRANCA` | Separar cobrança, pagamento e conclusão individual sobre restituição. |
| `PIX-DESTINO-INCERTO` | Preservar incerteza sobre os envolvidos e a causa da transferência. |
| `SEM-FUNDAMENTO-SUFICIENTE` | Política de abstenção quando não existe suporte suficiente. |

As referências principais são o [CDC no Planalto](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm) e o [texto oficial da Câmara](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html). O acesso direto ao Planalto apresentou verificação; o catálogo registra `search_excerpt` para essa fonte e `full_text` para o cotejamento da Câmara. Os fundamentos de cada regra apontam para a publicação efetivamente lida. `checkedOn` registra conferência técnica, não aprovação pelo PROCON.

A regra de abstenção é explicitamente `operational`: tem referência à auditoria interna, sem artigo ou prazo inventado como fundamento. Sua aplicação é uma decisão de segurança do sistema, não uma suposta ordem específica do CDC.

## Como ler os registros

`schemaVersion` identifica o formato e `version` identifica a revisão do catálogo. Cada regra também tem versão própria. `relatedArticles` aponta para documentos que precisam estar disponíveis, enquanto `legalBasis` identifica dispositivos e fontes. Artigos relacionados podem ser necessários para comparação, sem que todos sejam fundamento da mesma conclusão.

`conditions` é uma conjunção pequena de fatos conhecidos e tipados. Não contém código, expressão JavaScript ou instrução para o modelo executar. `unknown` não pode ser cadastrado como valor que satisfaz condição. Ainda não existe matcher nem extrator de fatos nesta etapa.

Na integração futura, recuperar uma regra pelo tema e confirmar sua aplicabilidade serão operações diferentes. Uma condição desconhecida não autoriza ignorar uma proteção relevante: deve produzir pedido de informação ou encaminhamento quando necessário. Não inferir vício oculto somente porque o defeito apareceu depois, nem responsabilidade bancária somente porque o classificador a mencionou.

`requirements` separa `general_guidance`, `individual_deadline` e `individual_restitution`. Datas não são requisitos gerais de toda conversa. `deliveredOn` representa entrega ou término do serviço conforme o caso; para cálculo futuro, essa representação deverá ser especializada quando houver necessidade de distingui-los. As datas de conhecimento do dano e autoria são separadas. A revisão de causas obstativas também é um fato independente.

No reparo, `agreementReviewed` significa que a situação de eventual convenção foi analisada; não significa que houve acordo. `agreedVariation.requiresAgreement` continua sendo condição adicional. `repairExceptionsReviewed` não afirma que uma exceção existe; exige que ela não seja ignorada. Esses estados não devem ser preenchidos automaticamente a partir de uma frase genérica do modelo.

`deadline` contém finalidade, duração, unidade e marco. No reparo, `requires_case_review` evita inventar um evento inicial não confirmado. `automaticCalculation` permanece falso em todas as regras. O intervalo convencionado é dado condicional, não uma autorização de ampliação automática.

`modelNotes` reúne a distinção curta, elementos a preservar e afirmações proibidas. `examples` oferece um exemplo de pertinência e outro de insuficiência; exemplos não constituem prova do caso nem gabarito para classificar toda mensagem parecida. `auditCases` dá rastreabilidade aos vinte cenários anteriores, sem afirmar que já estão protegidos.

`safetyPolicy` abrange orientação, pergunta, redirecionamento e reescrita. Distingue fatos do consumidor de suporte em texto normativo recuperado. Fala do assistente e inferência do modelo não são fatos verificados. A existência de um artigo ou um escore alto de busca não comprova que o texto sustenta a conclusão.

## Validação e revisão

`parseLegalRuleCatalog(raw, knownArticles)` faz validação estrutural e cruzada. `knownArticles` deve conter os identificadores normalizados da base legal, obtidos com `articleReferences`. O parser rejeita IDs duplicados, fontes inexistentes, fundamentos fora dos artigos relacionados, condições incompatíveis com o tipo do fato, datas civis inválidas, intervalos inválidos e fatos essenciais ausentes para o marco cadastrado.

Um schema válido não comprova correção jurídica do conteúdo. Em especial, não comprova que uma regra corresponde à mensagem do consumidor. Os testes conferem os dados iniciais contra os dispositivos selecionados, mas não substituem a revisão das condições e exceções.

`approvedLegalRules(catalog)` retorna somente registros com `status: approved`. O schema exige `reviewedBy` preenchido e `reviewedOn` não anterior à conferência registrada. Hoje esse filtro retorna uma lista vazia. Os testes usam aprovação fictícia apenas em cópias na memória; não aprovam o arquivo real. Essa metadata não é assinatura digital nem fluxo de autorização do painel.

Ao modificar uma regra: atualizar versão e conferência, retornar a rascunho se o conteúdo mudou, revisar a fonte e registrar a aprovação da nova versão de forma explícita. A revisão deve ser feita pelo responsável definido no projeto/PROCON; não atribuir revisão jurídica a quem apenas alterou o código. Depois executar `npm run check` no backend, ou `docker exec backend_api npm run check` pela raiz.

## Fonte única e integração posterior

O catálogo não foi copiado para `distincao` nem para o prompt. A origem única futura das regras auxiliares deve ser este arquivo. Para os temas já migrados, a etapa de integração precisará substituir as distinções antigas pertinentes, sem concatenar instruções contraditórias dos dois lugares. Artigos 20, 26, 27 e 42 são prioridades dessa transição. Os outros temas da auditoria permanecem no backlog; onze regras não cobrem todos os artigos.

Essa transição não deve apagar distinções ainda necessárias ou ativar rascunhos implicitamente. A implementação deverá decidir explicitamente quais versões revisadas participam do teste e da produção. Também deverá tratar a disponibilidade do JSON no artefato compilado; nesta etapa os testes leem o arquivo fonte e o parser não assume caminho de disco.

Na próxima etapa autorizada: recuperação seletiva, contexto compacto e diagnóstico de regras selecionadas. Posteriormente: validação das respostas, resolução dos TODOs e medição com Gemma/Kaggle. Não enviar o catálogo inteiro nem gerar embeddings novos apenas por existir essa base auxiliar.

## Resultado da etapa

Tipos e build aprovados no container. Suíte: 97 testes aprovados, dois skips históricos e quinze TODOs conhecidos, totalizando 114. Os sete novos testes do catálogo passaram. Nenhum modelo, banco ou WhatsApp real foi usado na validação destes dados.

Etapa 2 concluída para revisão. A integração ao RAG depende da autorização da próxima etapa e não foi iniciada automaticamente.

A etapa 3 foi autorizada e implementou a [integração seletiva](integracao-regras-juridicas.md). O formato do catálogo agora é 2, revisão 2, incluindo grupos e termos de recuperação. Regras seguem em rascunho; prévia de avaliação e uso de aprovadas são separados. Consultar o documento da etapa 3 para o estado da validação.
