# Roadmap — fechar as lacunas verificadas

Objetivo: transformar a lista de **lacunas conhecidas** (`docs/ARCHITECTURE.md` §11) e o M9 parcial
(§10) em trabalho executável, em ordem de valor por custo. Cada linha aponta a lacuna, a ação, **o
sinal que prova que ficou pronto** e quem pode executar (esta máquina × humano no editor × upstream).

Regra de honestidade que vale para tudo aqui: se a fonte do dado não existe, a UI oculta ou rotula —
não inventa. Vários itens abaixo terminam em "não fazer" justamente por isso.

## Fase 0 — dívida de verificação (código pronto, prova faltando)

É o único bloco em que o trabalho já foi feito e só falta **evidência**. Barato, e destrava o
"⚠️ parcial" do M9.

| # | Lacuna | Ação | Evidência de pronto | Custo |
|---|---|---|---|---|
| 0.1 | §10/§17 — M9 visual nos 4 temas | Primeiro passo: versionar o harness (hoje ele existe só como página solta usada à mão e descartada — ver §29 de ARCHITECTURE): um `scripts/harness.mjs` que serve o `dist/` com os tokens `--vscode-*` de um tema escolhido. Depois rodar Dark+, Light+, High Contrast Black, High Contrast Light e um tema de terceiros | Contraste medido (≥3:1 não-texto, ≥4,5:1 texto) por superfície, nos 4 temas + capturas; nenhum hex literal no CSS (já verificável por teste — hoje não há nenhum) | baixo |
| 0.2 | §10/§17 — teclado e leitor de tela | No harness: percorrer `Tab`/`Shift+Tab` pelo composer, chips, transcript, popovers e diálogo de aprovação; conferir `:focus-visible` e ordem; ler a árvore de acessibilidade por CDP (`Accessibility.getFullAXTree`) | Ordem de foco documentada, nenhum controle inalcançável, `role`/`aria-*` presentes nas superfícies novas (fila, medidor, aprovação) | baixo |
| 0.3 | §10/§17 — Remote (SSH/WSL/Dev Containers) | **Só humano**: abrir a extensão num Remote-SSH real | Captura + linha no CHANGELOG dizendo o que funcionou e o que não; nenhuma promessa antes disso | humano |
| 0.4 | §11.16a — qualidade ru/zh-CN | **Só nativo**: revisão das 2 traduções (a estrutura de chaves o `tsc` já garante) | Diff revisado por falante; hoje é "estrutura verificada, texto não" | humano |

## Fase 1 — lacunas nossas, alto valor e baixo custo

Tudo aqui é código deste repo, com teste possível.

| # | Lacuna | Ação | Evidência de pronto | Custo |
|---|---|---|---|---|
| 1.1 | §11.14 — atividade por sessão | Hoje o contador por sessão é de **aprovação pendente** (`src/features/sessions.ts`), não do que a sessão está fazendo; e as mensagens emitidas por uma sessão não carregam `sessionId` no nível `HostToWebview`. O `HermesSession` já sabe quem é: taguear o que ele emite e a tree pinta atividade real | Com duas sessões em background, a tree mostra atividade na sessão certa; teste de unidade cobre o roteamento (e falha sem a tag) | baixo |
| 1.2 | §11.2 — duas filas podem coexistir | O servidor enfileira mas não expõe listar/remover/reordenar: a fila visível é nossa. Sem API, a ação honesta é **rotular** (fila local, "pode haver prompt na fila do agente") em vez de prometer contagem total | Rótulo no cabeçalho da fila + `title`; docs registram o limite | baixo |
| 1.3 | §11.6 — detalhamento é estimativa | Nada a corrigir na fonte; garantir que **todo** número não medido sai com o selo `estimado` e que o medido use o que o agente reportou | Teste de UI/i18n cobrindo o selo por categoria | baixo |
| 1.4 | §11.25 — strings com interpolação ficam só em pt-BR | Partir as 2 strings compostas em `tr('chave')` + parâmetros (o mesmo padrão que o bundle da webview já usa em funções) | As 2 strings aparecem traduzidas nos 4 idiomas; teste de paridade passa a cobri-las | baixo |
| 1.5 | §11.5 — janela de contexto por modelo | **Sem fonte hoje**: `~/.hermes/cache/model_catalog.json` traz só `id` (+descrição), e nenhum CLI expõe contexto por modelo. Opção barata: memorizar a última janela **medida** por modelo (persistir o `usage_update` em `workspaceState`) e mostrar com selo "medido na última sessão" | Para um modelo já usado, o picker mostra a janela com o selo; modelo nunca usado continua sem número | baixo |
| 1.6 | README × docs em inglês | Decisão do autor: `docs/` (`ARCHITECTURE.md`, `UX.md`, este arquivo) segue em pt-BR; traduzir é uma passada mecânica, sem ganho de correção | — | opcional |

## Fase 2 — onde a lacuna está fora deste repo

| # | Lacuna | Ação | Evidência de pronto | Dono |
|---|---|---|---|---|
| 2.1 | §11.7b/§19 — checkpoints não existem na sessão ACP | Confirmado agora: `grep -rn 'rollback\|checkpoint' ~/.hermes/hermes-agent/acp_adapter/*.py` não acha nada. Contribuição upstream de 2 pontos: passar `checkpoints_enabled` em `acp_adapter/session.py` e anunciar `/rollback` em `commands.py`. Enquanto isso o botão de restaurar só aparece quando há store real para o cwd | Sessão ACP anuncia o comando e o restore de turno funciona via UI; teste de integração cobre | upstream |
| 2.2 | §11.9 — MCP por HTTP/SSE | Upstream: o agente precisa anunciar `mcpCapabilities.http/sse`; o client só oferece o que foi anunciado | Servidor HTTP aparece no painel Gerenciar e conecta | upstream |
| 2.3 | §11.10 — anexos não-texto | Usar `embeddedContext` quando for anunciado (hoje arquivo vira texto; imagem depende de `promptCapabilities.image`, que é `true`) | Anexo binário chega como recurso embutido, sem virar texto | upstream |
| 2.4 | §11.3 — excluir/arquivar/renomear sessão | Já **resolvido por escape hatch**: `src/features/sessions.ts` roda `hermes sessions rename/archive/delete` no terminal integrado (não há `session/delete` no ACP). Melhoria opcional: rodar headless e revalidar a tree em vez de abrir terminal | Tree atualiza sozinha após a operação; confirmação modal preservada | próximo |

## Fase 3 — decidido NÃO fazer (com o motivo)

| Lacuna | Por quê |
|---|---|
| §11.1 — modos Ask/Plan/Agent | Não existem no Hermes: os 3 modos do ACP são política de aprovação. A UI lista o que o agente anunciar; inventar modos seria mentir |
| §11.7 — interceptar edições | As tools do agente escrevem direto no disco; bloquear exigiria proxy de sistema de arquivos. "Desfazer" é diff inverso — e é o que a UI diz |
| §11.8 — `_meta` interno | Extensão do adaptador, não contrato: só lemos, com degradação. Depender disso quebraria numa atualização |
| §11.11 — recursos exclusivos da TUI | `/skin`, widgets, barra da TUI não se duplicam: viram "Executar na CLI" |
| §11.5 — janela de contexto *antes* do primeiro uso | Sem fonte (ver 1.5). Mostrar "200K" seria chute; o picker fica sem o número até o agente reportar |

## Ordem sugerida (uma lane por item)

1. **0.1 + 0.2** (mesma lane: é o mesmo harness) — fecham o M9 pelo lado automatizável.
2. **1.1 + 1.4** em lanes separadas — independentes entre si e do resto.
3. **1.2 + 1.3 + 1.5** em paralelo; são três arquivos diferentes.
4. **2.x** conforme disponibilidade do upstream (abrir as contribuições e esperar).

Cada lane só fecha com: gate verde (`tsc --noEmit`, `npm run build`, `npm test`, `vsce package`),
README/docs/CHANGELOG na mesma entrega e — quando o item toca UI — medida no harness, não só captura.

## O que este roadmap não reivindica

- Não transforma lacuna em funcionalidade por vontade: item bloqueado por falta de fonte fica
  bloqueado, com o comando que prova (`grep`, catálogo, `--help`) registrado aqui.
- Não promete data.
- Não cobre recurso novo que ninguém pediu (YAGNI): o escopo é fechar §11 e o M9.
