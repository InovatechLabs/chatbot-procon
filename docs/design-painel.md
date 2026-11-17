# Identidade visual do painel

Direção baseada nas referências fornecidas pelo usuário, priorizando o PROCON de Jacareí/SP, e na skill frontend-design anexada. A identidade fica concentrada na área de marca e navegação; o conteúdo mantém a sobriedade de uma ferramenta de trabalho.

## Tokens e tipografia

| Uso | Cor |
| --- | --- |
| Navegação e títulos institucionais | #073B70 |
| Ação principal e seleção | #0067AD |
| Apoio e seleção suave | #EAF3FA |
| Texto secundário | #5D6978 |
| Superfícies | #FFFFFF |
| Fundo de trabalho | #F4F6F8 |

Erros, avisos e estados de atendimento mantêm cores semânticas próprias. Texto branco sobre os azuis principais tem contraste aproximado de 11,24:1 e 5,93:1; texto secundário sobre branco tem 5,59:1. Esses cálculos não substituem uma auditoria completa de acessibilidade.

Segoe UI para leitura, campos e tabelas; Bahnschrift para títulos e números, com fallback local. A assinatura PROCON/SP usa tipografia pesada e Jacareí como identificação municipal, inspirada na referência. É uma composição tipográfica, não um arquivo vetorial oficial reproduzido. `Brand.tsx` centraliza sua substituição caso seja fornecida a arte oficial. Não há download de fontes ou serviço externo para exibi-las.

Os estilos foram posteriormente migrados para [Tailwind CSS](tailwind-frontend.md), mantendo a identidade e os ajustes aprovados. Os tokens agora ficam no `@theme` de `frontend/src/index.css`, com padrões compartilhados em `frontend/src/ui/styles.ts`.

## Estrutura

Conteúdo e títulos alinhados à esquerda; números comparáveis alinhados à direita nas tabelas. O painel usa uma navegação azul fixa no desktop e um menu recolhível em telas menores.

```text
┌──────────────────┬────────────────────────────────────┐
│ PROCON SP        │ Título da área       Conta e saída  │
│ Jacareí          │ Descrição da tarefa                 │
├──────────────────┼────────────────────────────────────┤
│ Indicadores      │ Filtros e ações                     │
│ Agenda           │ Quadro de indicadores / calendário  │
│ Menu do chatbot  │ Tabelas / formulário de trabalho    │
│ Disponibilidade  │                                    │
│ Usuários         │                                    │
└──────────────────┴────────────────────────────────────┘
```

A revisão da direção priorizou o vocabulário e as cores da instituição. Hierarquia vem de espaçamento, contraste e separação de áreas; sombras ficam restritas aos diálogos. O quadro de indicadores usa divisões internas, sem animações ou elevação de cada número. A tela de acesso usa o azul e a assinatura institucional como elemento principal.

## O que foi aplicado

- Acesso, navegação, cabeçalho, conta, agenda, menu do chatbot, disponibilidade, usuários e indicadores compartilham os mesmos tokens.
- Navegação com identificação da página ativa, menu móvel e fechamento por Escape. Link para pular ao conteúdo, foco de teclado visível e respeito a movimento reduzido.
- Campos mais legíveis; tabelas com cabeçalhos discretos; diálogos com limites de altura; listagens e formulários preparados para telas menores.
- Editor com títulos selecionáveis e expansão por teclado, ações identificadas e linguagem voltada ao trabalho da equipe.
- Título da aba, idioma pt-BR e favicon do painel substituem os padrões iniciais.

Autenticação, permissões, serviços, conteúdo do seed, modelos de IA e regras de negócio não foram alterados nesta etapa. A revisão visual não modifica horários ou dados oficiais com base nas imagens de referência.

## Validação

Lint e build do frontend, com checagem de tipos, executados. Sem novas dependências. O container frontend foi reconstruído para carregar a revisão. O ambiente é de desenvolvimento, conforme o Compose existente; essa reconstrução não constitui um deploy de produção.

A ferramenta de controle do navegador bloqueou a inspeção do Edge por não conseguir identificar a URL atual com segurança. A conferência visual de telas e larguras continua pendente; não há screenshots de validação produzidos nesta etapa.
