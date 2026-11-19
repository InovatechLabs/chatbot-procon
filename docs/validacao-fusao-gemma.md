# Validação pontual da fusão com Gemma

## Execução

Após autorização, build TypeScript e reinício do backend, health 200. Ollama acessível; inicialmente não havia modelos residentes em `/api/ps`. O teste executou Gemma `gemma3:12b`, thinking desabilitado, com regras em `preview`, preservando a comparação com o benchmark anterior.

Foram dez casos: seis escolhidos pelos resgates de recuperação (OD-05, OD-23, OD-36, OD-41, OD-45 e PC-03), mais quatro controles (OD-03, OD-04, OD-26 e OD-46). São nove casos diretos e dois turnos do PC-03, totalizando onze entradas. O script usa sessões `eval-*` com relatos fictícios, sem envio de WhatsApp.

As consultas foram produzidas novamente pelo classificador. Portanto, esta rodada avalia o fluxo atual, não é um experimento pareado com consultas e gerações idênticas às anteriores. Os parâmetros, fontes recuperadas, resgates e geração anterior ao verificador ficam no [JSON desta rodada](../backend/.ci-generated/eval-fusion-gemma.json). Nenhum benchmark anterior foi sobrescrito.

## Métricas estritas

| Grupo | Resultado |
| --- | --- |
| Categoria direta | 9/9 |
| Tipo direto | 9/9 |
| Artigo direto | 7/9 |
| Pergunta inicial de clarificação | 1/1 |
| Categoria final da clarificação | 1/1 |
| Artigo final da clarificação | 0/1 |

Todos concluídos, sem falha técnica ou descarte de segurança. Isso não significa que todas as orientações tenham conteúdo completo ou correto. Os quatro controles mantiveram os artigos e tipos esperados, mas houve pendências de conteúdo em dois deles.

## Casos resgatados

| Caso | Observação |
| --- | --- |
| OD-05 | Art. 39 entrou como candidato adicional e foi escolhido. Na rodada completa anterior havia redirecionamento. A identificação de venda casada melhorou; a recomendação adicional de arrependimento ficou sem explicitar seu prazo. |
| OD-23 | Art. 17 entrou como adicional e foi citado expressamente para reconhecer a proteção da vítima que não comprou o produto. O principal continuou Art. 12: erro no gabarito estrito, sem ausência da equiparação no texto. |
| OD-36 | Art. 30 entrou como adicional e foi escolhido, em lugar do Art. 35 anterior. A resposta vinculou a oferta ao fornecedor. |
| OD-41 | Art. 36 e orientação sobre identificar publicidade foram mantidos. Nesta execução, o art. 36 já estava nos candidatos base; não contar como novo resgate. |
| OD-45 | Art. 30 estava no contexto, mas o principal continuou Art. 35. Divergência estrita; a resposta tratou do preço anunciado e cumprimento da oferta. Acrescentou sugestão de procurar livro de ocorrências do supermercado sem suporte nas leis fornecidas. |
| PC-03 | Art. 20 entrou como adicional, mas o principal continuou Art. 35. A análise de descumprimento da oferta é relacionada ao relato de serviço não prestado; a resposta acrescentou juros sem base expressa no contexto e usou linguagem categórica sobre indenização. |

Não houve alteração de gabaritos para aceitar essas saídas. A presença de artigo secundário ou de alternativa plausível deve ser analisada separadamente da métrica estrita.

## Pendências de conteúdo

Cotejamento com o [CDC consolidado oficial da Câmara](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html), além dos textos efetivamente recuperados:

- **OD-05:** recomenda arrependimento se a contratação foi fora do estabelecimento, mas não informa a condição temporal. Não inventou prazo; omitiu condição relevante da orientação adicional.
- **OD-26:** explicou corretamente vício de qualidade e ofereceu reexecução ou restituição; omitiu abatimento proporcional, também previsto na fonte recuperada. A definição melhorou em relação à rodada que misturava segurança com qualidade, mas a lista de alternativas permaneceu incompleta.
- **OD-46:** acesso/correção pelo art. 43 estão presentes. Entretanto, a frase associa tanto recusa de acesso quanto falta de correção à infração do art. 72. O art. 72 trata de acesso; a previsão específica sobre não corrigir informação inexata está no art. 73, ausente do corpus atual e do contexto. Não atribuir a mesma infração às duas condutas.
- **PC-03:** as fontes incluídas falam de atualização monetária e perdas e danos, mas não oferecem suporte expresso para o acréscimo de juros dado na resposta. A formulação também não distingue a análise dos danos de um resultado garantido.

Esses pontos passaram pelas barreiras atuais. O aviso de IA não resolve essas lacunas, e não é correto dizer que toda orientação insegura foi encaminhada.

Há ainda adições tangenciais: OD-04 recebeu regras de controle de preços e reparação de peças; PC-03 recebeu contratos de compra a prazo. Não derrubaram as métricas nesta amostra, mas mostram que posição forte em um canal não comprova pertinência material. A revisão lexical/keywords continua necessária.

## Conclusão da etapa

Correções e validações posteriores dos problemas de conteúdo estão documentadas em [Controles delimitados de conteúdo das orientações](controles-conteudo-orientacoes.md). Os resultados abaixo preservam o diagnóstico desta rodada anterior às correções.

A fusão passou pela validação de recuperação e demonstrou utilidade concreta em parte das respostas. Não há evidência suficiente para certificar a qualidade geral da orientação. A amostra é pequena e já conhecida; não atribuir toda diferença ao ajuste de fusão, pois as consultas e gerações variam.
