# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento semântico.

## [0.1.0] — 2026-10-11

### Adicionado (M1: conexão ACP + chat com streaming)

- Camada ACP sobre `hermes acp`: `Connection` (spawn com SIGTERM→SIGKILL, backoff, `--profile`,
  `HERMES_ACP_SKIP_CONFIGURED_MCP`, prefixo de ambiente tipo `wsl hermes`) e `AgentManager`
  (dono da conexão, implementa o lado Client, roteia `session/update` por sessão).
- `HermesSession`: `session/new`, `session/load`, `session/list` paginado, `session/fork`,
  `prompt`, `cancel`, `setMode`, `setModel`, com tradução das 9 variantes de `session/update`
  que o Hermes emite para o contrato da webview.
- Contrato único Extension Host ↔ Webview (`src/core/types.ts`, união discriminada, `PROTOCOL = 1`).
- Webview de chat (Preact + `@preact/signals`): transcript, streaming, bloco de raciocínio
  colapsável, itens de tool call com status e duração, cartão de plano, aprovação inline com as
  opções reais do agente, medidor de contexto com limiares por token de tema, chips de contexto,
  fila visível, envio dividido (enviar / enfileirar / steer / interromper) e estado vazio com 4
  ações.
- Painel **Gerenciar** (esqueleto navegável com as 8 abas) e webview própria.
- Escape hatches da CLI: `Abrir CLI completa`, `Executar comando da CLI…` (16 comandos reais) e
  `Diagnóstico`.
- Canais de saída `Hermes` e `Hermes Traffic` (com redação de chave/token/segredo).
- Confinamento de `fs/*` ao workspace (escrita fora exige confirmação; leitura livre).
- 12 settings `hermes.*`, 17 comandos, menus nativos (`view/title`, `editor/context`,
  `explorer/context`), atalhos e i18n por `package.nls`.
- Testes: 7 unitários + 2 de integração que spawnam o `hermes acp` real (initialize/protocolo 1,
  3 modos, catálogo de modelos, streaming, cancel, ausência de processo órfão).

### Corrigido durante a Fase 0/M1 (o que a pesquisa desmentiu)

- **Não existem modos Ask/Plan/Agent no Hermes**: os 3 modos do ACP são política de aprovação de
  edição (`default`, `accept_edits`, `dont_ask`).
- O SDK oficial de ACP (`@agentclientprotocol/sdk`) **não tipa** `models`, `session/set_model`
  nem `session/fork`, que o adapter do Hermes implementa → `extMethod` + tipos locais.

### Notas de compatibilidade

- `@agentclientprotocol/sdk` é **ESM-only** → o extension host é empacotado em CJS com esbuild.
- `NODE_ENV=production` no shell faz o `npm install` pular devDependencies: use
  `export NODE_ENV=development` antes de instalar/buildar.
