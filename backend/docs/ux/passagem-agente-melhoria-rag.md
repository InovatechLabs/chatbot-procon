# Passagem de contexto — precisão do classificador e RAG

Atualização: parte das propostas foi implementada após nova autorização. Consultar [implementação e avaliação](implementacao-precisao-rag.md) antes de seguir este diagnóstico histórico.

Data: 15/11/2026. Trabalhar somente em `D:/chatbot-procon/backend`.

## Objetivo e restrições

Recuperar a precisão após a refatoração de UX, mantendo Gemma3 12B e BGE-M3. O usuário não pode usar um modelo mais pesado. Priorizar mudanças pequenas, mensuráveis e sem aumentar chamadas desnecessariamente. Não retirar barreiras apenas para melhorar a pontuação.

O pedido anterior autorizou somente análise: nenhum código ou resultado de avaliação foi alterado nessa análise. Este documento registra propostas para uma próxima etapa; elas ainda não foram implementadas. Não executar mudanças ou testes caros apenas por encontrar estas instruções sem conferir o pedido vigente do usuário.

## Ler primeiro

- `tests/llm/output.log`, `eval-results.json`, `test-cases.json` e `run-eval.ts`.
- `src/services/llm/helpers/classifyReport.ts`, `ragGuard.ts`, `llmService.ts`, `prompts/index.ts` e `prompts/schemas/index.ts`.
- `src/database/data/cdcData.json`, `src/database/repositories/knowledgeRepository.ts` e `src/utils/functions/{bm25,hybridSearch}.ts`.
- Relatórios locais: [auditoria por seção](auditoria-implementacao.md) e [teste integrado](validacao-integrada-whatsapp-2026-11-15.md).

## O que já foi feito

A refatoração corrigiu navegação, saídas pós-resposta, contexto entre menu e IA, confirmação de nome, privacidade/CPF, retomada, paginação de horários, tratamento de mídias, fila por telefone e duplicatas. Seeds preservam dados existentes; `updateMenuUx.ts` simula por padrão e aplica alterações conhecidas com `--apply`. O usuário já executou seed, docs e atualizador. Não repetir cargas sem necessidade.

Nos testes reais de WhatsApp foram corrigidos: asteriscos duplos, publicação de análise obsoleta quando chega complemento, consulta contextual para recuperação, extração de referência em título acentuado e bloqueios para confusões observadas de prazo/artigo. A última repetição bloqueou uma orientação inconsistente e encaminhou à equipe. Isso confirma a barreira, não homologa a precisão jurídica. Menu e coleta até horários funcionaram; nenhum agendamento foi criado.

Última verificação de implementação: TypeScript aprovado e 43 testes UX aprovados, com dependências simuladas. Esses testes não medem a qualidade do modelo. Não há avaliação anterior completa disponível nesta análise além dos números comparativos informados pelo usuário.

## Evidências do eval atual

| Métrica | Antes, informado pelo usuário | Atual, arquivos locais |
| --- | --- | --- |
| Categoria direta | 60/60 | 50/60 |
| Tipo de resposta direta | 52/60 | 31/60 |
| Artigo direto | 47/60 | 24/60 |
| Pergunta inicial | 3/6 | 2/6 |
| Categoria final após esclarecimento | 5/6 | 5/6 |
| Artigo final após esclarecimento | 3/6 | 2/6 |

- Dez erros de categoria direta: quatro `GOLPE_TERCEIRO`, cinco `DUVIDA_PROCESSO`, um `FORA_DO_PAPEL`.
- Vinte respostas diretas chegaram à mesma barreira de referência/prazo. O log não permite separar os motivos nem provar quantas foram bloqueios indevidos.
- Foram entregues 27 orientações finais: 19 com artigo igual ao esperado e oito divergentes. Os 24 acertos totais de artigo incluem cinco resultados `null` esperados.
- Há respostas com artigo correto e texto incompleto: OD-16, OD-42 e OD-44. Investigar o limite rígido de 600 caracteres; a causa exata do truncamento não foi comprovada.

## Ordem recomendada para o próximo trabalho

### 1. Corrigir a medição antes de comparar arquiteturas

`run-eval.ts` chama `classifyReport` e depois `answerWithRAG`, que classifica novamente. Registra a primeira categoria, mas a resposta depende da segunda, com contexto diferente. OD-10 registra ilícito e entrega a mensagem fixa de golpe. Reutilizar ou registrar a classificação efetivamente usada pelo pipeline; evitar a segunda classificação apenas para medir categoria.

Registrar motivo específico do descarte, consulta usada, candidatos recuperados, referência gerada e decisão final. Preservar os arquivos atuais como baseline antes de qualquer nova execução. O relatório identifica o modelo como “Desconhecido”: conferir a variável real utilizada pelo cliente e registrar modelo e parâmetros efetivos.

Revisar expectativas pontualmente, sem mudar o gabarito para esconder regressões: PC-05 pergunta “Vocês atendem sábado?” e deve ser informação de atendimento. Divergência de artigo e qualidade jurídica são métricas distintas; eventuais alternativas aceitáveis exigem justificativa/revisão. Separar casos reais de atendimento, perguntas conceituais e situações fora de escopo.

### 2. Desambiguar a classificação sem aumentar o modelo

Hoje categorias misturam domínio (`CONSUMO`), intenção (`DUVIDA_PROCESSO`) e suficiência de informação (`AMBIGUO`). Proposta: separar esses aspectos na mesma saída estruturada/chamada. Um relato pode ser de consumo e precisar de uma pergunta antes de orientar.

- `GOLPE_TERCEIRO`: exigir evidência de falsa identidade/fraude. Pix, “me roubou”, mensagem comercial ou fornecedor que sumiu não bastam. Exemplos: OD-11, OD-12, OD-39, OD-57.
- `DUVIDA_PROCESSO`: restringir ao funcionamento administrativo. Direitos, garantia, contrato e prazo legal continuam em consumo. Exemplos: OD-14, OD-32, OD-35, OD-47, OD-51.
- `FORA_DO_PAPEL`: exigir pedido explícito de parecer/promessa, distinguindo-o de contrato citado pelo cidadão. OD-31 é o exemplo.
- Clarificação: verificar natureza do serviço e informações necessárias para responder; não exigir provas/datas indiscriminadamente. PC-03/04 recebem orientação antes de esclarecer o serviço; PC-06 força consumo após relato de aluguel entre particulares.

Usar poucos exemplos contrastantes e casos inéditos para validar generalização. Evitar regex específicas para memorizar o dataset. Preservar prioridades de risco pessoal e violência.

### 3. Medir recuperação separadamente da geração

A consulta contextual produzida pelo classificador atualmente substitui o relato original. Comparar busca original, contextual e combinação dos resultados: a reescrita pode acrescentar sinônimos, mas apagar a distinção jurídica central.

Medir se o artigo esperado aparece entre os candidatos finais antes de avaliar a escolha do modelo. Se não aparece, corrigir recuperação; se aparece e não é escolhido, investigar seleção/prompt. Não aumentar arbitrariamente o número de artigos nem adicionar modelo de reranking sem medir o gargalo. Comparar alterações isoladas, inclusive com o comportamento anterior disponível no Git, sem sobrescrever mudanças locais.

### 4. Tornar referências estruturadas e bloqueios diagnosticáveis

Manter validação de referência/prazo. Usar identificador canônico vindo dos metadados da base, em vez de extrair identidade de título livre. Considerar restringir a escolha aos IDs recuperados via schema; isso evita referência inexistente, mas não garante pertinência jurídica. O catálogo contém título composto `Art. 66 e 67`, incompatível com o normalizador atual de artigo único.

Separar motivos de bloqueio: formato inválido, referência fora dos candidatos, prazo suspeito e incompatibilidade produto/artigo. Testar falsos positivos e negativos das regras de `ragGuard.ts`; são barreiras pontuais, não um validador jurídico completo. Não remover a proteção genericamente nem acrescentar novas exceções por caso do benchmark.

### 5. Simplificar geração e controlar variação

Testar respostas com poucas frases e passos úteis, sem introdução repetitiva ou transcrição extensa da lei. Investigar texto incompleto sob `maxLength: 600`; manter frases completas e condições jurídicas, sem simplesmente cortar strings ou remover ressalvas para caber.

Comparar temperatura zero para classificação e orientação. Hoje classificador usa 0.1 e geração da orientação não fixa temperatura. Temperatura zero reduz variação, não corrige raciocínio nem garante determinismo absoluto. Registrar parâmetros efetivos e usar repetições de uma amostra para avaliar estabilidade.

## Critério de conclusão e execução econômica

Primeiro corrigir medição; depois classificação; depois recuperação e geração. Validar casos afetados mais uma amostra que já acertava. Só então rodar o eval completo, com autorização/contexto de recursos vigente. Usar casos adicionais fora do conjunto ajustado para evitar sobreajuste. Separar cobertura de respostas, acerto de referência, correção do conteúdo, esclarecimento adequado e encaminhamento seguro. Não prometer retorno aos percentuais anteriores antes de medir.

Fine-tuning e outro modelo na GPU ficam para depois, se houver evidência de necessidade. É possível testar as propostas acima com a capacidade atual, mas o ganho ainda não foi medido.

## Ambiente e cuidados

Ollama roda no Kaggle via Cloudflare; backend/PostgreSQL locais via Docker e webhook via ngrok. Durante o ensaio o watcher não recarregou os arquivos: foi necessário reiniciar somente `backend_api`. Conferir o processo servido antes de repetir teste; não presumir que editar fonte atualiza o container. Não expor `.env`, tokens, telefones pessoais ou CPF nos logs de avaliação. Não criar agendamento real durante smoke test.

FAQ oficial: `C:/Users/gab/Downloads/Dúvidas-Frequentes.txt`; auditoria original: `C:/Users/gab/Downloads/CONTEXTO_AGENTE_PROCON_UX.md`. Não inventar conteúdo jurídico nem alterar seeds sem necessidade. Preservar alterações preexistentes do usuário.

Referências técnicas consultadas: [Ollama — saídas estruturadas e temperatura](https://docs.ollama.com/capabilities/structured-outputs), [BGE-M3 — recuperação híbrida e reranking](https://huggingface.co/BAAI/bge-m3).
