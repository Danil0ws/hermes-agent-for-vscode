# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento semântico.

## [Não publicado]

### Adicionado

- **Código aberto**: `LICENSE` (MIT) e `CONTRIBUTING.md` (ambiente, gates obrigatórios, arquitetura
  em uma tela, o padrão de lanes paralelas e as regras de documentação). `private: true` saiu do
  manifesto, com `license` e `author` declarados.
- **Quatro idiomas**: inglês (padrão), português, русский e 简体中文. O manifesto usa
  `package.nls.{json,pt-br,ru,zh-cn}.json` (58 chaves por idioma, cobertura verificada por script);
  o runtime usa `webview/*/i18n.<locale>.ts` — tipados por `Strings`, então o `tsc` garante
  paridade de chaves — e `src/l10n.<locale>.ts`. O idioma segue o idioma de exibição do VS Code.
- `webview/shared/l10n.ts`: detecção por `<html lang>` (que o host escreve a partir de
  `vscode.env.language`) e um Proxy sobre o bundle corrente, então **nenhum componente** precisou
  saber que existe mais de um idioma.
- `num()` passa a formatar pelo idioma corrente (pt-BR `1.218`, en/zh `1,218`, ru com espaço
  estreito) — antes era fixo em pt-BR.

### Corrigido

- **Peso das opções de aprovação** (achado ao renderizar a UI, não em teste): `Permitir sempre` — a
  concessão gravada na allowlist permanente — era o botão primário azul e `Negar` o secundário, ou
  seja, a UI empurrava o usuário para a permissão mais ampla. Agora a primeira opção de permissão é
  a primária, as concessões mais amplas ficam secundárias, cada botão explica seu efeito no tooltip
  e há um aviso fixo quando existe opção que grava na allowlist permanente. As opções em si
  continuam exatamente as que o agente envia.
- Alinhamento dos codicons: sem `font-size` e `vertical-align` fixos o glifo ficava fora da linha de
  base do texto ao lado (visível na captura do componente renderizado).
- `src/l10n.ts` não importa mais o runtime do `vscode` (só tipos): o import derrubava as suítes que
  carregam features e catálogos direto, com `MODULE_NOT_FOUND`.
- Uma frase de UI dizia "Ver na view" (anglicismo) → "Ver no painel".

### Notas

- Um teste afirmava o formato pt-BR **fixo** de `num()`. Com a formatação por idioma ele passou a
  falhar; a asserção foi atualizada para o contrato novo (e agora cobre pt-BR, en, ru e zh-CN), não
  silenciada. Total: **45 testes**.

### Alterado

- **Ícone**: a arte do Hermes é o ícone, nos dois temas. A Activity Bar passou a declarar o **par**
  light/dark (antes só um arquivo) e a loja ganhou `media/icon.png` (128×128, RGBA, transparente)
  gerado da mesma arte — o `vsce` recusa publicar com `icon` em SVG. **Contraste corrigido**: o azul
  do tema escuro (`#0066B8`) dava 2,16:1 sobre a Activity Bar escura (abaixo do mínimo de 3:1 para
  elemento não-textual) e virou `#3B9EFF` (4,52:1); o PNG usa `#1E88E5`, que passa nos dois fundos.
- **Preparação para publicar**: `icon` (PNG), `license`, `author` e as 4 localidades do manifesto no
  lugar; nome conferido como livre no Marketplace. Falta apenas `repository` (URL do código) e o
  `publisher`/token da sua conta.

### Corrigido (defeitos encontrados na sidebar estreita, com medida)

- **Menu de envio e popover do medidor saíam do painel.** O menu media 240px ancorado no próprio
  botão do caret (~30px), então em sidebar de 310px começava em **x=-149** e o texto aparecia
  cortado, mostrando só o fim de cada rótulo — "Send now (interrupt)" virava "terrupt)". A âncora
  passou a ser o composer (o painel) e as larguras viraram relativas. Medido em 310/250/200px: nada
  mais sai do painel; abaixo de 240px o menu encolhe com reticências.
- **Seletores de modo/modelo truncavam sem indicador** ("(no mode", "(no agen"). Rótulos de estado
  vazio encurtados (`sem modos`, `sem modelos`) com o motivo no tooltip do controle, e `.sel` com
  `max-width` + `text-overflow: ellipsis` — o truncamento agora se anuncia ("Ask be…", "deeps…").
- **3 testes novos de CSS** travam a classe: popover com clamp percentual (sem unidade de viewport),
  menu/medidor sem largura fixa em px, e os selects com reticências.

### Corrigido (defeitos encontrados RODANDO a extensão, não em teste)

- **`command 'hermes.manage.open' not found`** — a causa não era o CLI. `hermes.manage` estava
  registrado em **dois** lugares (`extension.ts` e a feature de Gerenciar); o segundo
  `registerCommand` lança, e como o bloco da feature não tinha `try/catch`, tudo depois dele nunca
  registrava: `hermes.manage.open`, `agents.test`, `mcp.add`, `skill.open`, `instructions.open`,
  `approvals.open` e o próprio painel. O lançamento era engolido pelo `try/catch` do loop de
  features, então a UI só dizia "command not found" no clique. Agora cada comando tem **um dono**.
- **Windows/WSL nunca subia o processo**: `splitCommand('wsl hermes')` devolvia
  `{file:'hermes', prefix:['wsl']}` e a extensão spawnava `hermes wsl acp` — invertido. O primeiro
  token é o executável: agora é `spawn('wsl', ['hermes','acp'])`. O `--profile` também ia antes do
  wrapper (`wsl --profile x hermes acp`); passou a vir depois do prefixo.
- **`hermes.permissions` não fazia nada**: o handler era descartado com `void permissions;` e o
  painel exibia a política como se valesse. Ver "Aprovação automática" abaixo.

### Adicionado

- **Detecção e instalação do Hermes**: na ativação (que é lazy, logo há intenção real), a extensão
  roda `hermes --version` e `hermes acp --check`. Faltando o CLI, aparece um aviso **modal** com
  "Instalar o Hermes" (script oficial: `curl -fsSL https://hermes-agent.nousresearch.com/install.sh
  | bash`, ou o `install.ps1` no Windows), "Já tenho: informar o caminho" (grava `hermes.cliPath`) e
  "Ver diagnóstico" (`hermes doctor`). Comandos: `Hermes: Verificar / instalar o Hermes`.
- **Aprovação automática (YOLO) de verdade**: `hermes.permissions = allowAll` passou a ser
  respeitado no momento em que o agente pede permissão — a extensão responde sozinha com a primeira
  opção de permissão oferecida (nunca uma de negar). `allowSession` repete a concessão já dada na
  sessão. Comando `Hermes: Alternar aprovação automática (YOLO)`, com confirmação modal para ligar,
  e um item na barra de status **enquanto estiver ligada** (política que aprova tudo sem indicador é
  um jeito de esquecer que ela está ligada).
- **Checagem de cobertura de comandos na ativação**: o canal `Hermes` informa
  `comandos: N/M registrados` e avisa se algum comando declarado no manifesto não foi registrado —
  exatamente o defeito acima, que antes só aparecia no clique. Verificado em execução real:
  `comandos: 39/39 registrados`.
- **Teste de invariante do manifesto** (`src/test/manifest.test.ts`): nenhum id registrado duas
  vezes, todo comando declarado tem quem registre, todo `executeCommand('hermes.*')` aponta para id
  registrado (comandos `<viewId>.focus` do próprio VS Code são isentos) e as 4 localidades do
  `package.nls` cobrem as mesmas chaves.

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
