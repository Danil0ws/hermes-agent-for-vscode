# Hermes Agent for VS Code

Interface nativa do [Hermes Agent](https://hermes-agent.nousresearch.com/docs) (Nous Research) no
VS Code. Não reimplementa o agente: fala **ACP (JSON-RPC sobre stdio)** com `hermes acp`, então usa
a mesma config (`~/.hermes`), os mesmos providers, modelos, skills, MCP, memória e toolsets da CLI.
Nada que a CLI faz fica inacessível — o que o ACP não expõe vira terminal integrado.

Estado: **M1 concluído** (conexão ACP + chat com streaming + cancelar + composer básico).
Ver `docs/ARCHITECTURE.md` (marcos e lacunas reais) e `docs/UX.md` (wireframes).

## Requisitos

- Hermes Agent instalado e com provider configurado (`hermes model`). Windows só via WSL2.
- O extra ACP ativo: `hermes acp --check` deve responder `Hermes ACP check OK`.
- Node 18+ e VS Code 1.100+ (desenvolvido e testado em 1.141.0).

## Instalação

```bash
git clone <este-repo> ~/Dev/hermes-for-vs-code
cd ~/Dev/hermes-for-vs-code
export NODE_ENV=development   # devDeps são obrigatórias para buildar
npm install
npm run build                 # tsc --noEmit + esbuild (extension host) + vite (webviews)
```

Depois abra no VS Code e use **F5** (Extension Development Host), ou empacote:

```bash
npm run package               # gera hermes-agent-vscode-<versão>.vsix
code --install-extension hermes-agent-vscode-0.1.0.vsix
```

## Uso

1. Clique no ícone do Hermes na Activity Bar → view **Chat**.
2. Digite e envie (`Enter`; `Shift+Enter` quebra linha; `Esc` cancela o turno).
3. Menus nativos na barra de título da view: nova conversa, histórico, reiniciar sessão, abrir em
   editor, Gerenciar e o menu "…" com **Abrir CLI completa**, **Executar comando da CLI…**,
   diagnóstico, log e tráfego.

## Comandos

| Comando | O que faz |
|---|---|
| `Hermes: Nova conversa` | `session/new` no agente ativo |
| `Hermes: Abrir em editor` | a mesma view como aba |
| `Hermes: Abrir CLI completa` | `hermes` (TUI) no terminal integrado, na pasta do workspace |
| `Hermes: Executar comando da CLI…` | quick pick: `model`, `setup`, `doctor`, `update`, `sessions browse`, `skills`, `mcp`, `tools`, `approvals`, `checkpoints`, `profile`, `config`, `insights` |
| `Hermes: Diagnóstico` | `hermes doctor` + `hermes acp --check` no terminal |
| `Hermes: Mostrar log` / `Mostrar tráfego` | canais de saída `Hermes` e `Hermes Traffic` |
| `Hermes: Perguntar/Explicar sobre a seleção` | anexa a seleção como chip e foca o composer |
| `Hermes: Enviar arquivo atual` | anexa o arquivo ativo como chip |

## Configuração (`hermes.*`)

| Chave | Padrão | Para que serve |
|---|---|---|
| `hermes.cliPath` | `hermes` | executável; aceita prefixo de ambiente (`wsl hermes`) |
| `hermes.agents` | `{"Hermes": {"command":"hermes","args":["acp"]}}` | agentes: comando, args, `profile`, `cwd`, `env`, `model` |
| `hermes.defaultAgent` | `Hermes` | agente ativo |
| `hermes.defaultWorkingDirectory` | vazio | cwd das sessões; vazio = pasta do workspace |
| `hermes.skipConfiguredMcp` | `true` | exporta `HERMES_ACP_SKIP_CONFIGURED_MCP=1` (evita os MCP globais atrasarem o `initialize`) |
| `hermes.permissions` | `ask` | política padrão das respostas de aprovação |
| `hermes.showReasoning` | `collapsed` | `always` \| `collapsed` \| `hidden` |
| `hermes.queue.enabled` | `true` | fila de prompts no composer |
| `hermes.queue.defaultAction` | `queue` | ação do envio durante um turno: `queue` \| `steer` |
| `hermes.context.warnAt` | `80` | aviso de contexto |
| `hermes.notifications` | `windowNotFocused` | notificações de sessões em background |
| `hermes.logTraffic` | `false` | JSON-RPC bruto no canal `Hermes Traffic` (com redação de segredos) |

## Desenvolvimento

```bash
npm run compile     # tsc --noEmit (o gate de tipos)
npm run build       # tudo
npm test            # 9 testes; a integração spawna o `hermes acp` de verdade
npm run watch       # esbuild em watch (extension host)
```

Os testes de integração usam o Hermes real e são **skipados** se `hermes` não estiver no PATH —
nunca fingem passar.

## Troubleshooting

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "A conexão com o Hermes caiu" | `hermes` saiu (PATH, credenciais, WSL) | `hermes acp --check`, `hermes doctor`; ver o canal `Hermes` |
| Nenhum modelo na lista | provider sem credencial no Hermes | `hermes model` (ou pelo menu "Executar comando da CLI…") |
| Modo/picker vazio | o agente não anunciou modos | normal em versões antigas; a UI degrada em vez de inventar |
| Windows | Hermes não roda nativo | use WSL2 e `hermes.cliPath = "wsl hermes"` |
| `npm install` não instala nada | `NODE_ENV=production` no shell pula devDeps | `export NODE_ENV=development` |

## Documentação

- `docs/ARCHITECTURE.md` — transporte, mapa capability→UI, fluxo do turno, segurança, marcos e
  **lacunas verificadas** (modos, fila, skills, MCP, esforço, custo, checkpoints).
- `docs/UX.md` — wireframes do composer, pickers, medidor de contexto, painel Gerenciar e sessões,
  cada elemento mapeado à sua fonte de dados, mais a lista de estados degradados.
