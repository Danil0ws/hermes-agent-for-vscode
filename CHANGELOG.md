# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento semântico.

## [0.1.0] — 2026-10-11

Interface nativa do Hermes Agent no VS Code sobre ACP. 50 arquivos TypeScript (~6 700 linhas),
7 suítes de teste (44 casos, 2 deles spawnando o `hermes acp` real), `.vsix` de 176 KB.

### Adicionado

**Núcleo (M1)**

- Camada ACP sobre `hermes acp`: `Connection` (spawn com SIGTERM→SIGKILL, `--profile`,
  `HERMES_ACP_SKIP_CONFIGURED_MCP`, prefixo de ambiente tipo `wsl hermes`) e `AgentManager`
  (dono da conexão, implementa o lado Client do ACP, bus de eventos **aditivo**).
- `HermesSession`: `session/new`, `session/load`, `session/list` paginado, `session/fork`,
  `prompt`, `cancel`, `setMode`, `setModel`, com tradução das variantes de `session/update`
  que o Hermes emite para o contrato da webview.
- Contrato único Extension Host ↔ Webview (`src/core/types.ts`, união discriminada, `PROTOCOL = 1`).
- `fs/*` confinado ao workspace; escrita fora exige confirmação.

**Chat (M2/M3/M5)**

- Composer no padrão do Copilot Chat: auto-resize, placeholder contextual, histórico ↑/↓,
  popovers de `/` (comandos do agente) e `#` (contexto) com navegação por teclado, chips de
  contexto, fila visível com arrastar para reordenar e Alt+↑/↓, medidor de contexto com anel,
  popover por categoria e limiares por token de tema, botão Enviar com dropdown
  (Enviar / Adicionar à fila / Direcionar turno / Enviar agora) que vira Parar no turno.
- Transcript: streaming, raciocínio colapsável com tempo decorrido, tool call expansível com
  ícone por `kind` e duração, blocos de código com copiar/inserir, barra de ações por resposta,
  virtualização da lista.
- Aprovação inline com **exatamente** as opções que o agente envia
  (`allow_once` / `allow_session` / `allow_always` / `deny`).

**Sessões (M4)**

- TreeView `hermes.sessions` agrupada por Hoje/Ontem/Anteriores, ícone de estado, contador de
  pendências, badge de atenção, ações inline e de contexto; quick pick nativo com busca; item de
  barra de status; notificações respeitando `hermes.notifications`.
- Estados **derivados** (o ACP não os informa por sessão): rodando / aguardando / erro /
  concluído / ocioso.

**Contexto e working set (M3/M7)**

- `ContextManager`: pick único de contexto (arquivos, pastas, símbolos, seleção, problemas,
  terminal, Git, URL, imagem), chip implícito de seleção desligável, aviso de anexo grande com
  incluir tudo / incluir trecho / resumir.
- `WorkingSet`: arquivos alterados a partir dos diffs dos tool calls, +/− por arquivo,
  manter/desfazer por arquivo e em bloco. "Desfazer" é diff inverso (`WorkspaceEdit`) — o Hermes
  escreve server-side, então a UI diz isso explicitamente.
- `ContextView`: o que vai ao modelo, por grupo, com tokens e %.

**Gerenciar (M6)**

- `ModelCatalog` (agrupamento por provider, favoritos em `globalStorage`, janela de contexto só do
  modelo ativo e só quando o agente reporta), `SkillCatalog` (frontmatter dos `SKILL.md` de usuário
  e de projeto, respeitando `$HERMES_HOME`) e `ToolCatalog` (toolsets e MCP lendo a configuração
  real via `hermes config get` / `hermes tools list` / `hermes mcp list`).
- Painel com 8 abas verticais em Preact, navegável por teclado e com `aria-current`.

**Editor e diagnóstico (M7/M8)**

- Diff no **diff editor nativo** (`hermes-diff:` + `vscode.diff`); plano em view própria com
  "Implementar plano" (que **sugere** `accept_edits`, nunca troca o modo sozinho); CodeAction
  "Corrigir problema com o Hermes"; export da conversa em MD/JSON; `hermes doctor` +
  `hermes acp --check`; checagem de ambiente na ativação via `DiagnosticCollection`.
- Escape hatches: `Abrir CLI completa`, `Executar comando da CLI…` (16 comandos reais),
  `Diagnóstico`, e terminais integrados para renomear/arquivar/excluir sessão.
- Checkpoints: degradação honesta — só oferece "Abrir CLI com --checkpoints" se
  `hermes checkpoints status` citar o cwd; nenhum mecanismo de snapshot paralelo.

**Transparência e empacotamento**

- Canais de saída `Hermes` e `Hermes Traffic` (JSON-RPC bruto com redação de chave/token/segredo).
- i18n do manifesto: 58 chaves em `package.nls.json` (en) e `package.nls.pt-br.json` (pt-BR),
  com cobertura verificada (nenhuma chave faltando ou órfã).
- 37 comandos, 6 menus, 12 settings `hermes.*`, atalhos e `.vscodeignore` (o `.vsix` caiu de
  1,77 MB/87 arquivos para 176 KB/15).
- `scripts/acp_probe.py`: probe real do handshake (initialize + `session/new`) para re-verificar a
  superfície depois de um `hermes update`.

### Corrigido durante a pesquisa e a implementação

- **Não existem modos Ask/Plan/Agent no Hermes**: os 3 modos do ACP são política de aprovação de
  edição (`default`, `accept_edits`, `dont_ask`). O picker lista o que o agente anunciar.
- O SDK oficial de ACP (`@agentclientprotocol/sdk`) **não tipa** `models`, `session/set_model`
  nem `session/fork`, que o adapter do Hermes implementa → `extMethod` + tipos locais, num só lugar.
- O sintagma de contexto do VS Code atual é **`#`**, não `@` (aceito como alias).
- `AgentManager.onEvent` era de assinante único e as features contornavam isso em runtime; agora é
  aditivo e o polling de 1 s da view de plano foi removido.

### Notas de compatibilidade

- `@agentclientprotocol/sdk` é **ESM-only** → o extension host é empacotado em CJS com esbuild.
- `NODE_ENV=production` no shell faz o `npm install` pular devDependencies: use
  `export NODE_ENV=development` antes de instalar/buildar.

### Limitações conhecidas (não escondidas)

- **Skills ativas, toolsets/MCP e esforço de raciocínio não existem no ACP**: o painel Gerenciar lê
  a configuração real do Hermes e a CLI. O catálogo lista as skills **instaladas**, com a ressalva
  de que "ativas" não é informado.
- **Custo da sessão**: não existe no protocolo. Nenhum número é exibido.
- **Detalhamento do contexto** é estimativa local, sempre rotulada "estimado"; o raciocínio é
  medido (vem do `usage` do turno).
- **`session/list` precisa de conexão viva**; sem sessão ativa a view de sessões mostra vazio.
- **Pendências são atribuídas à sessão ativa** — os eventos do ACP não trazem `sessionId`.
- **Ícones**: as duas webviews usam **Codicons** (`@vscode/codicons`, o conjunto oficial), servidos
  por `codicon.css` + `codicon.ttf` com base relativa no Vite — dentro da webview o `url(/…)` padrão
  aponta para a raiz do `vscode-webview` e daria 404. O extension host usa `ThemeIcon`/Codicon onde a
  API nativa oferece.
- **L10n de runtime** (`vscode.l10n.t`) e as strings das webviews (`i18n.ts` pt-BR) não estão
  integradas ao `package.nls` — o manifesto está internacionalizado, o runtime ainda não.
