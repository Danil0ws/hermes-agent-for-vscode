# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento semântico.

## [Não publicado]

### Corrigido

- **`publisher` do manifesto era `hermes-agent`**: o upload no Marketplace recusou com "Publisher ID
  'hermes-agent' provided in the extension manifest should match the publisher ID 'Danil0ws' under
  which you are trying to publish this extension". O campo passou a ser o id real (`Danil0ws`), o
  mesmo dono de `repository`/`homepage`. `vsce package` valida o **formato** do id, não a existência
  da conta: quem publica só descobre a divergência no upload. O `.vsix` já empacotado precisa ser
  refeito (o id vai dentro do `package.json` do pacote).

### Adicionado

- **Anexos de contexto**: colar no campo anexa arquivos/pastas copiados do Finder (URI do clipboard) e
  imagens do clipboard (bitmap → arquivo temporário → bloco de imagem no prompt); anexar uma seleção ou
  um arquivo escreve também a referência textual `` `.vscodeignore:4` `` no campo, no caret, para o
  prompt dizer ONDE está o conteúdo; anexo acima do teto por chip é **cortado no começo** e marcado
  (`cortado` no chip, caminho do conteúdo inteiro no tooltip). Teto: 2000 tokens por anexo.

### Corrigido

- **Remover chip anexado não pegava** (`×`): havia DUAS listas de chips — a do provider (usada em
  `send`/`initialState`) e a do `ContextManager` publicada pela sessão. O `×` removia da segunda e o
  chip **voltava no `init` seguinte** (trocar de aba, iniciar, nova conversa). Agora `setChips` do
  provider é o ponto único de escrita, o `publish` do manager roteia para ele, e chip anexado antes de
  existir sessão não é mais descartado em silêncio.
- **`×` do chip também abria o arquivo**: o clique chegava ao `activate` do chip por bubbling.

### Adicionado

- **Abas no chat: uma conversa por aba.** Cada aba é uma sessão própria (não uma troca de contexto na
  mesma sessão), e a barra de abas **é** o indicador de lane ativa: girando enquanto o turno daquela
  aba corre, ponto de aviso quando ela espera aprovação, `title` com agente · cwd · branch. Fechar aba
  não apaga a sessão (o histórico continua em `hermes sessions`); as abas de fundo continuam acumulando
  turnos. O id da aba passou a acompanhar todo evento de sessão — a lacuna 11.14 virou pré-requisito e
  foi fechada no `AgentManager` (`newSession(..., tab?)` e `deps(tab?)`), sem tocar a sessão.
- **Enviar/fila dentro do campo de texto**: botão-fantasma (`➤`) no canto inferior direito do
  `textarea`, sem fundo e sem borda, que abre o mesmo menu de antes (enviar / pôr na fila / dirigir /
  interromper). A engrenagem **saiu** do composer: `Hermes: Manage` subiu para o título da view
  (`navigation@4`), ao lado do histórico.
- **`Hermes: New Worktree and Session` (lane em worktree)**: cria `git worktree add <root>/<branch> -b
  <branch>` (raiz de `hermes.worktreeRoot`; vazio = pasta irmã `<repo>-worktrees`), sugere `lane/<n>` a
  partir do `git worktree list`, valida o nome da branch antes de rodar qualquer coisa e abre a conversa
  **no diretório do worktree**. Erros (sem git, pasta não é repositório, nome inválido, falha do git)
  aparecem como mensagem, com o stderr do git na última.
- **Bloco "Iniciar" centrado**: sem sessão, o vazio mostra título, uma linha explicando o que o clique
  faz e o primário centralizado — antes disso o único caminho era o botão da toolbar.

### Corrigido

- **Texto de item não seguia o idioma do VS Code**: o host tinha **63 literais pt-BR fora de `tr()`**
  (itens da árvore de Sessões, títulos de view, QuickPick/InputBox, notificações, nome do terminal,
  cabeçalhos do export, rótulos de severidade) — apareciam em português mesmo com o editor em
  inglês/russo/chinês. Todos passaram por `tr()` e os três dicionários foram preenchidos (111 → 205
  chaves cada, paridade conferida por script). Guarda nova em `src/test/l10n.test.ts`: qualquer literal
  pt-BR visível fora de `tr()` quebra a suíte (verificada falhando no código antigo, acusando 63
  ocorrências). Ficaram de fora, por decisão: logs, prompts enviados ao modelo e strings com `${…}`
  (chave dinâmica não casa com o dicionário — ver `docs/ARCHITECTURE.md` §13.1).
- **O `+` do título da view abre uma ABA nova** (`hermes.newConversation` → `provider.newTab()`), já que
  a barra de abas deixou de ter `+` próprio; `⟲` continua reiniciando a sessão na mesma aba.
- **Renomear aba disparava o comando duas vezes**: `Enter` commitava e o input saía da árvore, então o
  browser disparava `blur` — que commitava DE NOVO (medido no harness: dois `renameTab` por renomeação).
  Agora só o primeiro commit da edição vale (`once` no `RenameInput`). Medido depois: `Enter` = 1 post,
  `Escape` = 0 (e fecha o input), `blur` sozinho = 1, valor só com espaços = 0 e o título não some.
- **Dois botões de "nova conversa" na tela**: a barra de abas tinha `+` e worktree próprios, e o título
  da view já tinha o `+` de nova conversa. Agora a barra de abas **só** mostra as abas, e os dois
  atalhos vivem no título: `+` (nova conversa = aba nova) e o ícone de branch
  (`Hermes: New Worktree and Session`, `navigation@5`). `⟲` continua reiniciando a sessão na mesma aba.
- **`Iniciar` duplicado e painel interativo antes de iniciar**: o bloco central e o primário da
  toolbar mostravam o MESMO botão, e o resto do painel aceitava interação sem sessão (campo de texto,
  `+`, selects em "sem modos"/"sem modelos", medidor, botões de aba/worktree). Agora o único `Iniciar`
  é o do bloco central; sem sessão a toolbar inteira não é renderizada, o campo fica desabilitado com
  o placeholder "Inicie o agente para escrever" e as abas/worktree ficam inertes. Medido no harness:
  1 botão "Iniciar" e 0 selects antes; com sessão, toolbar de volta e o `➤` dentro do campo (fundo
  transparente, borda `0px none`, `padding-right: 32px` no campo).
- **`npm test` dependia do node do PATH**: a forma de diretório (`node --test dist-test/`) deixou de
  resolver no node 26 e o gate falhava com "Cannot find module .../dist-test" enquanto a mesma suíte
  passava pelo node 24 do shell de login. O script virou `node --test dist-test/*.mjs` (o shell
  expande a lista), que funciona nas duas versões.
- **`init` do host era ignorado no bundle empacotado** — e o `init` é o primeiro estado que chega ao
  painel (abas, `sessionId`, `usage`, config da fila). `applyInit` escrevia dentro de `batch()` do
  `@preact/signals`, pacote que não é dependência declarada do projeto (vem hoisted) e que, na versão
  instalada, não exporta `batch`: no bundle o handler morria com `TypeError` e o painel abria **sem
  abas, sem sessão e com o medidor parado, sem nada no console**. Passavam `tsc`, os 72 testes e o
  `vsce package`; o que pegou foi renderizar o bundle construído no harness e instrumentar o
  minificado. Guardas novas em `src/test/tabs.test.ts` (comportamento do `init` + fonte, proibindo
  `batch(` dentro de `applyInit`).
- **Medidor de contexto no estado desconhecido**: renderizava o texto longo ("O agente ainda não
  reportou…", 49 caracteres) **dentro** de um botão de 37px, com reticências, em qualquer largura de
  painel. Medido no harness antes da correção (200/250/310/420/560/1440px). O corpo virou `—` e o texto
  longo ficou no `title`/`aria-label`; o `.sr-only` ganhou `clip-path: inset(50%)`.

- **`docs/ROADMAP.md`**: as lacunas verificadas de `ARCHITECTURE.md` §11 e o M9 parcial viram
  trabalho executável — cada item com a lacuna de origem, a ação, o **sinal que fecha** (ex.: gate
  verde + medida no harness), o custo e o dono (este repo × humano no editor × upstream). Três fases
  de código/prova, uma de upstream e uma de "decidido não fazer, com o motivo". Conferido no
  fechamento: `hermes sessions --help` tem `delete/archive/rename` (o escape hatch já implementado em
  `src/features/sessions.ts` cobre §11.3) e `grep -rn 'rollback\|checkpoint'
  ~/.hermes/hermes-agent/acp_adapter/*.py` **não acha nada** — a lacuna de checkpoint é upstream, não
  deste repo. Duas afirmações do §11 (§11.14 e §11.5) ficaram desatualizadas e o roadmap registra o
  estado real (o contador por sessão é de aprovação pendente; a janela por modelo não tem fonte
  local) — o diagnóstico do §11.14 foi corrigido na mesma entrega.
- **Publicação: `repository`, `bugs` e `homepage` no manifesto** (`github.com/Danil0ws/hermes-agent-vscode`)
  e a arte do Hermes de volta na primeira linha do README. Era o único aviso que o `vsce` emitia — e
  o campo é o que dá URL base para o `vsce` resolver imagem local: com ele, `vsce package` passa com
  a imagem no topo; sem ele, falha (não avisa). `CONTRIBUTING.md` deixou de documentar o contorno.
- **Botão Iniciar + loading no chat**: enquanto não existe sessão, o botão primário do composer é
  `Iniciar` (`WebviewToHost.start` → `ChatViewProvider.start`), com spinner e rótulo "Iniciando…".
  É o clique que faz o `session/new` **anunciar** modos, modelos e comandos — antes disso os dois
  selects do composer abriam em "sem modos"/"sem modelos" (correto, e lido como painel carregado
  pela metade) e só se enchiam no primeiro envio. O estado vazio mostra o progresso enquanto o
  handshake corre e ganhou a dica do botão; `starting` entrou no `ChatState`. Idempotente: clique
  duplo não abre duas sessões.
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

### Alterado

- **`README.md` em inglês.** É a porta de entrada do repo e a página do Marketplace, então passou a
  ser o único documento em inglês (`docs/`, `CONTRIBUTING.md` e este CHANGELOG seguem em pt-BR, e o
  README diz isso em uma linha honesta). Os títulos de comando da tabela agora são os **reais** do
  `package.nls.json` (antes eram traduções livres do pt-BR) e as descrições de configuração/conexão
  foram conferidas contra o manifesto.
- Números que derivam saíram do README (total de testes, total de comandos, contagem de chaves de
  i18n): ele já tinha derivado duas vezes (45→56 testes, 58→60 chaves). Quem conta é o `npm test`.
- Guardas novas em `src/test/manifest.test.ts`: o README só pode citar comando e chave `hermes.*` que
  existem no manifesto, e todo caminho (`docs/`, `media/`, `CONTRIBUTING.md`, `LICENSE`, …) que ele
  cita tem de existir em disco. Verificado que as duas falham com o README quebrado (comando, chave e
  arquivo inexistentes) e passam com ele correto.
- **Entrada e saída do chat: escala e posições.** A barra inferior do composer não quebra mais linha
  (`flex-wrap: nowrap`): os dois selects dividem a sobra — o de modelo com o dobro do espaço, porque
  ids como `OpenCode Go · deepseek-v4.1-flash` são longos — e o primário fica colado à direita em
  qualquer largura de painel. Antes, com `wrap` mais `max-width: 46%`/`42vw` (unidade de *viewport*
  dentro de um painel), o rótulo do modelo empurrava os botões de linha e o Enviar mudava de lugar
  conforme o modelo escolhido.
- A prosa do balão usa a fonte da UI (`font-family: inherit`, `line-height: 1.5`): a monoespaçada do
  editor ficou para `<pre>` (código, tool, raciocínio), que é onde ela informa. O balão inteiro em
  `editor-font-size` fazia a resposta parecer bloco de código e brigava de escala com os rótulos de
  VOCÊ/HERMES.
- O turno do usuário ganhou barra de acento (`border-left` com `--vscode-button-background`): quem
  falou se lê de relance em vez de depender de dois cinzas parecidos.
- As ações da resposta (copiar/reenviar/inserir/diff) ficam visíveis em repouso a 0.6 e cheias no
  hover/foco — estavam em `opacity: 0` e ninguém descobria que existiam.
- Guarda: teste de CSS falha se o toolbar voltar a quebrar linha, se os selects perderem a divisão
  da sobra, se aparecer unidade `vw` no CSS do chat ou se a prosa do balão sair da fonte da UI.
- **Medida de leitura com teto.** Em painel largo a resposta ia de borda a borda: medido no harness,
  1418px de texto em 1440px de painel (~218 caracteres por linha). Agora o turno é limitado a
  `min(100%, 78ch)` — 564px, ~87 caracteres por linha — e em painel estreito o `100%` continua
  mandando (250/310/560px seguem ocupando a largura útil).
- **Pisos dos selects recalibrados e saída para painel mínimo.** Os pisos existem para forçar a
  quebra entre os grupos (quem dá largura é o `flex: 1 1 0`), mas 72/132px estouravam o painel:
  medido em 250px davam 286px de conteúdo contra 234px de painel, com rolagem horizontal. Agora são
  40/80px (o grupo cabe em 202px) e abaixo de 220px — o mínimo que a sidebar do VS Code aceita — um
  `@media` solta os pisos e deixa os selects encolherem com reticências. Medido de 170px a 1440px:
  sem rolagem horizontal, primário sempre dentro do painel.
- **Popovers do composer são exclusivos.** O menu do envio e o popover do medidor ancoram no mesmo
  canto inferior direito; abertos juntos, um cobria a última linha e o botão do outro (visto no
  harness em 1440px). Um signal `openPopover` faz abrir um fechar o outro — verificado nos dois
  sentidos.
- Guarda: o teste de CSS também cobra os pisos que caibam em 220px, a saída de `@media` e o teto de
  medida de leitura.

### Corrigido

- **O container `hermes` não registrava na Activity Bar** (achado no log do editor, não em teste):
  `contributes.viewsContainers.activitybar[0].icon` declarava o par `{light, dark}` e o schema do
  VS Code exige `icon` **string** — o container inteiro é descartado, com apenas duas linhas no log
  (`a propriedade icon é obrigatória e deve ser do tipo string` e `O contêiner de modo de exibição
  'hermes' não existe`), e todas as views caem em `Explorer`. Agora o ícone é um arquivo só,
  `media/hermes-agent-vscode.svg` com `#2B8AD9` (3,66:1 sobre branco, 3,45:1 sobre `#333`, medido)
  — o `#007ACC` da variante clara dava 2,80:1 no fundo escuro e o par nem era aceito. Dois testes
  novos no manifesto cobram `icon` string (com o arquivo existindo em disco) e todo
  `contributes.views` apontando para um container declarado.
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

### Corrigido

- **Seletores de modo e modelo ficavam vazios na conversa.** O `session/new` devolve 3 modos e o
  catálogo de modelos (222 nesta máquina) e o estado os guardava — mas a sessão só os **anunciava**
  em eventos de mudança. Como o `send()` cria a sessão sob demanda no primeiro prompt, o `init` que a
  webview tinha em mãos fora montado sem sessão (`modes: []`) e nada mais chegava: os seletores
  ficavam vazios a conversa inteira. A sessão passa a anunciar o escopo ao nascer (cobre primeiro
  prompt, nova conversa e abrir do histórico de uma vez). O teste de integração agora exige a
  emissão — verificado que falha sem ela.

### Corrigido (fluxo de desenvolvimento)

- **`Cannot find module .../dist/extension.js` ao ativar.** O `build` começava com `clean`
  (`rm -rf dist`), então qualquer build que falhasse — ou estivesse em voo — deixava o `dist/` vazio,
  e o Extension Development Host subia sem nada. O build agora roda o **typecheck antes do `clean`**:
  erro de tipo aborta sem destruir o `dist/` anterior. Verificado: com um erro de tipo proposital, o
  build falha e o `dist/extension.js` continua lá (antes desaparecia).
- **`.vscode/launch.json` e `.vscode/tasks.json`** (não existiam): o F5 agora tem
  `preLaunchTask: npm: build`, então nunca sobe contra um `dist/` velho ou ausente.

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
