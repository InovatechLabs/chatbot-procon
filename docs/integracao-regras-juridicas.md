# Integração seletiva das regras — etapa 3

## Escopo

O RAG agora pode receber um contexto auxiliar selecionado pelo tema, mantendo classificador, busca híbrida, schema de resposta e guards existentes. A seleção não é enquadramento jurídico nem extração de fatos. As quinze lacunas da auditoria continuam pendentes das barreiras posteriores.

O catálogo passou ao formato 2, revisão 2, com termos de recuperação positivos e grupos. Todos os onze registros continuam em `technical_draft`; nenhum responsável ou aprovação foi inventado. Os termos ajudam a recuperar orientações, mas não comprovam condições ou fatos do caso.

Arquivos principais: `src/services/llm/legalKnowledge/context.ts`, `llmService.ts`, `prompts/index.ts` e `database/data/legalRules.json`, no backend.

## Modos e revisão

| `RagOptions.legalRulesMode` | Comportamento |
|---|---|
| `approved` — padrão | Somente regras aprovadas. Hoje não acrescenta regras, porque todas são rascunhos. |
| `preview` | Permite avaliar os rascunhos sem alterar seu estado; exige `includeDiagnostics: true`. |
| `off` | Não carrega nem injeta catálogo. Serve à comparação com o fluxo anterior. |

O webhook não aceita esse parâmetro do consumidor. A prévia é solicitada explicitamente por ferramentas de avaliação ou dependências internas de teste. Não altera o modo usado pelas conversas de produção. Aprovar ou ativar conteúdo é uma decisão posterior à revisão; integrar código não equivale a aprovar cada registro.

## Seleção e montagem do contexto

1. Mantém o relato original e mensagens do cidadão para a seleção. Não usa apenas a paráfrase do classificador, nem trata a fala do assistente como relato confirmado.
2. Usa BM25 sobre os termos positivos do catálogo. Proibições e exemplos negativos não são indexados como sinais positivos. O artigo principal de uma regra entre os candidatos oferece um pequeno desempate; a regra de PIX exige sinal textual, sem ser ativada apenas por um artigo genérico de serviços/cobranças.
3. Seleciona até três grupos. As quatro alternativas de reclamação são uma família indivisível: não escolher apenas uma duração quando a natureza ou o enquadramento são desconhecidos. Família parcialmente aprovada é omitida.
4. Exige texto disponível para os fundamentos do grupo. Pode acrescentar documentos já carregados da base, até seis documentos no contexto final. Não permite uma referência nova sem seu texto, nem busca normas externas automaticamente.
5. Limita o JSON auxiliar a seis mil caracteres. Se um grupo não couber, omite o grupo inteiro; não corta prazos, condições ou exceções. Esse limite não é uma contagem de tokens nem um orçamento do prompt inteiro.
6. Substitui `distincao` antiga apenas nos documentos cobertos pelas regras efetivamente selecionadas. Não modifica os objetos originais, o JSON dos artigos ou os registros do banco. Sem regras selecionadas, conserva o comportamento anterior.

A regra operacional de abstenção só acrescenta instrução condicional quando não há outro grupo recuperado; não declara automaticamente que faltou suporte. Relevância temática não significa que as condições foram satisfeitas. A confirmação de fatos e a validação semântica continuam para a próxima etapa.

O bloco `REGRAS_AUXILIARES_JSON` apresenta condições alternativas, fatos necessários, dados de prazo e notas. O prompt deixa explícito que não são fatos confirmados. Não exige datas para explicação geral, não calcula vencimento e orienta esclarecer/encaminhar quando a conclusão individual não estiver sustentada. Essas instruções ainda dependem da adesão do modelo; não substituem barreiras do backend.

## Diagnósticos

Com `includeDiagnostics`, `diagnostics.regrasAuxiliares` informa modo, versão do catálogo, IDs selecionados, rascunhos usados na prévia, omissões e seus motivos, artigos acrescentados, distinções substituídas e tamanho do bloco. Não inclui o relato original ou dados pessoais.

Motivos de omissão: `missing_source`, `budget`, `group_limit`, `incomplete_family`. `candidatosRecuperados` conserva os candidatos iniciais, permitindo distinguir busca original e acréscimos da base auxiliar. `referenciasPermitidas` considera os textos efetivamente enviados ao modelo, incluindo os acréscimos.

## Build e operação

`npm run build` compila TypeScript e copia o JSON para `dist/database/data/legalRules.json`. O loader usa caminho relativo ao módulo tanto em `src` quanto em `dist`, sem depender do diretório de trabalho. Copiar apenas os arquivos JS de `dist` e excluir o JSON invalida a instalação.

O catálogo é validado ao carregar e mantido em memória por processo. Reiniciar o backend após editar o JSON, atualizar o formato ou mudar a revisão. Não editar `dist` manualmente. Não há seed, reindexação de embeddings ou migração de banco nesta etapa. Falha de leitura/validação não deve ser contornada enviando texto auxiliar não validado.

## Validação sem modelo

`npm run check` executa testes do catálogo e sete testes novos de contexto: isolamento de rascunhos, família completa, aprovação parcial, texto ausente, orçamento, substituição sem mutação e integração com geração simulada. O teste PostgreSQL de inbox também prepara o RAG em prévia e exige o bloco auxiliar no HTTP local, preservando a verificação de três chamadas externas sem repetição ou transação aberta.

Tipos/build e suíte local: 104 aprovações, dois skips históricos e quinze TODOs conhecidos. O catálogo foi carregado diretamente do artefato compilado. Testes com dados/modelos simulados não medem melhora de precisão do Gemma.

Integração PostgreSQL: 24 verificações aprovadas, incluindo subtestes; cinco bases descartáveis reconstruídas sem divergência e smoke compilado com health 200/API protegida 401. O caminho de geração com regras também preservou a espera externa sem transação aberta e sem repetir chamadas ao modelo no replay do inbox.

## Comparação curta com o Kaggle

Somente quando o usuário confirmar os túneis e o modelo aquecido:

```powershell
docker exec backend_api npm run test:legal:live
```

O script `scripts/smoke-legal-context-live.ts` usa dois relatos fictícios, vício oculto e PIX, comparando `off` e `preview`. Reutiliza a classificação de cada relato. O banco é acessado somente para ler a base legal; identificação e histórico são simulados. Não cria sessões, não envia WhatsApp e não escreve `eval-results.json`. Mostra textos, artigos, candidatos, regras, descartes e tamanho em caracteres do prompt de geração. Ausência de geração com regras não deve ser interpretada como smoke bem-sucedido.

Para uma rodada completa posterior, o avaliador aceita `EVAL_LEGAL_RULES_MODE=preview` e exige `EVAL_RESULTS_PATH` diferente de `eval-results.json`. O modo aparece no resumo e os detalhes de seleção ficam nos diagnósticos. O benchmark completo não é necessário para o smoke desta etapa; a validação de qualidade geral e tokens reais exige a avaliação posterior planejada.

Estado: integração e validação local prontas; comparação real concluída após confirmação do Kaggle. [Relatório de 17/11/2026](validacao-regras-juridicas-2026-11-17.md): melhora do marco no relato de vício oculto, mas orientação de PIX ainda sem sustentação suficiente no enquadramento escolhido. O smoke técnico passou; segurança semântica permanece pendente. Encerrar para revisão, sem iniciar automaticamente a etapa de barreiras.

A etapa 4 foi posteriormente autorizada e implementou as [barreiras](barreiras-juridicas.md), com [rodada ampliada de 39 entradas](validacao-ampliada-etapa4.md). Os rascunhos continuam separados de aprovação; as proteções de saída não dependem de ativá-los. `quarantinedDistinctions` identifica a anotação antiga incorreta do art. 20, omitida do contexto em todos os modos sem alterar a fonte normativa.
