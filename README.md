# Hermes Agent for VS Code

Interface nativa do [Hermes Agent](https://hermes-agent.nousresearch.com/docs) (Nous Research) no
VS Code. Não reimplementa o agente: fala **ACP (JSON-RPC sobre stdio)** com `hermes acp`, então usa
a mesma config (`~/.hermes`), os mesmos providers, modelos, skills, MCP, memória e toolsets da CLI.
Nada que a CLI faz fica inacessível — o que o ACP não expõe vira terminal integrado.

Estado: **M1–M8 implementados** (conexão ACP, chat com streaming, raciocínio, tool calls, diff
nativo, aprovações, pickers, medidor de contexto, chips, sessões em paralelo, fila, painel
Gerenciar, plano, working set e escape hatches da CLI). M9 (passada visual nos 4 temas, teclado/
leitor de tela e Remote) está **parcial** — ver `docs/ARCHITECTURE.md` §10.
Ver `docs/ARCHITECTURE.md` (marcos e lacunas reais) e `docs/UX.md` (wireframes).

Licença MIT · 4 idiomas (en, pt-BR, ru, zh-CN) · sem nenhuma cor hardcoded.

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
| `Hermes: Histórico de sessões` | quick pick nativo (Hoje/Ontem/Anteriores), retoma com `session/load` |
| `Hermes: Ver plano` / `Implementar plano` | view do plano; implementar envia o plano como prompt |
| `Hermes: Gerenciar` | painel com 8 abas (Modelos, Skills, Ferramentas/MCP, Instruções, Contexto, Agentes, Aprovações, Avançado) |
| `Hermes: Gerenciar contexto` | o que vai ao modelo, por grupo, com tokens |
| `Hermes: Adicionar contexto` / `Remover contexto` | chips de contexto do composer |
| `Hermes: Manter arquivo` / `Desfazer alterações do arquivo` | working set por arquivo (desfazer = diff inverso) |
| `Hermes: Abrir em editor` | a mesma view como aba |
| `Hermes: Abrir CLI completa` | `hermes` (TUI) no terminal integrado, na pasta do workspace |
| `Hermes: Executar comando da CLI…` | quick pick: `model`, `setup`, `doctor`, `update`, `sessions browse`, `skills`, `mcp`, `tools`, `approvals`, `checkpoints`, `profile`, `config`, `insights` |
| `Hermes: Verificar / instalar o Hermes` | detecta o CLI (`--version` + `acp --check`) e oferece instalar, informar o caminho ou rodar o `doctor` |
| `Hermes: Alternar aprovação automática (YOLO)` | liga/desliga `hermes.permissions = allowAll` (confirmação modal; indicador na barra de status enquanto ligado) |
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

## Ícone

A arte do Hermes (`media/hermes-agent-light-vscode.svg` e `media/hermes-agent-vscode.svg`) é o
ícone da extensão, nos dois temas:

- **Activity Bar**: o manifesto declara o par light/dark
  (`contributes.viewsContainers.activitybar[0].icon`). O par é **obrigatório**, não preferência: o
  VS Code não recolore o ícone de view container, a cor vem do arquivo.
- **Loja**: `media/icon.png`, 128×128 RGBA com fundo transparente, gerado a partir da mesma arte.
  O `vsce` **recusa publicar com `icon` em SVG** ("the icon provided in `package.json` may not be an
  SVG"), por isso o PNG — o SVG continua valendo para a Activity Bar, que é manifesto.

Contraste medido (WCAG para elemento não-textual, mínimo 3:1):

| Arquivo | Cor | Onde | Contraste |
|---|---|---|---|
| `hermes-agent-light-vscode.svg` | `#007ACC` | Activity Bar em tema claro | 4,51:1 sobre branco |
| `hermes-agent-vscode.svg` | `#3B9EFF` | Activity Bar em tema escuro | 4,52:1 sobre `#333` |
| `icon.png` (`icon-source.svg`) | `#1E88E5` | card da loja, nos dois temas | 3,68:1 claro · 3,43:1 escuro |

O azul original do par era `#0066B8` no tema escuro: **2,16:1** sobre a Activity Bar escura, abaixo do
mínimo — e a barra ainda reduz a opacidade do item inativo. Daí o `#3B9EFF`, mesma família de cor.

Nota honesta sobre tamanho: a arte tem detalhe fino e, no tamanho real da Activity Bar (16–24px),
os traços internos ficam em ~0,2px e ela lê como silhueta. É uma escolha de marca legítima; se
preferir mais nitidez ali, o glifo `agent` do `@vscode/codicons` é a alternativa imediata.

Para regerar o PNG: exporte `media/icon-source.svg` em **128×128, RGBA, fundo transparente**. O
`vsce` recusa SVG e exige PNG no `icon`.

## Publicar na loja

```bash
npx vsce package                  # gera o .vsix (hoje sem avisos, exceto 'repository' ausente)
npx vsce publish                  # exige publisher + PAT (ou Entra ID)
```

O que ainda depende de você:

1. **`repository` no `package.json`** — único aviso que o `vsce` emite hoje. Sem ele, `vsce package`
   passa com `--allow-missing-repository`, mas a página da loja fica sem link para o código.
2. **`publisher`** — hoje é `hermes-agent`; tem de ser exatamente o id do seu publisher no
   Marketplace.
3. **Token** — PAT do Azure DevOps com escopo *Marketplace → Manage*, ou autenticação por Entra ID
   (`vsce publish --azure-credential`). Os PATs globais do Azure DevOps são aposentados em
   01/12/2026, então o caminho por Entra ID é o recomendado pela própria Microsoft.

Checado agora: `hermes-agent.hermes-agent-vscode` **está livre** no Marketplace (nome e display name
têm de ser únicos; se já existisse, o publish falharia com "already exists").

Nota sobre o README: **nenhuma imagem local** por enquanto. Sem `repository` o `vsce package`
**falha** (não é aviso) porque não tem URL base para resolver imagens locais — e ele varre o texto do
README, então nem um exemplo em bloco de código escapa. O ícone da página da loja vem de
`package.json > icon` (`media/icon.png`) e independe disso; ao criar o repositório, veja
`CONTRIBUTING.md › Ícone` para recolocar a imagem no topo.

## Aprovação automática (YOLO)

Por padrão o Hermes **pergunta** antes de executar comandos e editar arquivos. A política vive em
`hermes.permissions` e tem três valores: `ask` (padrão), `allowSession` (repete nesta sessão o que
você já autorizou uma vez) e `allowAll` (não pergunta nunca).

```jsonc
// settings.json — equivalente ao comando da palette
{ "hermes.permissions": "allowAll" }
```

A extensão responde com as opções que o **agente** ofereceu — nunca inventa uma permissão — e nunca
escolhe uma opção de negar. Enquanto o YOLO estiver ligado, um item fica na barra de status
(`Hermes: aprovando tudo`, fundo de aviso) e clicar nele desliga. O workspace em modo restrito
(Workspace Trust) continua valendo: nada executa.

## Idiomas

O idioma da extensão segue o **idioma de exibição do VS Code** (não há seletor próprio): troque em
`Ctrl+Shift+P` → *Configure Display Language* e recarregue a janela.

| Idioma | Manifesto / Command Palette | UI das webviews | Host (avisos, pickers, barra de status) |
|---|---|---|---|
| English (`en`) | padrão | ✅ | ✅ |
| Português (`pt-BR`) | ✅ | ✅ (idioma de origem) | ✅ (idioma de origem) |
| Русский (`ru`) | ✅ | ✅ | ✅ |
| 简体中文 (`zh-CN`) | ✅ | ✅ | ✅ |

Como funciona: o manifesto usa `package.nls.*.json` (58 chaves por idioma, a mecanismo nativo do
VS Code) e o runtime usa dois dicionários — `webview/*/i18n.<locale>.ts` (tipados por `Strings`, o
compilador garante paridade de chaves) e `src/l10n.<locale>.ts` (mapa texto pt-BR → tradução).

O **pt-BR é o idioma de origem**: é o texto-fonte, e uma string sem tradução cai nele em vez de
mostrar uma chave crua. Não é `vscode.l10n` + language pack: o idioma entra por
`vscode.env.language`, o que reflete os language packs instalados sem exigir empacotamento de
`bundle.l10n.*.json` (`docs/ARCHITECTURE.md` §11.18 explica a escolha).

## Contribuindo

Ver `CONTRIBUTING.md` (ambiente, gates obrigatórios, arquitetura em uma tela, o padrão de lanes
paralelas e as regras de documentação). Licença **MIT** — ver `LICENSE`.
Falta apenas uma URL de repositório público para `vsce publish`.

## Desenvolvimento

```bash
npm run compile     # tsc --noEmit (o gate de tipos)
npm run build       # tudo
npm test            # 45 testes; a integração spawna o `hermes acp` de verdade
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
| `Cannot find module .../dist/extension.js` | o `dist/` estava vazio: o build começa limpando e um build que falhou (ou ficou em voo) deixou nada lá | rode `npm run build`; no F5 o `preLaunchTask` builda antes. O typecheck roda **antes** do `clean`, então erro de tipo não apaga mais o `dist/` |
| UI em português e eu quero inglês | o idioma segue o VS Code | *Configure Display Language* → English → recarregar a janela |
| Tradução faltando numa string | string nova sem entrada no dicionário | cai no pt-BR de propósito; adicione a entrada em `src/l10n.<locale>.ts` ou `webview/*/i18n.<locale>.ts` |
| `command 'hermes.x' not found` | comando declarado no manifesto que ninguém registrou (normalmente um registro duplicado lançando e sendo engolido) | o canal `Hermes` diz `comandos: N/M registrados` na ativação; `npm test` tem a invariante do manifesto |
| Extensão não acha o Hermes | `hermes.cliPath` errado, CLI fora do PATH ou instalação via WSL | `Hermes: Verificar / instalar o Hermes`; no Windows o valor tem de ser `wsl hermes` — o primeiro token é o executável |
| YOLO ligado e você esqueceu | `hermes.permissions = allowAll` | item `Hermes: aprovando tudo` na barra de status; clique para desligar |

## Documentação

- `docs/ARCHITECTURE.md` — transporte, mapa capability→UI, fluxo do turno, segurança, marcos e
  **lacunas verificadas** (modos, fila, skills, MCP, esforço, custo, checkpoints).
- `docs/UX.md` — wireframes do composer, pickers, medidor de contexto, painel Gerenciar e sessões,
  cada elemento mapeado à sua fonte de dados, mais a lista de estados degradados.
