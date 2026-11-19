# Barreiras jurídicas — etapa 4

## Escopo

Implementação em `backend/src/services/llm/legalKnowledge/safety.ts`, integrada ao RAG antes da saída de texto gerado. A classificação e a recuperação continuam com as responsabilidades anteriores. Não foi criado um segundo agente ou uma chamada de verificação ao modelo.

Os controles são conservadores e delimitados. Não são um motor completo de aplicação do CDC nem certificação semântica de qualquer frase livre. As regras auxiliares continuam em rascunho: prévia de avaliação não constitui aprovação nem ativação delas no prompt de produção. As barreiras de segurança de saída são aplicadas independentemente dessa aprovação.

## O que mudou

- Orientação, clarificação e redirecionamento passam pela checagem. Pergunta sugerida pelo classificador também é conferida antes de enviar ou buscar artigos.
- Contexto de fatos usa somente falas do consumidor, sem tratar a justificativa/paráfrase do classificador ou fala do assistente como prova.
- Cobrança e pagamento recebem estados `reported`, `denied` ou `unknown`. São sinais de declaração, não conclusão de que o fato foi comprovado ou de que existe responsabilidade jurídica.
- Durações em algarismos ou por extenso precisam de suporte no conteúdo normativo fornecido para o artigo. Palavras-chave de busca são removidas dessa conferência.
- A checagem distingue finalidade, hipótese e marco nos padrões cobertos dos arts. 18, 26 e 27. Rejeita cálculos/conclusões individuais de prazo não verificáveis; não implementa cálculo de vencimento.
- Transferência sem declaração suficiente de cobrança não sustenta orientação individual pelo art. 42. Promessa de restituição, pagamento negado e omissão de ressalva relevante também são avaliados.
- Referência citada no corpo não pode fugir aos textos recuperados.
- Contradições de escopo explícitas podem vetar a orientação, sem reescrever o diagnóstico do classificador: venda não profissional declarada, tributo direto e locação com enquadramento não verificado. Não equivale a classificar todo relato por palavras-chave; termos isolados sobre vizinho, imposto na nota ou intermediação não bastam.
- A anotação antiga incorreta do art. 20 é isolada no contexto sem alteração de banco ou transcrição normativa. O catálogo auxiliar continua sendo a fonte de distinções revisadas no fluxo futuro de aprovação.
- Textos oficiais com prazo são preservados integralmente antes de chamar a reescrita. Os demais mantêm a reescrita, o guard anterior e a checagem de afirmações sensíveis; a fonte oficial é usada para conservação, nunca como prova de fatos do consumidor. Preservar uma fonte não comprova a qualidade jurídica de sua redação original.

Referências conferidas nesta etapa: [CDC no Planalto](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm), em especial arts. 18, 26, 27 e 42. A leitura direta ficou disponível nesta sessão. O [texto oficial da Câmara](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html) foi usado para cotejamento. Essas referências não dispensam a análise dos fatos e das exceções do caso concreto.

## Falha segura e continuidade

Se o texto não puder ser aceito, ele não é concatenado à mensagem de encaminhamento. O sistema usa um fallback próprio, sem repetir a afirmação insegura. Quando falta distinguir cobrança e transferência, pode fazer uma pergunta específica; o limite persistido de clarificações continua valendo. Encerrado o limite, oferece atendimento. Não faz outra geração para tentar consertar a resposta.

Diagnósticos `segurancaJuridica` contêm códigos de motivo e estados/sinais, sem trechos de relatos, CPF, telefone ou dados pessoais. O texto bruto anterior ao guard só é capturado no avaliador opt-in, que usa exclusivamente casos fictícios. Não foi adicionado esse registro bruto às conversas de produção.

Exemplos de motivos: `conclusao_individual_prazo_nao_verificada`, `duracao_sem_suporte_na_fonte`, `marco_vicio_oculto_omitido`, `relacao_entre_hipotese_e_marco_incorreta`, `transferencia_sem_cobranca_confirmada`, `restituicao_sem_pagamento`, `ressalva_restituicao_omitida`. Motivos anteriores de formato/referência e reparo continuam disponíveis.

## Testes de regressão e generalização

Os vinte cenários de `legal-safety-audit.test.ts` agora têm asserções obrigatórias. Os quinze TODOs foram removidos; não foram substituídos por skips. O teste SJ-20 exige conservar o texto oficial com prazo sem reescrita livre.

`legal-safety-generalization.test.ts` acrescenta controles independentes: durações inventadas, unidades diferentes, negações, troca de relação entre marcos, pergunta confundida com declaração, correção posterior de um fato, orientação teórica e ausência de bloqueio genérico de assuntos bancários. Os testes positivos exigem que explicações condicionais seguras continuem possíveis. São exemplos limitados, não demonstração de compreensão de todas as negações ou frases compostas.

Resultado final local: tipos e build aprovados; 142 aprovações, dois skips históricos e zero TODOs. Executar `npm run check` no backend. O [relatório ampliado](validacao-ampliada-etapa4.md) distingue a primeira rodada real dos refinamentos e do replay offline.

## Rodada ampliada com modelo real

Com Kaggle/túneis/modelo aquecido confirmados, executar:

```powershell
docker exec backend_api npm run test:legal:expanded
```

O avaliador seleciona automaticamente todas as falhas indicadas por campos `*Ok: false` da baseline, usando o dataset original para as entradas. Inclui os turnos inicial e final dos casos de clarificação que falharam, seis controles anteriormente aprovados e doze cenários novos em `tests/llm/legal-generalization-cases.json`. Nesta baseline são 39 entradas: 21 de regressão histórica, seis controles e doze inéditas.

O banco é usado apenas para leitura da base legal. Identificação e histórico são simulados; não há criação de sessões ou envio ao WhatsApp. O script salva progresso após cada caso em `backend/.ci-generated/legal-safety-eval-step4.json`, ignorado pelo Git. Não altera `eval-results.json`.

O relatório distingue categoria, tipo, artigo, bloqueios e falhas técnicas. Mantém a geração anterior ao guard para revisão, pois bloqueio não equivale a orientação correta e ausência de bloqueio não comprova segurança. Não altera o gabarito para favorecer o resultado. Os casos inéditos têm expectativas qualitativas para revisão humana, não um selo automático de correção jurídica.

O tamanho do prompt é registrado em caracteres nesta etapa; contagem real de tokens por chamada permanece para medição posterior. A leitura do `/api/ps` reportou contexto de 32.768 para o Gemma e 8.192 para o embedding. O resultado não deve ser atribuído automaticamente ao tamanho do contexto, ao prompt ou aos pesos do Gemma sem evidência.

`npm run test:legal:replay` reaplica o gate compartilhado de `responseSafety.ts` às gerações salvas, preservando a rodada original e registrando seu hash. Não usa GPU, não refaz a classificação e não transforma decisões do verificador em novas métricas de precisão end-to-end.

## Limites de aceite

A [calibração delimitada posterior](calibracao-regras-juridicas.md) registra a seleção temática mais restrita, captura opt-in de gerações no benchmark, novas verificações de marco/restituição e os resultados completos. Inclui 153 testes locais aprovados, dois skips históricos e a distinção entre rodada real e replay final. As quedas de artigo/tipo e os problemas ainda aceitos pelo verificador estão explícitos nesse relatório.

Os guards reconhecem padrões e contextos de risco, não toda semântica do português. Negação distante, citação ambígua, mudança implícita de assunto, condição jurídica não explicitada e prazo fora do escopo conhecido podem exigir encaminhamento e revisão. A existência de uma quantidade no artigo não comprova, sozinha, sua finalidade ou aplicabilidade; os controles adicionais são necessários e continuam limitados aos padrões declarados.

Não anunciar todos os erros de categoria/recuperação como resolvidos: a etapa não muda esses componentes. Não usar melhoria de artigo esperado como substituto da revisão da orientação. Encerrar para revisão ao concluir os testes desta etapa, antes de iniciar outra fase.
