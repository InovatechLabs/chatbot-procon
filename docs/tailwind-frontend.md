# Tailwind no painel administrativo

O frontend usa Tailwind CSS 4 com `@tailwindcss/vite`, seguindo a [integração oficial para Vite](https://tailwindcss.com/docs/installation/using-vite). Os pacotes e versões resolvidas estão em `frontend/package.json` e `package-lock.json`.

## Organização

- `src/index.css`: entrada do Tailwind, tokens do PROCON em `@theme` e estilos básicos globais com `@apply`.
- `src/ui/styles.ts`: padrões compartilhados de classes utilitárias para botões, campos, painéis, tabelas, login e navegação.
- Componentes TSX: compõem esses padrões com `cx` e usam classes estáticas para variações. `cx` apenas junta strings; não gera estilos nem resolve conflitos em tempo de execução.

Foram removidos `App.css`, `auth/Users.css` e `ScheduleSettings.css`. Os estilos inline de layout também foram convertidos. Cores e dimensões dos gráficos passadas à biblioteca continuam como propriedades de componentes SVG/Recharts; elas não são folhas CSS paralelas.

Exemplo para reutilizar um botão:

```tsx
import { cx, ui } from './ui/styles';

<button className={cx(ui.btnPrimary, 'w-full')}>
  Salvar alterações
</button>
```

As classes em `ui` são strings completas, detectáveis pelo Tailwind durante o build. Para estados variáveis, usar classes completas em mapas ou variantes ARIA/data; não montar nomes como `bg-${cor}`. `data-ui` identifica elementos para variantes de descendentes e inspeção, enquanto estados usam atributos como `aria-current`, `aria-pressed`, `data-open` e `data-selected`.

## Aparência preservada

O tema mantém a paleta, fontes locais, foco visível e movimento reduzido. A unidade de espaçamento é 4px para conservar as medidas do painel, cujo texto-base é 14px. Os breakpoints nomeados têm limite superior exclusivo, preservando em larguras inteiras os antigos limites de 760, 1050 e 1250px. Os limites específicos dos formulários também foram preservados.

O login mantém apresentação à esquerda com 35%, formulário à direita com 65%, os textos ampliados e a centralização da marca/título quando empilhado. Não houve alteração de autenticação, APIs, regras de agenda, conteúdo ou permissões.

## Desenvolvimento e container

```powershell
cd frontend
npm ci
npm run dev
npm run lint
npm run build
```

O plugin do Vite processa o Tailwind; não existe uma etapa manual separada de geração de CSS.

Para atualizar o container e seu volume de dependências após instalar o Tailwind, na raiz:

```powershell
docker compose up -d --build --no-deps --renew-anon-volumes frontend
```

O volume anônimo renovado pertence ao frontend (`node_modules`). O Dockerfile usa `npm ci`, e `.dockerignore` exclui dependências da máquina, artefatos e arquivos de ambiente, permitindo instalar os binários nativos corretos para o container Linux.

## Verificação

Lint, tipos e build do frontend passaram tanto na máquina quanto no container Linux. Uma checagem temporária adicional confirmou que os 608 utilitários presentes nos padrões compartilhados geram CSS e que as chamadas aos serviços foram preservadas em todos os componentes migrados. O painel respondeu HTTP 200 após a atualização. Essa checagem de fonte/build não substitui comparação visual no navegador.
