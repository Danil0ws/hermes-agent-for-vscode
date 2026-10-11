# Hermes Agent for VS Code — Arquitetura

Status: **Fase 0 concluída (pesquisa + desenho)**. Nada de código de extensão foi escrito ainda.
Alvo: VS Code ≥ 1.100 (máquina de referência: **1.141.0**), Node ≥ 18 (máquina: v26.8.1).
Hermes de referência: **v0.21.6+556.g6a2662a**, install via git, Python 3.14.7.

---

## 1. Escopo

Entregar uma extensão que é uma **interface nativa** para o Hermes Agent CLI instalado na máquina.
Não reimplementa o agente: fala **ACP (JSON-RPC 2.0 sobre stdio)** com `hermes acp`, que usa o mesmo
`AIAgent`, a mesma `~/.hermes`, os mesmos providers, skills, MCP, memória e toolsets da CLI.

Invariante de produto: **nada que a CLI faz pode ficar inacessível.** O que o ACP não expõe vira
terminal integrado (CLI/TUI) ou leitura/escrita da configuração real.

Não-objetivos: substituir o agente, reimplementar skill/approval/toolset fora do Hermes, manter
estado paralelo à config real do Hermes.

---

## 2. Evidências da Fase 0 (verificado nesta máquina)

Tudo abaixo foi obtido por execução real, não por documentação ou memória. Comandos entre parênteses.

### 2.1 CLI instalada

```
$ hermes --version
Hermes Agent v0.21.6+556.g6a2662a (2026.9.24) · stable · local 6a2662a4aaad
Install directory: /Users/danilo/.hermes/hermes-agent     Install method: git     Python: 3.14.7

$ hermes acp --check     → Hermes ACP check OK
$ hermes acp --version   → 0.21.6+556.g6a2662a
$ hermes acp --help      → --accept-hooks | --version | --check | --setup | --setup-browser | --yes
```

`hermes acp` loga em **stderr**; **stdout é exclusivamente transporte JSON-RPC**.
Também existem os launchers `hermes-acp` e `python -m acp_adapter`.

### 2.2 Handshake real (probe próprio, `initialize` + `session/new`, sem prompts)

`initialize` (client enviando `protocolVersion: 1`, fs read/write, terminal, auth.terminal):

```json
{"result":{
  "protocolVersion": 1,
  "agentInfo": {"name":"hermes-agent","version":"0.21.6"},
  "agentCapabilities": {
    "loadSession": true,
    "promptCapabilities": {"image": true},
    "sessionCapabilities": {"fork":{},"list":{},"resume":{}}
  },
  "authMethods": [
    {"id":"opencode-go","name":"opencode-go runtime credentials",
     "description":"Authenticate Hermes using the currently configured opencode-go runtime credentials."},
    {"id":"hermes-setup","type":"terminal","name":"Configure Hermes provider","args":["--setup"],
     "description":"Open Hermes' interactive model/provider setup in a terminal. ..."}
  ]}}
```

`session/new` respondeu com **três** chaves: `sessionId`, `models`, `modes`.

```json
{"result":{
  "sessionId":"8ae1aeb8-44f2-4a86-8969-ff107575113d",
  "models":{"currentModelId":"opencode-go:deepseek-v4.1-flash",
            "availableModels":[{"modelId":"nous:anthropic/claude-fable-5.1",
                                "name":"Nous Portal · anthropic/claude-fable-5.1",
                                "description":"Provider: Nous Portal"}, ... 222 linhas]},
  "modes":{"currentModeId":"default","availableModes":[
    {"id":"default","name":"Default","description":"Ask before edits."},
    {"id":"accept_edits","name":"Accept Edits","description":"Auto-allow workspace and temp-dir edits; still asks for sensitive paths."},
    {"id":"dont_ask","name":"Don't Ask","description":"Auto-allow file edits for this session except sensitive paths."}]}}}
```

Distribuição real das 222 linhas de modelo: CommandCode 87 · Nous Portal 61 · OpenCode Go 44 ·
GitHub Copilot ACP 17 · CommandCode (Anthropic) 11 · Mixture of Agents 1 · OpenCode Go(current) 1.
Formato do id: `provider:model`, ou `custom:<nome>:<modelo>` para endpoints nomeados em `config.yaml`.
Cap interno por provider: `ACP_MAX_MODELS_PER_PROVIDER = 200`.

### 2.3 O que o adaptador realmente emite (leitura de `~/.hermes/hermes-agent/acp_adapter/`)

`session/update` variantes **emitidas**: `user_message_chunk`, `agent_message_chunk`,
`agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, `available_commands_update`,
`usage_update`, `session_info_update`.

**Não emitidas**: `notice`, `compaction_update`, `compaction_summary_chunk`. O pós-compactação é
sinalizado só como `_meta.hermes.containsCompactionSummary` no `agent_message_chunk`.

Slash commands anunciados por `available_commands_update` (9):
`/help` `/model` `/tools` `/context` `/reset` `/compress` `/steer` `/queue` `/version`.
Bloqueados durante turno ativo: `reset`, `compress`, `model` (devolvem "⏳ Session is busy…").

Métodos implementados em `acp_adapter/server.py`: `initialize`, `authenticate`, `new_session`,
`load_session`, `resume_session`, `cancel`, `fork_session`, `list_sessions`, `prompt`,
`set_session_model`, `set_session_mode`, `set_config_option`. **Não existe** `session/delete`.

`usage_update` = `{size, used}` onde `size` = `agent.context_compressor.context_length` e `used` =
estimativa (`estimate_request_tokens_rough(history + system prompt + tool schemas)`). **Sem custo.**
Já a resposta de `session/prompt` traz `usage` com `input/output/total/thought/cached_read tokens`.

Fila **existe no servidor** (`_claim_turn_or_queue`): prompt com turno ativo → tenta
`agent.redirect()` (steer) quando o runtime suporta; senão enfileira em `queued_prompts` e devolve
como mensagem de agente `"Queued for the next turn. (N queued)"` com `stop_reason: end_turn`.
`_drain_queued_prompts` executa depois. **Não há API para listar/remover/reordenar a fila.**

`session/cancel` → `cancel_event` + `request_hard_interrupt` + `interrupt_for_session` →
`stop_reason: "cancelled"`. `session/list` é paginado por cursor (`next_cursor` = último
`session_id` da página) e devolve `SessionInfo{sessionId, cwd, title, updatedAt}`.
`session/load` **replaya** o histórico como `session/update`; `session/resume` **não** replaya;
`session/fork` copia o histórico em profundidade.

Aprovações: `session/request_permission` com `allow_once` | `allow_session` | `allow_always` | `deny`.
Edições também passam por aprovação (`acp_adapter/edit_approval.py`), com política derivada do **modo**:
`default→ask`, `accept_edits→workspace_session`, `dont_ask→session`. Timeout = `approvals.timeout`
(padrão 300 s) e **timeout nega**.

Toolsets: `platform_toolsets.acp` (padrão `hermes-acp`) + `agent.disabled_toolsets`; o client pode
pedir MCP por sessão em `session/new.mcpServers` e, para não pagar o startup global,
exportar `HERMES_ACP_SKIP_CONFIGURED_MCP=1` no subprocesso.

### 2.4 Protocolo e SDK

- Spec lida: `agentclientprotocol.com` (overview, initialization, session-setup, prompt-turn, schema).
  `protocolVersion` é um inteiro de major; o Hermes fala **1**.
- Conjunto completo de variantes em `session/update` na v1: user/agent/thought chunks, tool_call,
  tool_call_update, plan, available_commands_update, current_mode_update, config_option_update,
  session_info_update, usage_update, notice, compaction_update, compaction_summary_chunk.
- SDK TypeScript oficial: **`@agentclientprotocol/sdk`** (ex-`@zed-industries/agent-client-protocol`),
  `PROTOCOL_VERSION = 1` — verificado em **0.21.1** e **1.8.0**, os dois compatíveis com o Hermes.
  **Descoberto no M1 (e corrigido):** nenhum dos dois tipa o que o Hermes realmente implementa —
  não há `models` na resposta de `session/new`, nem `setSessionModel`, nem `forkSession` (em 1.8.0
  o estado de modelo saiu do schema; em 0.21.1 nunca existiu). Decisão: manter o SDK para o
  transporte e o subconjunto tipado (`initialize`, `newSession`, `prompt`, `cancel`,
  `setSessionMode`, `sessionUpdate`, `requestPermission`, `fs/*`), **pinado em `^1.8.0`**, e falar
  `session/set_model` e `session/fork` por **`extMethod`** com tipos locais
  (`SessionResponseLite`) — ver `src/core/HermesSession.ts`. Foi o que evitou inventar um
  subconjunto do protocolo.
- SDK Python do agente: `agent-client-protocol==0.9.0` (extra `acp` do pyproject).

### 2.5 UX de referência — VS Code 1.141 (documentação atual, não memória)

O Copilot Chat foi absorvido pelo core: hoje os controles do composer são
**Session Target · Agent · Language model · Permissions** (+ Code isolation, na janela de Agents).
O agente **Agent** oferece os papéis Ask / Agent / Plan; o modelo tem opção **Auto**.

Mecânicas confirmadas (todas a espelhar):
- Botão **Send** vira dropdown durante um turno: **Add to Queue** · **Steer with Message** ·
  **Stop and Send**; padrão configurável em `chat.requestQueuing.defaultAction` (`steer` | `queue`).
- Mensagens pendentes podem ser **reordenadas por arrastar** (handle no hover).
- Contexto por **`#`-menção** (`#file`, `#folder`, `#symbol`, `#codebase`, `#terminalSelection`,
  ferramentas) — não `@`; imagens/visão; contexto implícito = arquivo ativo + seleção.
- `/` para comandos, incluindo **skills**; `/compact [instruções]`; `/agents`; `/btw`; `/delegate`.
- **Controle de janela de contexto dentro do composer**: hover mostra contagem de tokens,
  detalhamento por categoria e créditos consumidos; clicar → **Compact Conversation**.
- Lista de sessões agrupada por período (Today / Last Week), pin/archive/rename/delete, filtro por
  estado, badge de atenção no ícone do app (`sessions.showApplicationBadge`).
- Notificações: `chat.notifyWindowOnResponseReceived` / `chat.notifyWindowOnConfirmation`
  (`off` | `windowNotFocused` | `always`).
- Revisão de edições com checkpoints, **Accessible Diff Viewer**; export da sessão em JSON;
  Copy / Copy All / Copy Final Response em Markdown.
- Handoff ≠ Fork ≠ Switch surface.

### 2.6 Cliente de referência (código)

`formulahendry/vscode-acp` (o "ACP Client", que já traz `hermes acp` pré-configurado) —
árvore exatamente na forma que este projeto adota:
`src/{config,core,handlers,ui,utils}` com `core/{AcpClientImpl,AgentManager,ConnectionManager,SessionManager,SessionHistoryStore}`,
`handlers/{FileSystem,Permission,SessionUpdate,Terminal}Handler`,
`ui/{ChatWebviewProvider,SessionTreeProvider,StatusBarManager}`, `utils/{Logger,StreamAdapter}`.
Deps: `@agentclientprotocol/sdk`, `marked`; build por **webpack**; sem framework de webview
(`ChatWebviewProvider.ts` tem 2 559 linhas de DOM/SDK puro). Settings: `acp.agents`,
`acp.autoApprovePermissions`, `acp.defaultWorkingDirectory`, `acp.logTraffic`.
`cashew-labs/opencode-gui` — referência de separação Extension Host ↔ webview por `postMessage`,
build por **Vite**, CSS por variáveis de tema do VS Code.

**O que aproveitamos de `vscode-acp`:** a decomposição de módulos, o log de tráfego, o contrato
`session/list` com fallback de cache local, o bloco de thinking colapsável.
**O que não aproveitamos:** o composer (não tem chips, medidor de contexto, fila com reordenar,
envio dividido, painel de gerenciamento), o build webpack com DOM imperativo, e a ausência de
camada de contexto/tokens.

---

## 3. Decisões de arquitetura

1. **Transporte**: spawn de `hermes acp` (JSON-RPC sobre stdio), via `@agentclientprotocol/sdk`.
   Um **processo por agente ativo**, N sessões por processo.
2. **`HERMES_ACP_SKIP_CONFIGURED_MCP=1`** por padrão no subprocesso. O startup global de MCP
   atrasa `initialize`; se o usuário quiser os MCP globais, o flag é desligado na config do agente.
3. **Modos**: o picker de "Modo" lista os modos **reais** do agente (`availableModes`) — que no
   Hermes são política de aprovação de edição. Não inventamos Ask/Plan/Agent. O picker de
   **Permissões** e o de **Modo** são o mesmo controle, apresentado uma vez.
4. **Estados de aprovação**: `ask` | `allowSession` | `allowAll` na config da extensão apenas
   *pré-selecionam* a resposta do cliente; a autoridade continua sendo as opções que o agente manda
   em cada `session/request_permission`.
5. **Fila**: implementada no cliente (lista visível, reordenável, persistida) e **com respaldo**
   no servidor: se um prompt escapar durante um turno, o `_claim_turn_or_queue` enfileira e o
   aviso textual aparece no chat. Nunca dependemos só do servidor porque não há API de leitura da fila.
6. **Steer / Enviar agora**: "Steer" = enviar prompt **text-only** durante o turno (o adaptador
   chama `agent.redirect`); "Enviar agora (interromper)" = `session/cancel` seguido de novo prompt.
7. **Working set e reverter**: o Hermes edita arquivos **server-side** com as próprias tools; o
   cliente **não** intercepta a escrita. O working set é derivado dos blocos de **diff** dos
   `tool_call`/`tool_call_update` (+ `ToolCallLocation.path`). "Desfazer" = aplicar o diff inverso;
   "Manter" = no-op (já está no disco). O rodapé do cartão diz isso explicitamente.
8. **Contexto**: `promptCapabilities.image = true` → imagens via `ContentBlock::image`;
   `embeddedContext = false` → **não** mandar `ContentBlock::Resource`; arquivos entram como
   **texto** (com cabeçalho de caminho/faixa) no prompt. `ResourceLink` é baseline do protocolo mas
   o adaptador ignora blocos não-texto na extração — verificar no M3 e, se necessário, ficar só em texto.
9. **Medidor de contexto**: `usage_update` é a **única** fonte (tem `size` = janela do modelo ativo
   e `used` = estimativa). Sem `usage_update` ainda → medidor honesto em "—" com tooltip
   "tamanho da janela ainda não reportado". O detalhamento por categoria **não existe**: calculamos
   localmente por grupo (ver §5) e rotulamos "estimado".
10. **Custo**: não existe em ACP. Não exibimos número nenhum. O rodapé do popover mostra
    tokens `input/output/thought/cached` do último turno (esses vêm de `PromptResponse.usage`).
11. **Escape hatches**: terminal integrado para `hermes` (TUI), `hermes acp --setup` (fluxo de auth
    anunciado, `type: terminal`), e um quick pick de comandos da CLI.
12. **Native-first**: tudo que o VS Code tem nativo, usamos nativo — `view/title` (menus), QuickPick,
    InputBox, TreeView, StatusBar, diff editor, terminal, OutputChannel. Nada disso é reconstruído
    na webview.
13. **Checkpoints (decisão do usuário, 11/out)**: usar o mecanismo **do próprio Hermes**
    (`~/.hermes/checkpoints/`, shadow git repo, `checkpoints.enabled` em `config.yaml`, restore por
    `/rollback`) em vez de inventar um snapshot paralelo.
    **Bloqueio verificado**: `acp_adapter/` não tem **nenhuma** referência a checkpoints — a sessão
    ACP nunca liga checkpoints, mesmo com `checkpoints.enabled: true`; e `hermes checkpoints` só faz
    `status|list|prune|clear|clear-legacy` (não restaura). Restaurar é `/rollback` **dentro de uma
    sessão CLI**.
    Caminho: (a) contribuição upstream pequena no adaptador — passar `checkpoints_enabled` de
    `config.yaml` ao construir o `AIAgent` em `acp_adapter/session.py` e anunciar `/rollback` nos
    `_COMMANDS` do `commands.py`; (b) até isso existir, o botão de checkpoint só aparece quando
    `hermes checkpoints status` mostra store para o cwd e a sessão foi criada com checkpoints; caso
    contrário, degrada para "Desfazer por arquivo (diff inverso)" + "Abrir CLI com --checkpoints
    para restaurar". Nunca fingimos um checkpoint que o Hermes não tirou.
14. **Webview**: **Preact + `@preact/signals`** (decisão do usuário), bundle único via Vite,
    lista virtualizada própria, CSP com nonce.
15. **Chat inline**: fora do M1. "Perguntar sobre a seleção" abre a view com chip de seleção e foco
    no composer; `Ctrl+I` só depois do M5, se a API permitir sem hacks.

---

## 4. Estrutura do repositório

```
hermes-for-vs-code/
├─ package.json            engines.vscode ^1.100, activationEvents [] (lazy), contributes.*
├─ package.nls.json / package.nls.pt-br.json
├─ src/
│  ├─ extension.ts                     activate/deactivate, registros de comando
│  ├─ core/
│  │  ├─ AcpClient.ts                  wrapper fino do SDK: initialize/handshake, backpressure, log
│  │  ├─ ConnectionManager.ts          spawn/restart com backoff, detecção de processo morto, kill no dispose
│  │  ├─ AgentManager.ts               agentes (comando, args, env, profile, cwd, modelo padrão)
│  │  ├─ SessionManager.ts             sessões ACP: novo/load/resume/fork/list, estado, títulos
│  │  ├─ QueueManager.ts               fila client-side persistida, reordenação, drain
│  │  ├─ ContextManager.ts             chips, contagem de tokens, limites, anexos
│  │  ├─ ModelCatalog.ts               session/new.models + cache + invalidação
│  │  ├─ SkillCatalog.ts               ~/.hermes/skills (+ skills de projeto) — fora do ACP
│  │  ├─ ToolCatalog.ts                config.yaml (platform_toolsets.acp, disabled_toolsets) + hermes tools
│  │  ├─ WorkingSet.ts                 arquivos alterados por diff de tool_call, +/-, keep/revert
│  │  └─ PlanTracker.ts                session/update plan -> tarefas
│  ├─ handlers/
│  │  ├─ FileSystemHandler.ts          fs/read_text_file, fs/write_text_file (confinado ao workspace)
│  │  ├─ TerminalHandler.ts            terminal/create|output|wait_for_exit|kill|release
│  │  ├─ PermissionHandler.ts          session/request_permission -> barra inline
│  │  └─ SessionUpdateHandler.ts       roteia as 9 variantes para o estado
│  ├─ ui/
│  │  ├─ ChatViewProvider.ts           hospeda webview/chat, ponte postMessage tipada
│  │  ├─ ManageViewProvider.ts         painel "Gerenciar" (abas verticais)
│  │  ├─ SessionTreeProvider.ts        TreeView "Hermes Sessions" + quick pick de histórico
│  │  ├─ StatusBar.ts                  agente · modelo · estado · badge de atenção
│  │  ├─ DiffProvider.ts               TextDocumentContentProvider para diffs de arquivo
│  │  ├─ ContextView.ts / PlanView.ts  views auxiliares
│  │  └─ Pickers.ts                    modo, modelo, ferramentas, contexto, comandos da CLI
│  ├─ cli/CliRunner.ts                 abre terminal integrado, roda comando/CLI completa
│  ├─ config/Settings.ts               hermes.* tipado, watch, defaults
│  └─ utils/{Logger,TrafficLog,Tokens,Dedup,Version}.ts
└─ webview/
   ├─ chat/     (composer, transcript, fila, chips, medidor, popovers)
   └─ manage/   (abas: Modelos, Skills, Ferramentas/MCP, Instruções, Contexto e uso, Agentes, Aprovações, Avançado)
```

Build: `vite` para as duas webviews (bundle único, CSP com nonce, zero script remoto) + `tsc` para
o extension host. Testes: `mocha` unitário (fakes ACP sobre stdio) + `@vscode/test-electron`.

---

## 5. Fluxo de um turno

```
[composer] Enter
  └─ ContextManager monta ContentBlock[]  (texto + imagens; arquivos = texto com cabeçalho)
  └─ QueueManager: idle? envia : enfileira
      └─ client.session.prompt(sessionId, prompt)
          ├─ session/update agent_thought_chunk ....... bloco "Raciocínio" (streaming + tempo)
          ├─ session/update plan ..................... cartão de plano / PlanView
          ├─ session/update tool_call ................ item de tool (kind -> ícone, title, status)
          │    └─ content = diff blocks ............. WorkingSet + diff editor nativo
          ├─ client.request_permission ◄───────────── barra inline (once/session/always/deny)
          ├─ session/update tool_call_update ........ status/completed/failed + saída
          ├─ session/update agent_message_chunk ..... Markdown incremental (agrupado por messageId)
          └─ session/update usage_update ............ medidor de contexto
      └─ resposta: PromptResponse{stop_reason, usage}
          └─ turno encerra -> QueueManager drain -> próximo item
```

Notas de implementação:
- Agrupamento visual por `messageId` (chunks com o mesmo id = uma mensagem); id novo = bolha nova.
- `Esc`/Parar → `session/cancel`; marca tool calls abertas como canceladas e responde
  `cancelled`. O cliente **deve** responder qualquer `request_permission` pendente com `cancelled`.
- Backpressure: coalescing por frame (≤ 60 fps) e append incremental no transcript virtualizado.

---

## 6. Mapa capability → UI (o contrato honesto)

| Elemento de UI | Fonte real | Estado |
|---|---|---|
| Chat com streaming | `session/update` `agent_message_chunk` (+`messageId`) | ✅ |
| Copiar / inserir no editor / reexecutar | agregado local | ✅ |
| Bloco de raciocínio | `agent_thought_chunk` | ✅ |
| Tool call item (título, status, entrada/saída, duração) | `tool_call` / `tool_call_update` (kind, title, status, content, locations) | ✅ |
| Diff no editor nativo | `content` = diff blocks em `patch`/`write_file`/`skill_manage` + `ToolCallLocation.path` | ✅ |
| Aprovação inline | `session/request_permission` (`allow_once`/`allow_session`/`allow_always`/`deny`) | ✅ |
| Plano | `session/update` `plan` (entradas `content`/`priority`/`status`) | ✅ |
| Slash commands + autocomplete | `available_commands_update` (9 comandos) | ✅ |
| Seletor de MODO | `modes.availableModes` + `session/set_mode` + `current_mode_update` | ✅ (3 modos: política de edição) |
| Seletor de MODELO | `models.availableModels` + `session/set_model` | ✅ (id/nome/provider; sem janela, capacidade ou custo) |
| Medidor de contexto (usado/total) | `usage_update {size, used}` | ✅ |
| Detalhamento por categoria | ❌ protocolo → estimativa local por grupo | ⚠️ rotulado "estimado" |
| Custo da sessão | ❌ (`usage_update` não tem `cost`) | ❌ oculto |
| Tokens do turno | `PromptResponse.usage` (input/output/total/thought/cached) | ✅ |
| Histórico/Sessões | `session/list` (paginado) + `session/load` (replay) + `session/resume` | ✅ |
| Fork / duplicar | `session/fork` | ✅ |
| Renomear sessão | `session_info_update` só **informa**; renomear = `hermes sessions rename` | ⚠️ via CLI |
| Arquivar / excluir sessão | ❌ ACP → `hermes sessions delete` / `archive` | ⚠️ via CLI |
| Fila de prompts | cliente-side + respaldo `_claim_turn_or_queue` / `/queue` | ✅ (sem leitura da fila do servidor) |
| Steer (mensagem durante o turno) | `agent.redirect` disparado pelo adaptador quando o prompt é text-only | ✅ |
| Enviar agora (interromper) | `session/cancel` + novo prompt | ✅ |
| Anexar imagem | `promptCapabilities.image` | ✅ |
| Anexar arquivo/pasta | `embeddedContext: false` → arquivo como **texto** | ⚠️ degradado p/ texto |
| Compactar contexto | `/compress` (bloqueado durante turno) | ✅ |
| Sinal de compactação | `_meta.hermes.containsCompactionSummary` | ✅ parcial |
| Notices do agente | não emitidos pelo Hermes | ❌ |
| Skills (listar/ativar/invocar) | ❌ ACP → `~/.hermes/skills*`, `hermes skills`; invocar por `/nome` no texto | ⚠️ fora do ACP |
| Ferramentas / MCP | ❌ ACP (`configOptions` vazio) → `config.yaml`, `hermes tools`, `hermes mcp` | ⚠️ fora do ACP |
| Esforço / raciocínio | ❌ ACP → `agent.reasoning_effort`, `hermes --reasoning` | ⚠️ exige restart/CLI |
| Modelos: janela/capacidades/custo | ❌ ACP → só o `size` do modelo **ativo**, via `usage_update` | ⚠️ parcial |
| Login / provider | `authMethods` (terminal `hermes acp --setup`) + provider atual | ✅ parcial |
| Diagnóstico | `hermes doctor`, `hermes acp --check` (terminal) | ✅ |
| Log de tráfego JSON-RPC | interceptação no `AcpClient` | ✅ |

---

## 7. Estimativa local de tokens (o que é nosso e o que é do Hermes)

- **Total da janela e usado**: do `usage_update`. Nunca inventados.
- **Antes do primeiro `usage_update`**: medidor em "—".
- **Detalhamento por categoria**: cálculo local, sempre com o selo "estimado":
  - *Instruções*: conteúdo dos arquivos detectados (AGENTS.md/.hermes.md/CLAUDE.md/SOUL.md) ÷ 4.
  - *Skills*: cabeçalho das skills carregadas ÷ 4.
  - *Ferramentas/MCP*: JSON dos schemas habilitados ÷ 4.
  - *Arquivos/anexos*: bytes dos chips ÷ 4.
  - *Histórico*: soma do transcript visível ÷ 4.
  - *Raciocínio*: `thought_tokens` do último turno (esse é real, vem do `usage`).
  - A soma é normalizada para o `used` reportado pelo agente, e a diferença vira "não atribuído".
  - `Tokens.ts` guarda `chars/4` como heurística única e documentada em um lugar só.

---

## 8. Robustez, segurança, Remote

- **Ativação lazy**: `onView:*`, `onCommand:*`, `onLanguageModelTool` ausente. Nenhum `hermes` roda
  até o usuário abrir uma sessão.
- **Ciclo de vida**: `deactivate()` mata o processo (`SIGTERM` → `SIGKILL` em 3 s) e remove o
  handler de `dispose`. Reinício automático com backoff exponencial (1s→30s, teto) e motivo exposto
  na UI. Detecção de processo morto por `exit` do child, não por timeout de request.
- **Workspace Trust**: em modo restrito, apenas leitura — sem spawn do agente, sem terminal handler,
  sem escrita. Chip visível explicando o porquê.
- **fs/\***: confinado ao workspace por padrão (path normalizado + `startsWith` do root); escrita
  fora do workspace exige confirmação explícita. `additionalDirectories` não usados na v1.
- **Terminal handler**: cria `Terminal` do VS Code com cwd = workspace; env do processo do child,
  nunca `process.env` inteiro; nenhuma variável sensível entra no log de tráfego.
- **Log**: `TrafficLog` redige valores de chave/segredo por heurística de nome
  (`*_API_KEY`, `*_TOKEN`, `Authorization`, `password`) antes de escrever no OutputChannel.
- **Remote (SSH/WSL/Dev Containers/Codespaces)**: o processo nasce no **extension host do workspace**
  (lado remoto), com `cwd` no workspace remoto. Windows sem WSL2: agente desabilitado com explicação
  e comando configurável aceitando prefixo `wsl hermes acp` + conversão de caminho (`/mnt/c/...`).
- **Persistência**: `globalStorage` (fila, histórico visual, cache de catálogos) e `workspaceState`
  (agente ativo, sessão atual). **Nada** de estado paralelo em `settings.json`.

---

## 9. Testes

- Unitários (fakes ACP sobre stdio, sem rede): `QueueManager` (ordem, drain, persistência),
  `ContextManager` (tokens, limiares, remoção de chip), parser de `session/update` (9 variantes +
  ids desconhecidos ignorados), `SessionManager` (load vs resume vs fork), `Tokens` (chars/4 e limiares
  70/80/90), `WorkingSet` (diff → +/−, revert inverso).
- Integração: `@vscode/test-electron` — comandos registrados, painel Gerenciar abrindo, tema trocando.
- Roteiro manual com `hermes` real: streaming, cancelar, aprovação (as 4 opções), diff, plano,
  3 sessões paralelas, fila sobrevivendo a reload, nenhum processo órfão.
- Visual: 4 temas (Dark+, Light+, High Contrast, um de terceiros) com capturas no README.

---

## 10. Marcos

| Marco | Entrega verificável (F5 no Extension Development Host) | Estado |
|---|---|---|
| M1 | Conexão ACP + chat com streaming + cancelar + composer básico | ✅ feito |
| M2 | Raciocínio, tool calls, diff nativo, aprovações | ✅ feito |
| M3 | Pickers de modo/modelo + medidor de contexto + chips de contexto | ✅ feito |
| M4 | Sessões (tree, histórico, retomar, fork, background, notificações) | ✅ feito |
| M5 | Fila + envio dividido (enviar / enfileirar / steer / enviar agora) | ✅ feito |
| M6 | Painel Gerenciar (Modelos, Skills, Ferramentas/MCP, Instruções, Contexto e uso) | ✅ feito |
| M7 | Plano, working set com Manter/Desfazer, checkpoints | ✅ feito (checkpoint degrada: §11.7b) |
| M8 | Escape hatches da CLI, diagnóstico, integração com o editor | ✅ feito |
| M9 | Temas, acessibilidade, Remote, polimento, `.vsix` | ⚠️ parcial: `.vsix` empacota (176 KB); falta a passada visual de temas e a de acessibilidade com o VS Code de verdade |

Gates no estado atual: `tsc --noEmit` limpo · `npm run build` OK · `npm test` **44/44** ·
`vsce package` → `hermes-agent-vscode-0.1.0.vsix` (15 arquivos, 176 KB).

M9 é a única parte que **não** pode ser fechada por execução de linha de comando: exige abrir o
Extension Development Host, alternar Dark+ → Light+ → High Contrast → um tema de terceiros, e
passar por teclado/leitor de tela em cada superfície. Registrado como pendência, não como feito.

---

## 11. Lacunas conhecidas (não escondidas)

1. **Não existem os modos Ask/Plan/Agent no Hermes.** Os 3 modos do ACP são política de aprovação de
   edição (`default`, `accept_edits`, `dont_ask`). O picker de modo lista o que o agente anunciar;
   quando o agent listar outra coisa, a UI acompanha sem código novo.
2. **Fila**: o servidor sabe enfileirar, mas **não** expõe listar/remover/reordenar. A fila visível é
   nossa; se o usuário digitar por fora (outro client no mesmo processo), as duas filas coexistem.
3. **Sessões**: `session/list` devolve o que está no `state.db` (sobrevive a restart), mas
   **não há `session/delete`** no ACP — excluir e arquivar vão para a CLI. Renomear também.
4. **Catálogos**: modelos vêm por sessão (222 linhas nesta máquina, cap de 200/provider); **skills,
   ferramentas, MCP, esforço, custo e capacidades de modelo não existem no ACP**. Cada um tem fonte
   real mapeada (`~/.hermes/skills*`, `config.yaml`, `hermes tools/mcp`, `agent.reasoning_effort`) ou
   fica oculto. Nada é inventado.
5. **Janela de contexto por modelo**: só é conhecida para o modelo **ativo**, depois do primeiro
   `usage_update`. O picker não pode mostrar "200K" antes disso.
6. **Detalhamento por categoria** é estimativa local, sempre rotulada.
7. **Edições não são interceptáveis**: o Hermes escreve no disco com as próprias tools. "Desfazer" é
   diff inverso, não bloqueio de escrita.
7b. **Checkpoints não existem na sessão ACP**: `acp_adapter/` ignorou `checkpoints.enabled` do
   `config.yaml` e não expõe `/rollback`; `hermes checkpoints` não restaura. Enquanto a contribuição
   upstream de §3.13 não existir, restauração de turno só é possível numa sessão CLI
   (`hermes chat --checkpoints`). O botão aparece apenas quando o store real tem dados para o cwd.
8. **`_meta` não documentado**: o adaptador usa `_meta.hermes.sessionProvenance` e
   `_meta.hermes.containsCompactionSummary`. São extensões internas, não contrato — a UI degrada se
   sumirem. Só lemos, nunca dependemos delas para correção.
9. **MCP por HTTP/SSE**: o Hermes não anuncia `mcpCapabilities.http/sse` → só servidores **stdio**
   são oferecidos pelo client até que isso mude.
10. **Anexos não-texto**: sem `embeddedContext`, arquivos viram texto. Imagens dependem de
    `promptCapabilities.image` (verdadeiro hoje).
11. **Recursos só da TUI** (`/skin`, status bar da TUI, widgets) não são duplicados: viram
    "Executar na CLI".
12. **SDK TS ↔ agente — resolvido no M1**: `PROTOCOL_VERSION = 1` em 0.21.1 e 1.8.0. O SDK não tipa
    `models`/`session/set_model`/`session/fork`, que o Hermes implementa → `extMethod` + tipos locais.
    Se uma versão futura do SDK tipar isso, o wrapper some.
13. **`session/list` precisa de conexão viva**: `listSessions` no cliente devolve `[]` sem sessão
    aberta (o `session/list` só existe dentro de uma conexão ACP ativa). A view de sessões mostra
    vazio com explicação nesse caso.
14. **Pendências por sessão não existem**: as notificações de `session/update` não trazem
    `sessionId` no nosso nível de roteamento, então o contador de pendências é atribuído à sessão
    ativa. Um `sessionId` por notificação resolveria.
15. **Codicons**: resolvido — as webviews usam `@vscode/codicons` (classe + fonte) e o extension host
    usa `ThemeIcon`. Pegadinha registrada: o Vite precisa de `base: './'`, senão o `@font-face` do
    `codicon.css` referencia `/codicon.ttf`, que na webview resolve para a raiz do `vscode-webview` e
    devolve 404 (ícones viram tofu).
16. **L10n**: resolvido em **4 idiomas** (en, pt-BR, ru, zh-CN). O manifesto usa
    `package.nls.*.json` (58 chaves por idioma, cobertura checada por script a cada geração); o
    runtime usa dicionários tipados — `webview/*/i18n.<locale>.ts`, onde o tipo `Strings` faz o
    `tsc` **garantir** paridade de chaves, e `src/l10n.<locale>.ts` (mapa texto pt-BR → tradução,
    alimentado por `setLanguage(vscode.env.language)` na ativação). Três ressalvas honestas:
    (a) a **qualidade** das traduções ru/zh-CN não foi revisada por falante nativo — a estrutura é
    verificada pelo compilador, o texto não;
    (b) strings de `src/` fora do script de conversão continuam só em pt-BR (o script cobriu 90
    chamadas de UI: `show*Message`, rótulos/descrições/placeholders de quick pick; literais dentro
    de template strings e nomes de OutputChannel ficaram de fora de propósito, porque interpolam
    valores e não são texto de UI);
    (c) `num()` formata pelo idioma corrente (pt-BR `1.218`, en/zh `1,218`, ru espaço estreito) — a
    formatação deixou de ser fixa em pt-BR, o que mudou um teste existente (asserção atualizada
    para o contrato novo, não silenciada).
17. **M9 pendente**: verificação visual em 4 temas, passada de teclado/leitor de tela e teste em
    Remote (SSH/WSL/Dev Containers) não foram executados — exigem o Extension Development Host.
18. **Por que não `vscode.l10n`**: o caminho nativo exige `l10n.t('literal')` em cada chamada **e**
    um `bundle.l10n.<locale>.json` empacotado; o que se ganha é participar do pipeline de tradução
    do marketplace. Como aqui o pt-BR é o idioma de **origem** e as chaves dos dicionários de host
    são o próprio texto pt-BR, `tr()` resolve o mesmo problema com um mapa texto→texto e sem etapa
    de extração — e a ausência de uma string no dicionário degrada para o pt-BR legível em vez de
    uma chave crua. Custo aceito: não dá para traduzir pela interface de localization providers do
    VS Code. Trocar depois é mecânico: `tr(x)` → `vscode.l10n.t(x)` e extrair os bundles.
19. **Checkpoint por turno**: já registrado em §3.13 — o adaptador ACP ignora `checkpoints.enabled`,
    então o botão de restaurar só aparece quando existe store real para o cwd. O caminho honesto é
    passar `checkpoints_enabled` em `acp_adapter/session.py` e anunciar `/rollback` em `commands.py`
    (duas edições pequenas upstream), não inventar um snapshot paralelo na extensão.
20. **Aprovações são o único lugar onde a UI é mais restritiva que o protocolo**: o agente manda as
    opções (até quatro: uma vez, sessão, sempre, negar) e a extensão **não** as altera — mas escolhe
    o peso visual: a primeira opção de permissão é a primária e as concessões mais amplas ficam
    secundárias, com o efeito de cada uma no `title` e um aviso fixo quando existe `allow_always`
    (que grava na allowlist permanente do Hermes). Tornar a concessão permanente o botão mais
    chamativo empurraria o usuário para ela sem ele perceber.

21. **Dono único de comando é invariante, não estilo**: `hermes.manage` chegou a ser registrado em
    `extension.ts` **e** na feature de Gerenciar. O segundo `registerCommand` lança; o bloco da
    feature (sem `try/catch`) abortava ali mesmo, então `hermes.manage.open`, `agents.test`,
    `mcp.add`, `skill.open`, `instructions.open`, `approvals.open` e o registro do painel nunca
    aconteciam — e o `try/catch` do loop de features engolia o erro. O sintoma visível era
    `command 'hermes.manage.open' not found` e nada no log. Duas proteções agora: a suíte
    `src/test/manifest.test.ts` (dono único, declarado↔registrado, `executeCommand` para id vivo,
    paridade das 4 localidades) e a checagem em runtime na ativação, que loga
    `comandos: N/M registrados` e avisa quando falta algum. Verificado em execução real:
    `39/39`.
22. **`cliPath` com prefixo de ambiente**: o PRIMEIRO token é o executável, o resto são argumentos do
    wrapper (`wsl hermes` → `spawn('wsl', ['hermes','acp'])`). A versão anterior pegava o último
    token como executável e gerava `hermes wsl acp`, que nunca sobe — ou seja, o caminho documentado
    para Windows estava quebrado desde o início e nenhum teste pegava, porque o teste do
    `splitCommand` **afirmava o contrato invertido**. Lição: teste que codifica o comportamento
    errado é pior que teste ausente; a asserção foi corrigida para o contrato certo e passou a
    verificar o argv final.
23. **Política de aprovação só existe se for aplicada**: `hermes.permissions` era lido pelo painel
    Gerenciar e exibido como se valesse, mas o handler era descartado (`void permissions;`) e nada
    respondia automaticamente. A aplicação agora acontece em `AgentManager.autoAnswer()` — no ponto
    em que o agente pede permissão — escolhendo **entre as opções que o agente enviou** (nunca uma
    opção de negar). `allowAll` responde com a primeira opção de permissão; `allowSession` repete a
    concessão (`kind`) já dada na sessão. Como a política mais permissiva é invisível por natureza,
    ela ganha indicador permanente na barra de status enquanto está ligada.
24. **Detecção do CLI não é opcional**: sem o Hermes instalado, o ACP não sobe e a única pista era
    "a conexão com o Hermes caiu". Agora a ativação roda `hermes --version` e `hermes acp --check` e,
    faltando o CLI, mostra um modal com o comando oficial de instalação (da doc, não inventado),
    a opção de gravar `hermes.cliPath` e o `hermes doctor`. Quando tudo está no lugar, o resultado
    vai só para o canal `Hermes` — nada de modal em cima de quem já está funcionando.
25. **i18n: limite conhecido das strings com interpolação**: o dicionário do host é
    `texto pt-BR → tradução`, o que não expressa `tr(\`... ${x} ...\`)`. Essas duas strings ficam em
    pt-BR em todos os idiomas. O caminho de correção é partir em chave + parâmetros (como as
    funções do bundle da webview já fazem), não manter o texto composto.
26. **Ícone: par light/dark é obrigatório, PNG é obrigatório para a loja**: o VS Code não recolore
    o ícone de view container (a cor vem do arquivo), então `viewsContainers.activitybar[].icon`
    declara o par light/dark. Para a loja, o `vsce` **recusa** `icon` em SVG por segurança — daí o
    `media/icon.png` 128×128 derivado da mesma arte. Ressalva medida: no tamanho real da Activity
    Bar (16–24px) os traços internos da arte caem para ~0,2px e ela lê como silhueta; a verificação
    foi feita renderizando os SVG em 16/24/32px nos dois fundos (o ambiente não tem permissão de
    acessibilidade para capturar a janela do editor). Contraste **medido**, não estimado: o azul
    original do par falhava no tema escuro (`#0066B8` = 2,16:1 sobre a Activity Bar `#333`, mínimo
    3:1), então a variante escura passou a `#3B9EFF` (4,52:1) e o PNG da loja usa `#1E88E5`, que
    passa nos dois fundos (3,68:1 claro, 3,43:1 escuro).
27. **Popover de webview se clampa ao PAINEL, nunca à viewport.** O menu do envio era
    `position:absolute; right:0; min-width:240px; max-width:min(420px,90vw)` e o containing block era
    o wrapper do próprio botão (`~30px`), então numa sidebar de 310px o menu media 240px e começava em
    **x=-149**: crescia para fora do painel e era cortado, deixando visível só o FIM de cada rótulo
    ("Send now (interrupt)" aparecia como "terrupt)"). O mesmo valia para o popover do medidor
    (`right:0; width:340px` ancorado num wrapper de 40px). Correção: os wrappers perderam
    `position:relative` (o containing block passou a ser o `.composer`, que é o painel) e as larguras
    viraram relativas (`min-width: min(240px,100%)`, `max-width: 100%`, `width: min(340px,100%)`).
    Medido no harness em 310/250/200px: menu em x=70/10/0 e popover do medidor em x=0 — nada mais
    sai do painel; abaixo de 240px o menu encolhe e os rótulos ellipsizam.
28. **`<select>` nativo trunca sem indicador.** Os seletores de modo/modelo mostravam "(no mode" e
    "(no agen", e o caso real é pior (ids como `opencode-go:deepseek-v4.1-flash`). Correção em duas
    partes: rótulos de estado vazio passaram a ser curtos (`sem modos`/`no models`, o motivo ficou no
    `title` do controle, que já existia) e `.sel` ganhou `max-width:46%` + `text-overflow:ellipsis` —
    o Chromium atual honra o ellipsis em `select`, então o truncamento passa a se anunciar
    ("Ask be…", "deeps…"). Na largura real de sidebar (310px) nada trunca.
29. **Harness visual: desligue o cache de rede antes de medir um CSS.** A primeira medição da
    correção acima devolveu exatamente os números antigos (x=-149) e quase me fez "consertar" um
    código que já estava certo: o navegador servia o `chat.css` em cache. `Network.setCacheDisabled`
    (ou um cache-bust na URL) antes de medir. O mesmo cuidado vale para o bundle JS.
