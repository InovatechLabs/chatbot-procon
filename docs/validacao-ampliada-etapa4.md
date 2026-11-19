# Validação ampliada das barreiras — 17/11/2026

## Resultado e alcance

Etapa 4 implementada e verificada com testes locais, integração PostgreSQL, uma rodada real ampliada e replay das mesmas gerações. O resultado é endurecimento de segurança, não demonstração de correção jurídica universal nem conclusão de que todos os erros de artigo/classificação desapareceram.

A rodada real usou Gemma 3 12B confirmado pelo usuário, com Kaggle/túneis aquecidos. Foram 39 entradas: todos os quinze erros diretos da baseline, seis turnos dos três casos de clarificação com falhas, seis controles antes aprovados e doze exemplos novos. Os casos inéditos foram definidos antes da primeira rodada. Depois, os resultados também serviram para corrigir o verificador; portanto já não são uma amostra independente de validação final.

Não houve gravação de sessões, mensagens no WhatsApp, execução de seed ou alteração de `tests/llm/eval-results.json`. O banco foi lido somente para obter a base legal. A rodada completou as 39 entradas sem falhas técnicas, em aproximadamente 12,8 minutos.

## Evidências e reprodução

```powershell
docker exec backend_api npm run test:legal:expanded
docker exec backend_api npm run test:legal:replay
```

O primeiro comando usa o modelo. O segundo apenas reaplica o gate compartilhado da produção às gerações fictícias salvas, sem nenhuma chamada à IA. Não iniciar nova rodada apenas para buscar um resultado mais favorável.

Arquivos locais ignorados pelo Git:

- `backend/.ci-generated/legal-safety-eval-step4.json`: primeira rodada real, inclusive texto anterior ao guard e diagnósticos.
- `backend/.ci-generated/legal-safety-replay-step4.json`: decisões do verificador refinado, com vínculo pelo SHA-256 do relatório original.

SHA-256 do relatório real usado no replay: `cd62ef9f1858ede75c0246be81ce224dd90ed3d1f13d6badc67940187fec816f`.

Esses comandos escrevem nos mesmos caminhos em futuras execuções; arquivar os relatórios anteriores antes de repetir ou limpar `.ci-generated`. Este documento conserva a síntese para o repositório. A baseline original permanece separada.

## Seleção dos casos

| Grupo | Entradas |
|---|---|
| Erros diretos históricos | OD-01, 06, 11, 12, 13, 15, 21, 23, 34, 36, 39, 45, 48, 52, 53 |
| Clarificações históricas | PC-01, PC-03 e PC-06, cada um no turno inicial e final |
| Controles positivos | OD-03, 04, 07, 08, 18 e 20 |
| Casos inéditos | GN-01 a GN-12, em `legal-generalization-cases.json` |

O harness chama o RAG com identificação/histórico simulados, sem semear sessões. Não é uma repetição byte a byte do avaliador histórico, que também prepara contexto próprio para classificação. Não atribuir diferenças exclusivamente ao prompt, aos guards ou ao modelo. Os identificadores e as expectativas históricas não foram alterados para acomodar respostas novas.

## Primeira rodada real, antes dos refinamentos do replay

| Grupo | Entradas | Categoria conforme expectativa | Artigo conforme gabarito estrito | Tipo conforme gabarito estrito |
|---|---:|---:|---:|---:|
| Falhas históricas | 21 | 20/21 | 4/18 avaliáveis | 16/18 avaliáveis |
| Controles | 6 | 4/6 | 3/6 | 3/6 |
| Inéditos | 12 | 11/12 | Sem gabarito numérico | Sem gabarito numérico |

Nos inéditos, as expectativas principais são qualitativas. GN-03 foi classificado como AMBIGUO e recebeu pergunta diante de informações ausentes, comportamento coerente com seu objetivo, apesar da expectativa técnica de categoria CONSUMO. A contagem acima não é uma medida validada de segurança ou precisão jurídica.

Esse recorte concentra erros anteriores e não representa o benchmark completo de sessenta casos. Artigo diferente também não demonstra automaticamente erro jurídico: há saídas plausíveis em dispositivos específicos em vez do identificador esperado, e outras que ainda exigem revisão de conteúdo. Não apresentar 4/18 como nova precisão geral do sistema.

## O que a revisão encontrou e corrigiu

| Achado | Correção incorporada e verificada |
|---|---|
| OD-01 pressupôs pagamento não declarado | Orientação de restituição individual exige sustentação; quando falta pagamento, pode perguntar se a cobrança foi paga. |
| OD-06 relacionou devolução em dobro a haver engano justificável | Conferência da relação de exceção; presença das palavras sozinha não basta. |
| OD-07 e OD-08 foram classificados como CONSUMO | Veto de aplicabilidade para fatos explícitos de venda não profissional e tributo direto; usa mensagens oficiais existentes. A categoria errada continua registrada no diagnóstico. |
| PC-06-final aplicou regra de consumo à locação sem confirmar enquadramento | Resposta de incerteza/análise, sem afirmar a aplicação do CDC nem oferecer orientação pela referência gerada. |
| GN-06 pediu comprovante de pagamento apesar de pagamento negado | Bloqueio dessa contradição, além da avaliação da ressalva. |
| GN-02 foi bloqueado mesmo com negação de vício oculto | Tratamento da negação e preservação de explicação geral aparente. |
| OD-20 tinha prazo complementar em outro artigo recuperado | Conferência por afirmação/fonte; admite complemento sustentado, com marco coerente. |
| GN-12 tinha duração correspondente a `10 (dez) dias` na fonte | Parser aceita numeral explicativo consistente, sem confundir número anotado com ausência de suporte. |
| A anotação antiga do art. 20 atribui serviço não entregue ao art. 23 | Anotação isolada no contexto, inclusive sem regras aprovadas; conteúdo normativo, arquivo de artigos e banco permanecem intactos. |

As últimas mudanças de montagem de contexto não foram usadas para gerar outra resposta do modelo. O replay avalia somente as gerações originais contra o gate refinado; não é uma segunda rodada end-to-end.

## Replay final

Das 39 entradas, 35 produziram uma geração RAG passível de reaplicação do gate; quatro já tinham terminado em clarificação do classificador.

- 12 gerações não aprovadas pelo verificador final.
- 23 gerações aceitas pelo verificador, sem que isso certifique integralmente seu conteúdo.
- Seis bloqueios novos em relação à primeira rodada: OD-01, OD-06, PC-06-final, OD-07, OD-08 e GN-06.
- Quatro bloqueios iniciais liberados após corrigir excesso de bloqueio: PC-01-final, OD-20, GN-02 e GN-12.
- Quatorze entradas mudaram sua lista de motivos; parte dessas mudanças só tornou o diagnóstico mais preciso.

Continuaram rejeitadas também OD-21, GN-01, GN-04, GN-05, GN-10 e GN-11. Nem toda rejeição significa erro certo do modelo: há casos conservadores em que o guard não consegue confirmar as condições. Por exemplo, GN-01 tem marco em linguagem cotidiana, mas atribui categoricamente vício oculto; GN-05 menciona engano justificável sem uma relação de exceção suficientemente verificável para o controle; GN-11 mistura prazos de reparo e reclamação. Preservar esses casos na revisão, sem contabilizá-los automaticamente como sucesso.

O replay não refaz classificação, busca ou geração. Não recalcula porcentagens end-to-end e não concede acerto de categoria quando um veto impede a orientação errada. Essa separação evita melhorar artificialmente a métrica por encaminhar mais pessoas ou trocar o gabarito.

## Contexto e desempenho

O maior prompt de geração observado teve 15.308 caracteres. Não há contagem real de tokens por chamada nesta execução.

Uma consulta de leitura ao `/api/ps` do servidor configurado retornou Gemma `gemma3:12b`, 11.8B, Q4_K_M, com `context_length: 32768`; o `bge-m3:latest` reportou `context_length: 8192`. O campo é descrito na [documentação oficial do Ollama](https://docs.ollama.com/api/ps). Isso não confirma um limite separado de oito mil tokens de entrada do Gemma nem demonstra a causa das falhas. Não houve alteração de modelo, quantização ou configuração de contexto.

