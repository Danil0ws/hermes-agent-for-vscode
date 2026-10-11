# Contribuindo

Obrigado pelo interesse. Este projeto é uma **interface** para o Hermes Agent: ele não reimplementa
o agente, fala ACP (JSON-RPC sobre stdio) com `hermes acp` e usa a mesma configuração da CLI.
Duas regras de produto vêm antes de qualquer preferência técnica:

1. **Nada que a CLI faz pode ficar inacessível.** O que o ACP não expõe vira terminal integrado ou
   leitura/escrita da configuração real do Hermes. Não criamos estado paralelo.
2. **Nunca inventar dado.** Se o protocolo não informa (custo, detalhamento por categoria, skills
   ativas), a UI esconde ou rotula "estimado". Número inventado é defeito.

## Preparar o ambiente

```bash
git clone <repo> && cd hermes-for-vs-code
export NODE_ENV=development   # o shell pode ter NODE_ENV=production, que pula devDependencies
npm install
npm run build
```

Requisitos: Node 18+, VS Code 1.100+ e o Hermes instalado com o extra ACP ativo
(`hermes acp --check` → `Hermes ACP check OK`). O Hermes roda em Linux/macOS/WSL2 — no Windows
nativo, use WSL2 e `hermes.cliPath = "wsl hermes"`.

## Gates (todos têm de passar antes de um PR)

```bash
npx tsc -p tsconfig.json --noEmit   # tipos, sem exceção
npm run build                       # esbuild (extension host) + vite (webviews)
npm test                            # unitários + 2 de integração contra o `hermes acp` real
npx vsce package --no-dependencies --allow-missing-repository
```

Os testes de integração **spawnam o Hermes de verdade** e são marcados como skip quando `hermes`
não está no PATH — nunca passam em silêncio.

## Testar dentro do editor

O caminho normal é **F5** (Extension Development Host). Sem interface gráfica, dá para verificar o
carregamento assim:

```bash
code --extensionDevelopmentPath="$PWD" --user-data-dir=/tmp/hermes-dev --new-window
# depois leia /tmp/hermes-dev/logs/*/window*/exthost/exthost.log
```

A ativação é **lazy** (`onView:`/`onCommand:`, `activationEvents: []`): nada roda até o usuário
abrir a view ou invocar um comando. Para um smoke test do registro inteiro, adicione
`onStartupFinished` temporariamente ao `package.json` e reverte depois — foi assim que descobrimos
uma `DiagnosticCollection` duplicada.

Para olhar a UI sem abrir o editor, sirva `dist/` e carregue `chat.js`/`chat.css` num navegador
definindo `window.acquireVsCodeApi` e postando mensagens `HostToWebview` (o contrato está em
`src/core/types.ts`). O CSS depende dos tokens `--vscode-*`; sem eles o julgamento visual é inválido.

## Arquitetura em uma tela

| Camada | Onde | Regra |
|---|---|---|
| Transporte ACP | `src/core/Connection.ts` | spawn, `SIGTERM`→`SIGKILL`, nada de órfão |
| Sessões | `src/core/HermesSession.ts` + `AgentManager.ts` | traduz `session/update` para o contrato |
| Contrato | `src/core/types.ts` | união discriminada, dos dois lados, `PROTOCOL = 1` |
| Superfícies | `src/features/*` | uma feature por arquivo, dona dos **seus** comandos |
| Views | `src/ui/*` | componente nativo do VS Code sempre que existir |
| Webviews | `webview/chat`, `webview/manage` | só tokens `--vscode-*`, Codicons, teclado 100% |

**Ao adicionar um comando:** declare-o no `package.json` e registre-o em **um** lugar só (a feature
dona). Um `registerCommand` duplicado lança; se o bloco não tiver `try/catch`, **tudo depois dele
naquele bloco nunca registra** e a UI só mostra "command not found" no clique. A receita para
descobrir: `npm test` (a suíte `manifest.test.ts` cobra dono único, declarado↔registrado e
localidades do `nls`) e o canal `Hermes`, que na ativação informa `comandos: N/M registrados`.

**Ao adicionar um campo no contrato:** é compatível se for variante nova ou campo opcional; mudar
campo existente é breaking e exige bump de `PROTOCOL`.

## Trabalho paralelo (lanes)

O projeto foi construído com lanes paralelas fatiadas por **posse de arquivo**, não por marco:
cada lane recebe uma lista fechada de arquivos, proibição explícita de tocar em `package.json`,
`tsconfig.json`, `vite.config.ts`, `src/core/{types,Connection,AgentManager,HermesSession}.ts` e no
`extension.ts`, e a obrigação de entregar a saída de `tsc` + do seu teste isolado. O núcleo e o
manifesto são escritos **antes** do fan-out; o que uma lane precisa fora do seu escopo volta como
relatório (`arquivo:linha: mudança exata`) e o coordenador aplica na integração.

## Documentação obrigatória por mudança

Toda entrega atualiza, na mesma mudança: `README.md` (instalação/configuração/troubleshooting),
`docs/` (`ARCHITECTURE.md` com o mapa capability→UI e a seção de **lacunas verificadas**;
`UX.md` com os wireframes) e `CHANGELOG.md`. Lacuna conhecida se documenta, não se esconde.

Idioma dos documentos: **`README.md` em inglês** (é a porta de entrada do repo e a página da loja) e
o resto em pt-BR (`docs/`, `CONTRIBUTING.md`, `CHANGELOG.md`). O README cita comandos, chaves de
configuração e caminhos de arquivo — os três são cobrados por teste contra o manifesto e o disco
(`src/test/manifest.test.ts`), então renomear um comando quebra o teste antes de quebrar a página.
Números que derivam (total de testes, contagem de chaves de i18n) ficam **fora** do README de
propósito: quem conta é o `npm test`.

## Ordem do build (invariante)

```
npm run build  =  compile (tsc)  ->  clean (rm -rf dist)  ->  esbuild + vite
```

O `clean` é **destrutivo** e por isso vem DEPOIS do typecheck: se o `tsc` acusar erro, o `dist/`
anterior continua intacto. Invertido (clean primeiro), qualquer erro de tipo apagava o
`dist/extension.js` e o F5 morria com `Cannot find module .../dist/extension.js` — sem relação
aparente com o erro real. `.vscode/launch.json` declara `preLaunchTask: npm: build` para o F5 nunca
subir contra um `dist/` velho ou ausente.

## Ícone

`media/icon.png` (128×128, RGBA, transparente) é exportado de `media/icon-source.svg` — que é a arte
com o azul `#1E88E5`, escolhido por passar de 3:1 nos dois fundos do card da loja. Ao mexer na arte,
regere o PNG **e** reconfira o contraste de `media/hermes-agent-for-vscode.svg`: o VS Code não recolore
o ícone de view container (a cor vem do arquivo) e o schema exige `icon` **string** em
`contributes.viewsContainers.activitybar[0].icon` — com o par `{light, dark}` o container é
descartado e as views caem em `Explorer`. Uma cor só, então ela precisa passar de 3:1 no branco e no
`#333`.

### Imagem no topo do README

A primeira linha do `README.md` aponta para a arte local (`media/icon.png`, 110px, alinhada à
direita). Isso **depende** de `repository` no `package.json`: sem o campo, `vsce package` falha nessa
imagem (não é aviso) porque não tem URL base para resolvê-la. O `vsce` casa por **texto**, não por
markdown — por isso só o `README` carrega uma tag de imagem com caminho relativo; um exemplo desses
em outro `.md` que ele varra quebra o pacote mesmo dentro de um bloco de código.

## Licença

MIT — ver `LICENSE`. Ao contribuir, você concorda em licenciar sua contribuição nos mesmos termos.
