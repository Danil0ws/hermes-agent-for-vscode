# Hermes Agent for VS Code — UX

Objetivo: **quem usa o Copilot Chat se sente em casa em 5 segundos.** Mesma disposição, mesmos
gestos, mesma linguagem visual — com os recursos do Hermes.
Regra de ouro: **componente nativo do VS Code sempre que existir.** A webview só desenha o que o
VS Code não tem (transcript, composer, medidor, chips).

Base de comparação verificada: VS Code **1.141.0** + documentação atual do chat do VS Code
(controles `Session Target · Agent · Language model · Permissions`, `#`-menções, botão Send com
Add to Queue / Steer with Message / Stop and Send, lista de sessões por período, controle de janela
de contexto dentro do composer). Ver `docs/ARCHITECTURE.md §2.5`.

---

## 1. Princípios

1. **Nativo primeiro.** `view/title`, QuickPick, InputBox, TreeView, StatusBar, diff editor,
   terminal integrado, OutputChannel. Nada disso é reconstruído na webview.
2. **Zero cor hardcoded.** Só `--vscode-*` e `var(--vscode-font-family|editor-font-family|font-size)`.
   Tema claro/escuro/alto contraste/terceiros refletem ao vivo, sem recarregar.
3. **Ícones**: Codicons (`@vscode/codicons`) e `ThemeIcon`. Sem emoji, sem pacote próprio.
4. **Teclado total**: todo controle alcançável por Tab, foco visível, atalho, tooltip e `aria-label`.
5. **Sóbrio**: sem gradiente, sem cartão decorativo, sem ilustração. Espaçamento na grade do VS Code.
6. **Honestidade de dado**: o que não existe aparece oculto ou rotulado "estimado". Nunca um número
   inventado, nunca um medidor fingindo.

---

## 2. View de chat

Local padrão: **Secondary Side Bar**. Também abre como aba de editor ("Abrir em editor").
Estado vazio: saudação curta + dica do `Iniciar` + 4 ações + atalho para Gerenciar. Sem arte.
Enquanto o `Iniciar` corre, o estado vazio mostra o progresso (spinner + rótulo) em vez das ações.

### 2.1 Esqueleto

```
┌─ HERMES AGENT ──────────────────────────────────────────────[titulo]─┐
│  +    ⟲    ⧉    ⚙    …                                                │  <- menu view/title (nativo)
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌ HISTÓRICO ─────────────── Hoje ─────────────────────────────────┐  │
│  │ ● Refatorar QueueManager           2 min atrás  ⟳ 3 pendências  │  │
│  │ ○ Corrigir parser de updates       1 h atrás                    │  │
│  │ ─ Ontem ─                                                       │  │
│  │ ○ Ajustar medidor de contexto      ontem                        │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  VOCÊ                                                                 │
│  Analise src/core/QueueManager.ts e proponha testes          [✎][⧉][↻] │  <- ações no hover
│                                                                       │
│  ▸ Raciocínio · 4,2 s · concluído                                     │  <- agent_thought_chunk
│                                                                       │
│  HERMES                                                               │
│  O arquivo tem três responsabilidades…                                │
│  ```ts                                                                │
│  export class QueueManager { … }                             [⧉][↧]   │  <- copiar / inserir no editor
│  ```                                                                  │
│                                                                       │
│  ▾ ✓ patch  src/core/QueueManager.ts  +42 −7              1,8 s  [diff]│  <- tool_call (kind=edit)
│      └ movido drain() para fora da classe                            │
│  ▾ ✓ terminal  npm test -- queue                          6,1 s  [term]│
│                                                                       │
│  ┌ PLANO ─────────────────────────────── 2/4 ───────────────────────┐ │  <- session/update plan
│  │ ✓ Extrair drain()                                                │ │
│  │ ✓ Escrever testes de ordem                                        │ │
│  │ ◐ Cobrir persistência                     (em andamento)          │ │
│  │ ○ Rodar a suíte completa                                          │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌ ARQUIVOS ALTERADOS ─────────────────────────── 2 arquivos  +48 −9 ┐ │  <- WorkingSet
│  │ M  src/core/QueueManager.ts        +42 −7   [diff]  [Manter][↺]   │ │
│  │ M  test/queue.test.ts              +6  −2   [diff]  [Manter][↺]   │ │
│  │                              [Manter tudo]  [Desfazer tudo]       │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌ 2 na fila                                          [Limpar] ────┐  │  <- fila client-side
│  │ ⠿ Rodar também o lint                          [▶ agora][✎][×]  │  │
│  │   Depois, atualizar o CHANGELOG                [▶ agora][✎][×]  │  │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌ CONTEXTO ────────────────────────────────────────────────────────┐  │
│  │ 📄 QueueManager.ts · 1.2k      📄 seleção L40–L78 · 380          │  │  <- chips
│  │ ϟ skill: tdd-workflow · 900    × (implícito) arquivo ativo       │  │
│  │                                                [+ Adicionar]      │  │
│  └───────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ Pergunte ao Hermes, # para contexto, / para comandos             │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│   [+]  [ Modo ▾ ]      [ Modelo ▾ ]       [⚙]     ◔ 34%   [ Enviar ▾ ]  │
└───────────────────────────────────────────────────────────────────────┘
```

A barra inferior é **uma linha só, sem quebra**: `+` · Modo · Modelo · engrenagem · medidor ·
Enviar ▾. Os dois selects dividem a sobra da linha (o de modelo com o dobro do espaço, porque os
ids são longos) e o primário fica colado à direita em qualquer largura de painel — com `wrap` os
botões escorregavam de linha conforme o rótulo do modelo, e a posição do Enviar mudava junto.

Antes de existir sessão, o primário é **Iniciar** (com spinner e rótulo "Iniciando…" enquanto o
handshake corre):

```
sem sessão:  [ ▶ Iniciar ]     ← cria a sessão: session/new + anúncio de modos/modelos/comandos
iniciando:   [ ⟳ Iniciando… ]  ← botão indisponível: clique duplo não abre duas sessões
com sessão:  [ Enviar ▾ ]      ← Enter (o menu ▾ só existe com a fila ligada)
```

É esse clique que enche os dois selects: antes dele não há sessão e o `session/new` ainda não
devolveu modos nem catálogo de modelos, então "sem modos"/"sem modelos" era o estado normal do
painel recém-aberto — não um erro. Clicar numa sugestão do estado vazio continua funcionando
(cria a sessão no primeiro prompt), mas o caminho explícito é o botão.

Duas regras que valem para o painel inteiro:

- **Medida de leitura**: o turno é limitado a `min(100%, 78ch)` — em painel largo (1440px medidos no
  harness) a resposta ia de borda a borda, ~218 caracteres por linha; agora são ~87. Em painel
  estreito quem manda é o `100%`.
- **Um popover por vez**: o menu do envio e o popover do medidor ancoram no mesmo canto inferior
  direito, então abrir um fecha o outro (signal `openPopover`). Antes, com os dois abertos, o menu
  cobria a última linha e o botão do medidor.

Larguras medidas (harness, 250/310/560/1440px): selects 51/101 · 71/141 · 108/216 · 255/509; a barra
fica em duas linhas até ~540px e passa a uma linha a partir de ~550px (medido: 2 linhas em 540, 1 em
560); abaixo de 220px os selects encolhem.

### 2.2 Barra de título — nativa (`contributes.menus.view/title`)

| Item | Ícone | Comando | O que faz |
|---|---|---|---|
| Nova conversa | `$(add)` | `hermes.newConversation` | `session/new` no agente ativo |
| Histórico | `$(history)` | `hermes.showSessions` | QuickPick com busca, agrupado Hoje/Ontem/Anteriores |
| Abrir em editor | `$(open-preview)` | `hermes.openInEditor` | a mesma view como aba |
| Configurar | `$(gear)` | `hermes.manage` | painel Gerenciar (§6) |
| … | `$(kebab-horizontal)` | submenu | Abrir CLI completa · Executar comando da CLI · Diagnóstico · Mostrar log · Mostrar tráfego · Exportar conversa |

Nenhum desses é botão dentro da webview.

### 2.3 Área da conversa

- Mensagem do usuário: **editável** — clicar em ✎ reabre o texto no composer; reenviar = **ramificar
  a partir daquele ponto** (nova sessão via `session/fork` quando houver edição de arquivo depois).
- Resposta: Markdown incremental, highlight de código, bloco de código com `copiar` e
  `inserir no editor`. Barra de ações por resposta: copiar · reexecutar · inserir · abrir diff.
- Raciocínio: bloco colapsável com streaming e tempo decorrido (`agent_thought_chunk`).
  Config `hermes.showReasoning`: `always` | `collapsed` | `hidden`.
- Tool call: item compacto e expansível (ícone por `kind`, título, status, entrada/saída, duração).
  `kind` → ícone: `read`=book, `edit`=edit, `delete`=trash, `move`=arrow-right, `search`=search,
  `execute`=terminal, `think`=lightbulb, `fetch`=cloud, `switch_mode`=arrow-swap, `other`=tools.
- Diff: abrir o **diff editor nativo** (TextDocumentContentProvider). Aprovar/rejeitar por arquivo
  no cartão de arquivos alterados (§2.4).
- Aprovação: barra inline (§5.3).
- Plano: cartão fixo no turno + view própria "Hermes Plan".
- Aviso de compactação: divisor no transcript quando `_meta.hermes.containsCompactionSummary`
  aparecer — "Contexto compactado aqui".
- Sugestões de follow-up: quando o agente oferecer (não é capability do ACP hoje — só renderizamos
  se algum dia vier; nada inventado).

### 2.4 Cartão "Arquivos alterados" (working set)

Fonte: blocos de diff dos `tool_call`/`tool_call_update` + `ToolCallLocation.path`.
Cada linha: estado (`M`/`A`/`D`), caminho, `+N −M`, `[diff]`, `[Manter]`, `[↺ Desfazer]`.
Rodapé: `[Manter tudo]` `[Desfazer tudo]`.

Texto obrigatório no rodapé do cartão (o escopo precisa ser explícito):
> O Hermes já escreveu estes arquivos no disco. "Desfazer" aplica o diff inverso. Restaurar o turno
> inteiro usa o checkpoint do próprio Hermes (`hermes chat --checkpoints` + `/rollback`) — a sessão
> ACP ainda não tira checkpoints, então o botão só aparece quando existe store para este diretório.

---

## 3. Composer (de cima para baixo)

1. **Linha de chips de contexto** (§4) com `+ Adicionar contexto`.
2. **Fila** (§5.1) quando houver itens — logo acima do campo.
3. **Campo de texto** multilinha, auto-resize, placeholder contextual:
   - ocioso: `Pergunte ao Hermes, # para contexto, / para comandos`
   - turno ativo: `Enfileirar ou dar direção ao turno em andamento`
   - com chip: `Pergunte sobre os N itens anexados`
   Histórico ↑/↓, `#` e `/` com popover, colar imagem (capability `image`).
4. **Barra inferior** (uma linha, sem quebra): `+` · Modo · Modelo · Ferramentas · *(os dois selects
   dividem a sobra)* · medidor de contexto · Enviar ▾ — ou **Iniciar** enquanto não há sessão.

### 3.1 Botão de envio (idêntico ao do VS Code)

```
sem sessão: [ ▶ Iniciar ]      ← session/new: anuncia modos, modelos e comandos
iniciando:  [ ⟳ Iniciando… ]   ← indisponível até o handshake terminar
ocioso:   [ Enviar ]           ← Enter
turno:    [ ■ Parar ]  ▾       ← Esc
                ├ Enviar agora (interromper)   session/cancel + prompt
                ├ Adicionar à fila             fila client-side
                └ Direcionar turno (steer)     prompt text-only durante o turno
```
Padrão configurável: `hermes.queue.defaultAction` = `queue` | `steer` (espelha
`chat.requestQueuing.defaultAction`). `hermes.queue.enabled=false` remove o dropdown e mantém
apenas Enviar/Parar.

### 3.2 Atalhos

| Ação | Atalho |
|---|---|
| Enviar | `Enter` |
| Nova linha | `Shift+Enter` |
| Cancelar turno | `Esc` |
| Adicionar contexto | `Ctrl/Cmd+Shift+A` (não colidir com o nativo) |
| Alternar modo/permissões | `Ctrl/Cmd+Shift+M` |
| Focar modelo | `Ctrl/Cmd+Shift+L` |
| Abrir Gerenciar | `Ctrl/Cmd+Shift+,` |
| Abrir CLI completa | pela paleta: `Hermes: Abrir CLI completa` |
| Chat inline (se viável) | `Ctrl/Cmd+I` |

Cada item da webview leva `aria-label`, `role`, `tabindex` correto e respeita
`prefers-reduced-motion` (a animação de "digitando" simplesmente não anima).

---

## 4. Contexto

### 4.1 Chips

```
┌──────────────┐
│ 📄 Queue…ts  │  1.2k   ×      tooltip: src/core/QueueManager.ts — arquivo inteiro · 1 218 tokens
└──────────────┘
┌──────────────┐
│ 📄 L40–L78   │  380    ×      tooltip: src/core/QueueManager.ts linhas 40–78 · 380 tokens
└──────────────┘
┌──────────────┐
│ ϟ tdd-work…  │  900    ×      tooltip: skill "test-driven-development" (usuário) ·
└──────────────┘                carregada como instrução
 (implícito)  📄 arquivo ativo   ← esmaecido, um clique liga/desliga
```

- Ícone por tipo: arquivo/folder/símbolo/seleção/problema/terminal/git/URL/imagem/skill.
- `×` remove; clique no chip abre o arquivo (ou o painel de contexto, para itens não-arquivo).
- Arrastar do Explorer ou uma aba do editor para o composer cria chip.
- Implícito (arquivo ativo, seleção) entra esmaecido e desligável.

### 4.2 `+ Adicionar contexto` e `#`

Um único QuickPick com busca fuzzy e as mesmas fontes:
Arquivos · Pastas · Símbolos (`vscode.executeWorkspaceSymbolProvider`) · Seleção ·
Problemas (`languages.getDiagnostics`) · Terminal (última saída do terminal ativo) ·
Alterações do Git (`git diff`) · URL (InputBox) · Imagem (file picker).

> Nota: o VS Code atual usa **`#`** para menções de contexto (`@` era o sintagma antigo de
> participantes de chat). Aceitamos `@` como alias, mas o placeholder e o popover ensinam `#`.

### 4.3 Aviso de tamanho

Anexar algo grande abre um aviso, nunca um bloqueio silencioso:

```
┌ Anexar src/core/QueueManager.ts ─────────────────────────────────┐
│ ≈ 38k tokens — cerca de 30% da janela do modelo ativo.           │
│ ○ Incluir tudo      ● Incluir trecho (defina o intervalo)        │
│ ○ Resumir com o modelo (consome um turno)                        │
│                                    [Cancelar]  [Anexar]          │
└──────────────────────────────────────────────────────────────────┘
```
Limiar em `hermes.context.warnAt` (padrão 80, %). O mesmo aviso aparece **antes de enviar** se o
anexo estourar a janela.

---

## 5. Turno em andamento

### 5.1 Fila

```
┌ 2 na fila                                                [Limpar] ┐
│ ⠿ Rodar também o lint                        [▶ agora][✎][×]      │   ← ⠿ = arrastar para reordenar
│   Depois, atualizar o CHANGELOG              [▶ agora][✎][×]      │
└──────────────────────────────────────────────────────────────────┘
```
- Persistida por sessão (`globalStorage`), sobrevive a reload e a queda do agente.
- `▶ agora` = `session/cancel` do turno atual e envia este item — com confirmação.
- Reordenar por arrastar (handle no hover) e por teclado (`Alt+↑/↓`), como no VS Code.
- Rede de segurança: se um prompt escapar durante o turno, o servidor responde
  `Queued for the next turn. (N queued)` e o aviso aparece no transcript.
- Com `hermes.queue.enabled=false` o composer não enfileira: avisa e oferece steer.

### 5.2 Medidor de contexto

```
        ◔ 34%          < 70% normal (--vscode-charts-green)
        ◑ 78%          70–90% aviso (--vscode-editorWarning-foreground)
        ◕ 94%          > 90% crítico (--vscode-errorForeground)
```
Popover ao hover/foco:
```
┌ Contexto ────────────────────────────────────────────────────────┐
│  68 400 de 200 000 tokens (34%)                    (do agente)   │
│  ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  Instruções do projeto    4 100    estimado                      │
│  Skills ativas            2 800    estimado                      │
│  Ferramentas / MCP        9 600    estimado                      │
│  Arquivos e anexos        1 600    estimado                      │
│  Histórico                48 700   estimado                      │
│  Raciocínio (último turno) 1 600   medido                        │
│  Não atribuído            0                                        │
├──────────────────────────────────────────────────────────────────┤
│  Último turno: 12 400 in · 980 out · 1 600 reasoning · 9 100 cache │
│  Custo da sessão: não informado pelo agente                        │
├──────────────────────────────────────────────────────────────────┤
│  [Compactar]   [Nova conversa com resumo]   [Ver detalhes]        │
└──────────────────────────────────────────────────────────────────┘
```
- Fonte de `usado/total`: `usage_update`. Sem `usage_update` → `—` e tooltip explicando.
- "estimado" em todo número calculado localmente; `Tokens.ts` é a única fonte da heurística.
- `Compactar` = `/compress` (o agente só aceita com a sessão ociosa; se estiver em turno, o botão
  fica desabilitado com tooltip "aguarde o turno ou cancele").
- Aviso proativo em 80% (config `hermes.context.warnAt`).

### 5.3 Aprovação

```
┌ O Hermes quer executar ──────────────────────────────────────────┐
│  rm -rf ./dist && npm run build                                  │
│  cwd: ~/Dev/hermes-for-vs-code                                   │
│  [Permitir uma vez] [Permitir na sessão] [Permitir sempre] [Negar]│
└──────────────────────────────────────────────────────────────────┘
```
- Opções **exatamente** as que o agente mandar em `session/request_permission`
  (`allow_once` | `allow_session` | `allow_always` | `deny`) — sem inventar nem omitir.
- `hermes.permissions` = `ask` | `allowSession` | `allowAll` **pré-seleciona** a resposta do cliente.
  Com `allowAll`, um aviso de segurança fixo fica visível na barra de status.
- Edições também pedem permissão (política derivada do modo): o cartão mostra o diff, não o comando.
- Timeout do lado do agente nega sozinho (padrão 300 s). Mostramos o tempo restante.
- Tudo vai para o OutputChannel "Hermes".

### 5.4 Plano

```
┌ PLANO ───────────────────────────────── 2/4 · [Ver na view] ────┐
│ ✓ Extrair drain()                                               │
│ ✓ Escrever testes de ordem                                      │
│ ◐ Cobrir persistência                                           │
│ ○ Rodar a suíte completa                          [Implementar]  │
└─────────────────────────────────────────────────────────────────┘
```
- `◐` = `in_progress`, `✓` = `completed`, `○` = `pending`; `priority` só ordena.
- "Implementar plano" (aparece quando o agente está em modo que pede aprovação e há plano pendente):
  envia o plano como prompt de implementação e, se o modo atual não permitir edição, sugere
  `accept_edits` em vez de mudar sozinho.

---

## 6. Painel "Gerenciar"

Webview própria (`Hermes: Gerenciar` / engrenagem), abas verticais no estilo Settings.
**Regra dura: o painel não guarda estado próprio.** Ele lê e escreve a configuração real
(`~/.hermes/config.yaml`, `~/.hermes/skills`, `settings.json` da extensão) ou chama a CLI.

```
┌ Gerenciar ──────────────────────────────────────────────────────────────┐
│ Modelos          │  MODELOS                                             │
│ Skills           │  Buscar… [x] favoritos               12 de 222      │
│ Ferramentas/MCP  │  ▸ Nous Portal (61)                                  │
│ Instruções       │     ● anthropic/claude-fable-5.1        (ativa)      │
│ Contexto e uso   │       openai/gpt-6-astra                             │
│ Agentes/Perfis   │  ▸ CommandCode (87)                                  │
│ Aprovações       │  ▸ OpenCode Go (44)                                  │
│ Avançado         │  ─────────────────────────────────────────────────  │
│                  │  Janela de contexto: 200 000 (reportada pelo agente) │
│                  │  [Trocar provider / login (CLI)]                     │
└────────────────────────────────────────────────────────────────────────┘
```

| Aba | Conteúdo | Fonte real |
|---|---|---|
| **Modelos** | Lista por provider, busca, favoritos ⭐, usado recentemente, modelo ativo com check. Janela de contexto **só do modelo ativo** (via `usage_update`), rotulada. Rodapé: "Trocar provider/login" → `hermes model` / `hermes acp --setup` no terminal | `session/new.models`, `session/set_model`, `usage_update.size` |
| **Skills** | Busca, filtro por escopo (usuário / projeto / instaladas do hub), toggle ativar/desativar, tags, "Abrir SKILL.md", "Criar nova skill" (gera esqueleto do SKILL.md), "Instalar do Skills Hub" | `~/.hermes/skills/**/SKILL.md` + `./.hermes/skills` + `./.agents/skills`; `hermes skills list/install` |
| **Ferramentas e MCP** | Grupo Built-in/toolsets do Hermes, servidores MCP (estado, tools expostas, logs, Reiniciar, Editar config), contador "12 de 30 ativas", "Adicionar servidor MCP". Alteração exige **nova sessão** (o agente monta as tools na criação da sessão) | `platform_toolsets.acp`, `agent.disabled_toolsets` em `config.yaml`; `mcp_servers`; `hermes mcp list/test`, `hermes tools list` |
| **Instruções** | AGENTS.md / .hermes.md / CLAUDE.md / SOUL.md detectados, com abrir, editar e tokens estimados | sistema de arquivos |
| **Contexto e uso** | O mesmo popover §5.2, em tamanho grande: grupos, tokens, %, remover item, fixar, Compactar | `usage_update` + estimativa local |
| **Agentes/Perfis** | Cada agente: comando, args, env, profile do Hermes, cwd, modelo padrão, toolsets. Botão "Testar conexão" (`hermes acp --check`) | `hermes.agents` (settings) + `hermes profile list` |
| **Aprovações** | Política por tipo de ação; lista de comandos "sempre permitidos" com link para o arquivo real | `approvals`/`command_allowlist` no `config.yaml`; `hermes approvals suggest/test` |
| **Avançado** | Log de tráfego (toggle), caminhos (`hermes config path`/`env-path`), versão do Hermes, diagnóstico (`hermes doctor`) | CLI + settings |

Skills ativas também aparecem como chips discretos no contexto e são invocáveis por `/nome` no
composer (o adaptador repassa texto desconhecido para o LLM; skills só existem se carregadas).

---

## 7. Sessões

TreeView **"Hermes Sessions"** (Activity Bar, com badge de atenção) + QuickPick do histórico.

```
▾ hermes-for-vs-code                        ● 2 rodando · 1 aguardando
   ● Refatorar QueueManager          ⟳ aguardando aprovação   2 min
   ⟳ Corrigir parser de updates      ⣾ 3/4 do plano          8 min
   ○ Ajustar medidor de contexto     ocioso                   1 h
   ⚠ Escrever testes do Tokens       erro                     3 h
```
- Ícone de estado: rodando / aguardando aprovação / ocioso / erro / concluído.
- Título automático (`session_info_update`) e **editável** (renomear → `hermes sessions rename`).
- Linha mostra modelo, tempo e contador de pendências.
- Sessões em background: mini-progresso e notificação ao concluir/falhar/precisar de aprovação
  (espelha `chat.notifyWindowOnResponseReceived` / `notifyWindowOnConfirmation`, com
  `off` | `windowNotFocused` | `always` via `hermes.notifications`).
- Ações: abrir · renomear · duplicar/fork (`session/fork`) · arquivar (`hermes sessions archive`) ·
  excluir (`hermes sessions delete`) · copiar ID. Arquivar/excluir passam por terminal, porque o ACP
  não tem `session/delete`.

Barra de status (item nativo, à direita):
`$(sparkle) Hermes · deepseek-v4.1-flash · ocioso` — clique abre o QuickPick de sessões.
Badge na Activity Bar = sessões que precisam de atenção (aprovação pendente ou erro).

---

## 8. Estados degradados (o que a UI faz quando o agente não oferece algo)

| Situação | UI |
|---|---|
| `loadSession: false` | esconde retomar; histórico é só visual e diz isso |
| `sessionCapabilities.list` ausente | lista de sessões = cache local, com selo "histórico local" |
| `fork` ausente | esconde "duplicar" |
| `promptCapabilities.image: false` | esconde colar imagem e o chip de imagem |
| sem `usage_update` | medidor em `—`, tooltip "o agente ainda não reportou a janela" |
| sem `availableModels` | picker de modelo mostra só o modelo atual, como texto |
| sem `availableModes` | picker de modo oculto |
| `#`/`/` sem candidatos | popover não abre; nada de lista vazia |
| Workspace não confiável | view em modo leitura, com faixa explicando |
| Windows sem WSL2 | view substituída por instruções + botão "Configurar comando (wsl hermes acp)" |
| Sessão ociosa + `/compress` | botão habilitado; em turno, desabilitado com tooltip |
| `notice`/`compaction_update` nunca chegam | não prometemos esses blocos em lugar nenhum |

---

## 9. Temas, acessibilidade, i18n

**Temas** — teste obrigatório em Dark+, Light+, High Contrast e um tema de terceiros:
fundo `--vscode-sideBar-background`, texto `--vscode-foreground`, borda `--vscode-panel-border`,
foco `--vscode-focusBorder`, botão `--vscode-button-*`, input `--vscode-input-*`,
dropdown `--vscode-dropdown-*`, lista `--vscode-list-*` (hover/active/selected),
badge `--vscode-badge-*`, link `--vscode-textLink-foreground`, popover `--vscode-widget-shadow` /
`--vscode-editorWidget-*`, diff `--vscode-diffEditor-*`, terminal `--vscode-terminal-*`,
medidor `--vscode-charts-green|yellow|red`.

**Acessibilidade**: navegação 100% por teclado, ordem de Tab = ordem visual, foco visível sempre,
`role`/`aria-*` em transcript, listas, chips, popovers e medidor (o medidor expõe
`aria-valuenow/valuemin/valuemax`), `prefers-reduced-motion` desliga animações, toda imagem/ícone
com `aria-label` textual, contraste só derivado de tokens de tema.

**Responsividade**: Secondary Side Bar estreita (≥ 260 px), editor (≥ 400 px) e painel flutuante.
Sem scroll horizontal em nenhuma largura — o composer quebra linha e os chips rolam.

**i18n**: todas as strings em `package.nls.json` (en) e `package.nls.pt-br.json`; nenhuma string
literal no bundle além de `aria` montado por template traduzido.

---

## 10. Lacunas de UX (registro honesto)

1. **`@` vs `#`**: o sintagma nativo atual do VS Code é `#`. Mantemos `@` como alias por causa do
   pedido original, mas o caminho ensinado na UI é `#`.
2. **Não existem modos Ask/Plan/Agent no Hermes.** O picker mostra os modos reais do agente
   (hoje: `default` / `accept_edits` / `dont_ask`, que são política de aprovação de edição). Não
   criamos um "Plan" falso; "Implementar plano" aparece quando existe plano do agente.
3. **Esforço/raciocínio** só aparece se o agente anunciar uma opção de configuração booleana. Hoje
   não anuncia: o controle fica oculto e o caminho é `hermes --reasoning` / `agent.reasoning_effort`
   no painel Gerenciar.
4. **Painel de ferramentas**: alterar toolsets exige **nova sessão** — o agente resolve tools na
   criação. A UI diz isso e oferece "Reiniciar sessão com estas ferramentas".
5. **Detalhamento por categoria** é estimativa local, sempre rotulada; a soma é normalizada pelo
   `used` do agente e a sobra vai para "não atribuído".
6. **Custo** não existe no protocolo: nenhum número é exibido.
7. **Reordenar a fila** é 100% client-side; a fila interna do servidor não é inspecionável.
8. **Checkpoint por turno**: o VS Code não expõe API pública de checkpoint de chat, e a sessão ACP do
   Hermes não tira checkpoints (ver §3.13 do ARCHITECTURE). Decidido: usar o store do Hermes
   (`hermes chat --checkpoints` + `/rollback`) e, no ACP, mostrar o botão só quando houver store real
   para o cwd — com o caminho de restauração abrindo a CLI. O "Desfazer" por arquivo (diff inverso)
   funciona sempre.
9. **Chat inline (`Ctrl+I`)**: só se a API permitir sem hacks; caso contrário, "Perguntar sobre a
   seleção" abre a view com chip de seleção e foco no composer.
10. **Notificações** do VS Code são usadas no lugar de toast próprio, para não ter dois sistemas.
