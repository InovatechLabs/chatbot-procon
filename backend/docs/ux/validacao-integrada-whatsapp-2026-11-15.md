# Validação integrada pelo WhatsApp — 15/11/2026

Ambiente de testes do usuário: backend e PostgreSQL em Docker local, webhook via ngrok, Ollama no Kaggle exposto pelo túnel Cloudflare e conversa do bot aberta no WhatsApp Web do Edge. Modelos acessíveis: `gemma3:12b` e `bge-m3:latest`. A configuração de duas GPUs T4 foi informada pelo usuário; não foi medida nesta validação.

As mensagens abaixo foram enviadas na conversa do bot de testes. Os fluxos foram observados na interface real; o inspector do ngrok confirmou entregas do webhook com HTTP 200. As consultas de infraestrutura e de banco foram separadas das ações na interface.

## Resultados observados

| Cenário | Resultado |
| --- | --- |
| Infraestrutura | Backend e inspector ngrok responderam HTTP 200. O endpoint do Ollama retornou os modelos esperados. |
| Menu atualizado | Mensagem identifica Jacareí, mostra Documentos e não contém a promessa antiga de ausência de compartilhamento com terceiros. |
| Botões e listas da Meta | Processos & Queixas → Ver opções → O que levar foi percorrido por cliques reais. A resposta correta do menu foi recebida. |
| Reescrita protegida | Nesse percurso, o log informou descarte da reescrita; o texto oficial foi entregue integralmente, com Ajudou, obrigado / Outra dúvida / Agendar atendimento. |
| Pergunta após resposta do menu | “E se eu só tiver o comprovante de Pix?” recebeu orientação contextualizada sobre documento de compra, sem reiniciar o relato. |
| Agradecimento | “Obrigada!” recebeu resposta curta e Menu principal. |
| Fora de escopo | O relato sobre IPTU recebeu encaminhamento para o órgão responsável e somente Menu principal, sem Agendar. |
| Logística e pessoa atendente | “Qual o telefone do PROCON?” retornou contatos, endereço e informação de horário configurável. |
| Início do agendamento | O botão Agendar atendimento abriu a triagem; o atalho numérico `6` avançou para a coleta do nome. |
| Pedido de ajuda durante a coleta | “Quero falar com atendente” retornou contatos e manteve a etapa, sem ser aceito como nome. |
| Privacidade e nome | Aviso antes da coleta; nome fictício “Pessoa de Teste” confirmado por botão antes de pedir CPF. |
| CPF inválido | Sequência repetida de zeros recusada com orientação para conferir os números e opção de pedir ajuda/sair. |
| CPF de teste e datas | O valor usado no teste automatizado foi aceito; o bot disse apenas CPF registrado, sem repetir seu número. A lista mostrou cinco datas com vagas. |
| Horários | Páginas 1, 2 e 3 acessíveis. Primeira página com sete horários e navegação; última página mostrou 16h e 16h30, sem descarte de vagas após a décima linha. |
| Pergunta no meio dos horários | “Onde fica?” retornou o endereço e preservou a etapa. “Mais horários” por texto levou à página 3. |
| Interrupção | Nenhum horário foi escolhido. “cancelar” informou que a coleta foi interrompida e nenhuma vaga foi reservada. Contagem no banco confirmou zero novos agendamentos. |
| Menu com pontuação | “Menu!” retornou ao menu principal. |
| Continuação pelo pós-resposta | Outra dúvida abriu uma nova sessão e mostrou o menu. |
| Complemento tardio após correção | Dois trechos separados por mais de cinco segundos produziram uma única orientação final, sem publicar o esclarecimento obsoleto. Houve avisos de consulta em andamento para os dois trechos. |
| Barreira no RAG | Na repetição final às 16h59, o texto não confirmado foi substituído pelo encaminhamento seguro, com Agendar atendimento e Menu principal. O resultado comprova a barreira, não a qualidade jurídica da resposta que o modelo tentou gerar. |
| Encerramento do ensaio | Menu principal acionado e nova mensagem da raiz recebida às 17h. Consulta final da agenda de novembro retornou zero registros. |

## Falhas encontradas e correções

### Formatação da resposta gerada

A IA retornou títulos como `**O que a lei diz:**`. O WhatsApp exibiu asteriscos excedentes. O texto gravado no banco confirmou os marcadores duplos.

Foi adicionada normalização para o formato de destaque do WhatsApp antes da validação de tamanho e do retorno da IA. O prompt também passou a pedir um único asterisco. A mensagem que o webhook recebe e grava já contém a formatação normalizada.

### Complemento recebido durante uma análise

No primeiro ensaio, “Comprei um celular numa loja.” e “Ele não liga.” chegaram ao webhook com oito segundos de intervalo. Isso ultrapassou a janela de agrupamento de cinco segundos. A primeira análise perguntou qual era o problema, apesar de o complemento já estar aguardando na fila.

O handler passou a consultar se existe um novo texto elegível na fila antes de publicar o resultado da IA. Nesse caso, conserva o relato no histórico e deixa a próxima análise usar o complemento, sem exibir a resposta desatualizada. Comandos e interações não são tratados como complemento para esse descarte.

### Artigo pouco aderente ao problema

Na consulta original, o artigo 18 estava no banco, mas não entrou nos quatro resultados finais da busca híbrida. O modelo recebeu artigos sobre outros temas e respondeu com base no artigo 13, pouco aderente ao sintoma descrito.

O classificador passou a produzir também uma consulta contextual curta, na mesma chamada. Ela resolve referências como “ele” e acrescenta sinônimos do sintoma, sem inventar canal de compra, prazo, valor, causa ou artigo. O relato original continua no prompt da orientação. Quando não houver consulta contextual, a busca anterior permanece como fallback.

Na verificação direta com o modelo real, “Ele não liga.”, com o histórico da compra, gerou “O cidadão relata que o celular comprado não funciona.”. O artigo 18 passou a ser o primeiro resultado da busca híbrida. O prompt de orientação também distingue problema de funcionamento de acidente ou ausência de identificação do fabricante.

### Processo não recarregava os arquivos

As primeiras repetições após os ajustes ainda executaram o código anterior. As consultas diretas importavam os arquivos novos, mas as respostas do serviço continuavam gravando marcadores duplos. Os logs não mostravam recarga do processo.

Foi reiniciado somente `backend_api`, preservando banco, ngrok e notebook. Neste ambiente, o compose monta `backend` em `/app`, portanto o reinício carrega os arquivos atuais sem exigir nova execução dos seeds. A disponibilidade foi conferida novamente por `/health`.

### Prazo de conserto confundido com prazo para reclamar

Depois de recuperar o artigo correto, o modelo ainda afirmou que o consumidor teria trinta dias para informar o defeito à loja. Esse resultado foi reprovado: o prazo de trinta dias do artigo 18 trata de sanar o vício. A distinção foi conferida no [Guia de Defesa do Consumidor do PROCON-SP](https://www.procon.sp.gov.br/wp-content/uploads/2021/02/GuiadeDefesadoConsumidor.pdf).

O prompt passou a explicitar essa distinção. Foi acrescentada uma barreira para os erros observados: trinta dias apresentados como prazo para comunicar/reclamar e ampliação para 180 dias sem mencionar acordo. Uma resposta detectada é substituída por encaminhamento para a equipe, sem publicar o prazo incorreto. Essa barreira é conservadora e não certifica juridicamente toda resposta do modelo.

### Referência de artigo com título acentuado

A extração anterior podia interpretar o V de “Vício” como sufixo de artigo, por causa do limite de palavra da expressão regular. A comparação agora separa o identificador da descrição do título antes de validar. Referências que não correspondem aos artigos recuperados também levam ao encaminhamento seguro.

### Artigo recuperado, mas inadequado ao relato

Outra repetição citou o artigo 14 para a compra de um celular que não liga. A presença do artigo entre os resultados recuperados não prova sua pertinência. O [CDC publicado pelo PROCON-SP](https://www.procon.sp.gov.br/wp-content/uploads/2026/01/CDC-2026-site.pdf) distingue responsabilidade por serviço e vício do produto.

Foi acrescentada uma verificação restrita aos relatos explícitos de mau funcionamento de produto: respostas apoiadas nos artigos 13 ou 14, sem contexto de serviço, acidente ou dano externo, são encaminhadas à equipe. O prompt também passou a distinguir expressamente a compra do aparelho da contratação de um serviço. Casos de assistência técnica e lesão não são bloqueados por essa regra. Não se trata de um classificador jurídico geral.

## Verificação final

- TypeScript: aprovado com `npm exec -- tsc --noEmit`.
- Regressão automatizada após os ajustes: 43 testes aprovados com `npm run test:ux`.
- Repetição visual do RAG após reiniciar o processo: bloqueio da orientação inconsistente e encaminhamento à equipe observados no WhatsApp.
- Saúde do backend: HTTP 200; agenda consultada: zero registros em novembro.
- Avaliação completa dos 33 casos do classificador e benchmark RAG: não executados. Houve consultas direcionadas ao classificador e à recuperação com o modelo real durante o diagnóstico.

## Limites desta execução

Não foi criada uma reserva. Confirmação final com CPF mascarado, concorrência de reserva e cancelamento de um agendamento existente continuam cobertos pelos testes automatizados ou dependem de ensaio específico com dados descartáveis.

As conversas de teste permaneceram no histórico do WhatsApp e nas sessões do sistema. Não foi feita exclusão de histórico nem de registros de atendimento.
