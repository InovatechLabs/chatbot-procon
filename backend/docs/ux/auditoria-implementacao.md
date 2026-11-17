# Auditoria de UX — implementação por seção

Data: 15/11/2026. Escopo: somente `backend`.

Referências lidas: `CONTEXTO_AGENTE_PROCON_UX.md` e `Dúvidas-Frequentes.txt`, fornecidos pelo usuário. A auditoria foi usada como referência; propostas de produto foram separadas das falhas reproduzíveis. As alterações locais que já existiam foram preservadas, incluindo o menu reduzido e os textos de Q8, Q26 e Q27.

## Seção 3 — navegação e integração entre menu e IA

| Itens | Resultado |
| --- | --- |
| NAV-01 | Redução já existente preservada. Apenas identidade de Jacareí, nome de Documentos e aviso de privacidade foram alinhados. |
| NAV-02 | Rótulo Documentos consistente e identidade do assistente padronizada. |
| NAV-03 | Rótulos específicos para marketplace, negativa de garantia, prazo do conserto, troca sem modelo e portabilidade do benefício. Prazos e andamento já estavam corrigidos. |
| NAV-04 | Categorias distinguidas como Regras da garantia e Meu produto quebrou, sem fusão nem exclusão de respostas. |
| NAV-05 | Q13, Q24 e Q42 abrem com contexto. A reescrita recebe o percurso real e não o título Questão X. |
| NAV-06 | Q18 informa 30/90 dias, com base nas perguntas 18, 19 e 29 do documento do PROCON. |
| NAV-07 | Ignorado como sugestão de reorganização, conforme pedido do usuário. |
| DE-01, DE-02, DE-03 | Pós-resposta com Ajudou, obrigado / Outra dúvida / Agendar atendimento. Avaliação opcional e recusa de agendamento sem encerramento forçado. |
| DE-04 | Garantia tem Voltar e respeita dez linhas. Q22 foi movida para a categoria prática; a resposta continua acessível. |
| DE-05 | Saídas que levam à raiz dizem Menu principal. Não se apresentam como retorno ao nível anterior. |
| DE-06 | Documentos só é interceptado quando a opção não possui destino; Documentos gerais com destino exibe sua resposta. |
| DE-07, HY-08 | Um texto de pendência compartilhado, com horário, contato para ajuste e Menu principal. Entendi de botão antigo não inicia nota indevida. |
| DE-08 | Confirmação e documentos separados, com saída e avaliação opcional. |
| DE-09 | Implementada a alternativa mínima da auditoria: contato para cancelar/remarcar. O bot informa que a reserva continua válida; não promete cancelamento. |
| DE-10 | Só oferece datas com vagas em uma janela de 15 dias úteis; se não houver, fornece contato e encerra a coleta. Horários paginados, sem descarte silencioso. |
| DE-11 | Coleta com mensagens de ajuda, confirmação do nome, opção de sair e contato para CPF indisponível. |
| HY-01, HY-12 | Entrada no modo IA informada, lembrete de menu nos esclarecimentos e saída do modo IA ao navegar. |
| HY-02 | Histórico grava os rótulos escolhidos e o texto efetivamente enviado, inclusive reescrita e consultas de documentos. |
| HY-03 | Após duas rodadas de esclarecimento, oferece análise presencial. |
| HY-04 | Botão adicional de entrada na IA deixado como sugestão; mantidos os três botões atuais. |
| HY-05, HY-06 | Reescrita mantida, prompt restrito, percurso real, limite de tamanho e trava de números, unidades, valores, porcentagens, artigos e ressalvas. Divergência/falha usa o texto oficial integral. |
| HY-07 | Base legal exibida somente se a referência retornada coincide com artigo efetivamente recuperado. Não acrescenta CDC a uma norma sem identificação. |
| HY-09, HY-10 | Indisponibilidade tem mensagem própria. Fora de escopo e falha técnica oferecem menu, sem convite contraditório para agendar. |
| HY-11 | Ambiguidade é tratada antes dos embeddings. Baixa similaridade deixa de ser descrita como caso com detalhes específicos. |
| HY-13 | Logística e atendimento humano têm contatos e horário configurável, inclusive durante a coleta. |
| HY-14 | Inferência automática da categoria não implementada: sugestão de evolução. A seleção manual mantém Outros assuntos para casos sem categoria específica. |

## Seção 4 — acessibilidade e linguagem

| Itens | Resultado |
| --- | --- |
| LC-01, LC-06, LC-07 | Explicações de RMC/RCC, devolução, pagamento total, prescrição, decisões da Justiça e documentos do Meu INSS. CNPJ tem indicação de onde encontrar. Respostas fora de escopo usam linguagem mais direta. Revisão jurídica integral continua a cargo do PROCON. |
| LC-02 | Reduzido negrito de parágrafos inteiros nos textos alterados. |
| LC-03 | Q5 passa a orientar pedido de cancelamento e guarda do protocolo. Melhorias locais de Q8/Q26 preservadas. |
| LC-04 | Exemplo de Q21 reescrito mantendo os nove meses do documento original. |
| LC-05 | Rótulo Problema ou risco? mantém os exemplos de vício e dano à segurança. Agendamento usa Produto com problema. |
| LC-08 | Portabilidade identificada como portabilidade do benefício. |
| LC-09 | Promessas de resultado vedadas nos prompts. Regras jurídicas do FAQ não foram substituídas por novas interpretações. |
| MOB-01 | Transporte divide conteúdo longo sem perder informação. Corpo interativo limitado a 1.024, títulos a 20/24, descrições a 72 e listas a dez linhas. Contagem conservadora em UTF-16, sem quebrar emojis. RAG limitado a 600 caracteres antes de referência e aviso. |
| MOB-02 | Horários indicam manhã ou tarde. |
| MOB-03 | Novas mensagens usam blocos simples; revisão estética global de emojis deixada como sugestão. |
| MOB-04, TONE-03 | Nota única opcional com Ajudou / Mais ou menos / Não ajudou. Comentário somente após ação explícita. Sem despedida forçada. |
| MOB-05 | Removida promessa de não compartilhar com terceiros. Aviso antes de nome/CPF. Pedidos sobre privacidade e apagamento são encaminhados à equipe, sem simular exclusão. |
| MOB-06 | CPF mascarado na confirmação; não é repetido após coleta nem gravado como relato para IA. |
| MOB-07, MOB-08 | Mensagens específicas para áudio/arquivos e reações ignoradas. Transcrição permanece uma evolução opcional. |
| TONE-01, TONE-02, TONE-04 | Fora de escopo mais acolhedor, erros de coleta em tom de ajuda e identidade do assistente consistente. |

## Seção 5 — casos extremos

| Itens | Resultado |
| --- | --- |
| EDGE-01, EDGE-02 | Follow-up recebe contexto. Botão inexistente ou de outro submenu recupera o menu. IDs estáveis em novas cargas; atualização conserva IDs existentes. |
| EDGE-03 | Agrupamento de relatos por cinco segundos, fila por telefone e deduplicação de eventos. Avaliações antigas não são registradas novamente; reserva é revalidada no serviço transacional existente. |
| EDGE-04 | Agendamento permanece retomável por 24 horas, com aviso após 30 minutos. Sequência isolada de onze números fora da coleta não vai ao RAG. |
| EDGE-05 | Pedido de humano/ajuda não é aceito como nome. Nome confirmado antes do CPF. |
| EDGE-06, EDGE-07 | Número/rótulo reconhecidos nas opções exibidas; sim/não determinístico no convite para agendar. Para menus persistidos, opções são recuperadas do banco. |
| EDGE-08, EDGE-09 | Saudações e agradecimentos normalizados sem consumir perguntas ou relatos anexados. |
| EDGE-10, EDGE-14 | Mídias tratadas conforme tipo; reações ignoradas. |
| EDGE-11 | Comentário depende de botão explícito. Perguntas reconhecidas nessa etapa seguem para atendimento, sem fechar a sessão. |
| EDGE-12 | Logística durante coleta/data/horário preserva etapa e opções para retomada. Outros textos recebem instrução para continuar ou sair. |
| EDGE-13, EDGE-15, EDGE-17 | Exemplos de abreviações, vários problemas e tom de estresse nos prompts. Resultado efetivo depende da avaliação do modelo. |
| EDGE-16 | Mantidos registros iniciais do caso junto à janela recente, sem gerar resumo que possa inventar fatos. |
| EDGE-18 | Gatilho determinístico conservador antes da coleta/classificador e categoria de risco pessoal. Frases e recursos exigem revisão periódica; não é detector completo de situações de risco. |
| EDGE-19, EDGE-20, EDGE-21 | Categorias próprias para golpe, violência e outros assuntos; fora de escopo sem agendamento. |
| EDGE-22 | Repetição de fora de escopo reconhece a frustração e mantém apenas o menu. |
| EDGE-23 | Unidade identificada como Jacareí e orientação para confirmar atendimento de outro município. Não foi criada regra de domicílio sem definição do cliente. |
| EDGE-24, EDGE-25 | Logística e acompanhamento separados de orientação jurídica sobre uma nova compra. |
| EDGE-26, EDGE-27, EDGE-29 | Vedados parecer oficial, promessa de resultado e cálculo de indenização. |
| EDGE-28 | Histórico e mensagem serializados como dados JSON; prompts declaram que ordens nesses dados não devem ser seguidas. Isso reduz ambiguidades, sem garantir imunidade a prompt injection. |
| Comandos de saída | Menu normalizado; sair encerra; cancelar uma coleta avisa que nenhuma reserva foi feita; cancelar reserva existente orienta contato e informa sua manutenção. |

## Seções 6, 7 e 8 — classificador, webhook e IA

As categorias P0/P1 propostas foram incorporadas ao classificador ativo e às respostas fixas. A cópia obsoleta do classificador foi removida. Retorno inválido pede esclarecimento; indisponibilidade do serviço tem tratamento técnico próprio. Saída estruturada é validada em runtime.

O webhook processa todas as mensagens de todas as alterações do lote, confirma recebimento antes da análise e serializa o atendimento por telefone. A conversa ficou em `conversation.ts`; fila e transporte ficaram separados para testes.

`generateOrientativeResponse` continua sendo chamado. Texto oficial de fallback não recebe disclaimer de texto gerado por IA. A trava é conservadora e pode rejeitar uma boa paráfrase; ela verifica invariantes textuais, não prova equivalência jurídica completa.

## Seções 9 e 10 — textos, guias e atualização do menu

O FAQ do PROCON foi a fonte das alterações de menu. Não foi adicionada nova pergunta jurídica. Q8/Q26/Q27 já estavam alteradas localmente e foram preservadas; apenas a referência ao botão Documentos foi alinhada em Q27.

Os guias têm um catálogo comum para a carga inicial e fallback. A consulta por WhatsApp prefere o guia vigente no banco, preservando edições da equipe. Não foi adicionada garantia de atendimento sem todos os documentos.

`seed.ts` agora só cria o menu se estiver vazio. Não apaga passos, opções, sessões ou histórico. `docs.ts` cria guias ausentes e não sobrescreve guias existentes.

Para uma base já populada, foi criado `updateMenuUx.ts`, que compara cada texto/ligação com a referência anterior em `menu-before-ux.json`. Edições diferentes dessa referência são preservadas e relacionadas no relatório. A simulação usa rollback; a aplicação é uma transação serializável. Não altera regras jurídicas de Q8/Q26 nem executa exclusões de sessões ou respostas.

Comandos na pasta `backend`:

```powershell
# Só mostrar alterações; reverte a transação ao final.
npx tsx prisma/seed/updateMenuUx.ts

# Aplicar os textos e ligações conhecidos, preservando edições do painel.
npx tsx prisma/seed/updateMenuUx.ts --apply
```

Na etapa de integração, a simulação foi conferida e a atualização conhecida foi aplicada ao banco local de testes. O usuário também informou nova execução de `seed`, `docs` e `updateMenuUx.ts`. O menu vigente foi conferido pela API e pelo WhatsApp. Não há mudança de schema Prisma nem migração de estrutura de banco.

## Seções 11, 12 e 13 — sugestões e validação do cliente

Login, perfis, versionamento de nós, 2FA, lembretes, transcrição, redução da profundidade e preenchimento automático da categoria ficaram fora desta alteração: são propostas de evolução, não falhas de fluxo a corrigir automaticamente. A seção 12 foi usada para priorizar os reparos; não para ampliar o escopo com todas as propostas P2.

Continuam sujeitos à confirmação da equipe os pontos da seção 13 original: regras locais de prazo; dados e grade de atendimento; encaminhamentos e atuação em golpes; frases de risco; revisão jurídica dos textos; atendimento com documentação incompleta; acompanhamento por telefone; política de dados e critérios de atuação. Horário informativo usa `PROCON_HORARIO`; ele não altera a grade da agenda existente em `scheduleConfig.ts`.

## Seção 14 — verificação e limites

- `npm exec -- tsc --noEmit`: aprovado.
- `npm run test:ux`: 43 testes aprovados, com banco, IA e transporte simulados.
- Há cenários de navegação, contexto, coleta, retomada, agenda sem vagas, paginação, duplicatas, avaliação, tamanho de payload, Unicode, fallback de reescrita e atualização não destrutiva do menu.
- O dataset existente foi ajustado para respostas fixas de fora de escopo. Acrescentados 33 casos de classificação com fronteiras de golpe/consumo, crime/golpe e acompanhamento/consumo.
- Avaliação real do classificador disponível em `npx tsx tests/llm/run-classifier-eval.ts`; não executada nesta sessão. O benchmark RAG existente também não foi executado contra banco/Ollama reais.
- Validação ponta a ponta realizada no ambiente local → ngrok → Meta/WhatsApp, com Ollama no Kaggle via Cloudflare. Percursos, falhas encontradas, correções e limites estão no [relatório da integração](validacao-integrada-whatsapp-2026-11-15.md). Nenhum agendamento real foi criado.
- Fila, deduplicação e memória das opções não persistidas de data/horário são locais ao processo. Múltiplas réplicas exigem fila/lock compartilhado. Depois de reinício, os botões e estados persistidos continuam válidos; atalhos numéricos de listas transitórias podem pedir o uso dos botões.

## Fontes externas consultadas

Os limites de mensagens interativas foram conferidos na [referência oficial da Meta](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/InteractiveObject/) e no [repositório do SDK da Meta](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK/blob/main/website/docs/api-reference/types/InteractiveObject.md). O SDK está arquivado; o transporte usa limites conservadores e deve ser homologado na Cloud API vigente.

Endereço e contatos foram conferidos em [comunicado da Prefeitura de Jacareí de 31/08/2026](https://www.jacarei.sp.gov.br/procon-de-jacarei-tem-atendimento-ao-publico-suspenso-nesta-terca-feira-1o/). O horário permanece configurável.

Explicações de documentos usam os serviços oficiais do [Meu INSS](https://www.gov.br/pt-br/temas/meu-inss) e de [emissão do extrato de empréstimos](https://www.gov.br/pt-br/servicos/emitir-extrato-de-emprestimo-consignado?id=2520&origem=servico). A terminologia de RMC/RCC foi conferida em [publicação oficial no DOU](https://pesquisa.in.gov.br/imprensa/servlet/INPDFViewer?captchafield=firstAccess&data=13%2F12%2F2022&jornal=515&pagina=144), sem acrescentar percentuais ou regras de contratação.

Passos gerais para vítimas de golpe foram conferidos no [Banco Central](https://www.bcb.gov.br/meubc/faqs/p/o-que-fazer-em-caso-de-golpe-fraude-ou-um-crime) e no [Ministério da Justiça](https://www.gov.br/mj/pt-br/acesso-a-informacao/acoes-e-programas/sofri-um-golpe-e-agora/cai-no-golpe-do-falso-pix/), sem promessa de recuperação do dinheiro. Contatos de emergência foram conferidos no [Ministério das Comunicações](https://www.gov.br/mcom/pt-br/noticias/2026/setembro/emergencia-voce-sabe-para-quem-ligar-quando-precisa-de-ajuda/); o recurso de apoio emocional foi conferido pelo conector de recursos locais para o Brasil.
