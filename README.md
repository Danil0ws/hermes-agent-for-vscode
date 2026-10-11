<img src="media/icon.png" width="110" align="right" alt="Hermes Agent icon">

# Hermes Agent for VS Code

A native VS Code interface for the [Hermes Agent](https://hermes-agent.nousresearch.com/docs) CLI
(Nous Research). It does not reimplement the agent: it speaks **ACP (JSON-RPC over stdio)** to
`hermes acp`, so it uses the same config (`~/.hermes`), providers, models, skills, MCP servers,
memory and toolsets as the CLI. Nothing the CLI can do becomes unreachable — whatever ACP does not
expose falls back to the integrated terminal.

Status: **milestones M1–M8 done** (ACP connection, streaming chat, reasoning, tool calls, native
diff, approvals, pickers, context meter, chips, parallel sessions, prompt queue, Manage panel, plan,
working set and the CLI escape hatches). M9 (visual pass across the 4 themes, keyboard/screen reader
and Remote) is **partial** — see `docs/ARCHITECTURE.md` §10.
See `docs/ARCHITECTURE.md` (milestones and verified gaps) and `docs/UX.md` (wireframes).

MIT licensed · 4 languages (en, pt-BR, ru, zh-CN) · no hardcoded colors.

> The in-repo docs (`docs/`, `CHANGELOG.md`, `CONTRIBUTING.md`) are written in Portuguese for now;
> this README is the English entry point.

## Requirements

- Hermes Agent installed with a provider configured (`hermes model`). Windows only through WSL2.
- The ACP extra enabled: `hermes acp --check` must answer `Hermes ACP check OK`.
- Node 18+ and VS Code 1.100+ (developed and tested on 1.141.0).

## Installation

```bash
git clone https://github.com/Danil0ws/hermes-agent-vscode.git ~/Dev/hermes-for-vs-code
cd ~/Dev/hermes-for-vs-code
export NODE_ENV=development   # devDependencies are required to build
npm install
npm run build                 # tsc --noEmit + esbuild (extension host) + vite (webviews)
```

Then open the folder in VS Code and press **F5** (Extension Development Host), or package it:

```bash
npm run package               # produces hermes-agent-vscode-<version>.vsix
code --install-extension hermes-agent-vscode-0.1.0.vsix
```

## Usage

1. Click the Hermes icon in the Activity Bar → the **Chat** view.
2. **Start** is the single control until a session exists: the centred block in the middle of the
   panel (title, one line on what the click does, and the button with a spinner while it runs).
   Before that nothing else in the panel is interactive — no toolbar, the field is disabled and says
   so, and the tab strip's `+`/worktree buttons are inert.
3. Once started the toolbar appears (`+` for context, mode and model) and typing works (`Enter`;
   `Shift+Enter` for a newline; `Esc` cancels the turn). The send button sits **inside** the field
   (bottom right, text only); it opens the same menu — send, queue, steer, interrupt.
4. **Tabs**: each tab is one conversation (its own session), and the tab strip is the lane indicator —
   a spinner while that tab's turn runs, a warning dot when it is waiting for approval. Closing a tab
   does not delete the session (history keeps it). `+` opens a tab, the branch icon opens one in a
   git worktree ([Commands](#commands)).
5. Native menus in the view title bar: new conversation, history, restart session, open in editor,
   Manage (the gear), and a "…" menu with **Open Full CLI**, **Run CLI Command…**, diagnostics, log
   and traffic.

## Commands

| Command | What it does |
|---|---|
| `Hermes: New Conversation` | `session/new` on the active agent |
| `Hermes: New Worktree and Session` | `git worktree add` and a new tab **in that folder** — one working directory per lane. Empty `hermes.worktreeRoot` = sibling `<repo>-worktrees` |
| `Hermes: Session History` | native quick pick (Today/Yesterday/Earlier), resumes with `session/load` |
| `Hermes: View Plan` / `Implement Plan` | plan view; implement sends the plan as a prompt |
| `Hermes: Manage` | panel with 8 tabs (Models, Skills, Tools and MCP, Instructions, Context and usage, Agents/Profiles, Approvals, Advanced) |
| `Hermes: Manage Context` | what goes to the model, grouped, with token counts |
| `Hermes: Add Context` / `Remove Context` | composer context chips |
| `Hermes: Keep File Changes` / `Undo File Changes` | per-file working set (undo = reverse diff) |
| `Hermes: Open in Editor` | the same view as an editor tab |
| `Hermes: Open Full CLI` | `hermes` (TUI) in the integrated terminal, at the workspace folder |
| `Hermes: Run CLI Command…` | quick pick: `model`, `setup`, `doctor`, `update`, `sessions browse`, `skills`, `mcp`, `tools`, `approvals`, `checkpoints`, `profile`, `config`, `insights` |
| `Hermes: Check / install Hermes` | detects the CLI (`--version` + `acp --check`) and offers to install, set the path or run `doctor` |
| `Hermes: Toggle auto-approve (YOLO)` | turns `hermes.permissions = allowAll` on/off (modal confirmation; status bar indicator while on) |
| `Hermes: Export Conversation` | writes the transcript to a file |
| `Hermes: Diagnostics` | `hermes doctor` + `hermes acp --check` in the terminal |
| `Hermes: Show Log` / `Show Protocol Traffic` | `Hermes` and `Hermes Traffic` output channels |
| `Hermes: Ask Hermes About Selection` / `Explain with Hermes` | attaches the selection as a chip and focuses the composer |
| `Hermes: Send Current File to Hermes` | attaches the active file as a chip |

The Command Palette holds the full list — the table above is the day-to-day subset.

## Settings (`hermes.*`)

| Key | Default | What it is for |
|---|---|---|
| `hermes.cliPath` | `hermes` | executable; accepts an environment prefix (`wsl hermes`) |
| `hermes.agents` | `{"Hermes": {"command":"hermes","args":["acp"]}}` | agents: command, args, `profile`, `cwd`, `env`, `model` |
| `hermes.defaultAgent` | `Hermes` | agent selected when the view opens |
| `hermes.defaultWorkingDirectory` | empty | session cwd; empty = workspace folder |
| `hermes.skipConfiguredMcp` | `true` | exports `HERMES_ACP_SKIP_CONFIGURED_MCP=1` (keeps global MCP servers from slowing `initialize` down) |
| `hermes.permissions` | `ask` | default policy for approval responses |
| `hermes.showReasoning` | `collapsed` | `always` \| `collapsed` \| `hidden` |
| `hermes.queue.enabled` | `true` | composer prompt queue |
| `hermes.queue.defaultAction` | `queue` | send action during an active turn: `queue` \| `steer` |
| `hermes.context.warnAt` | `80` | warn when context usage passes this percentage |
| `hermes.worktreeRoot` | empty | where `Hermes: New Worktree and Session` creates git worktrees; empty = sibling `<repo>-worktrees` |
| `hermes.notifications` | `windowNotFocused` | when to notify about background session events |
| `hermes.logTraffic` | `false` | raw JSON-RPC in the `Hermes Traffic` channel (secrets redacted) |

## Icon

The Hermes art is **one** file, `media/hermes-agent-vscode.svg`, used on both themes:

- **Activity Bar**: the manifest points at it in
  `contributes.viewsContainers.activitybar[0].icon`. The VS Code schema requires `icon` to be a
  **string** (the `{light, dark}` pair is **not** accepted: the whole container is dropped and its
  views fall back to `Explorer`). VS Code also does not recolor view container icons — the color
  comes from the file, so a single color has to work on both backgrounds.
- **Marketplace**: `media/icon.png`, 128×128 RGBA with a transparent background, exported from
  `media/icon-source.svg`. `vsce` **refuses to publish an SVG `icon`** ("the icon provided in
  `package.json` may not be an SVG"), hence the PNG — the SVG is still valid for the Activity Bar,
  which is manifest-driven.

Measured contrast (WCAG for non-text elements, 3:1 minimum):

| File | Color | Where | Contrast |
|---|---|---|---|
| `hermes-agent-vscode.svg` | `#2B8AD9` | Activity Bar, light and dark themes | 3.66:1 on white · 3.45:1 on `#333` · 4.51:1 on `#1F1F1F` |
| `icon.png` (`icon-source.svg`) | `#1E88E5` | marketplace card, both themes | 3.68:1 light · 3.43:1 dark |

The original pair of blues (`#007ACC` for light, `#3B9EFF` for dark) does not survive the schema: one
color has to serve both backgrounds, and `#007ACC` measured **2.80:1** on the `#333` Activity Bar.
Hence `#2B8AD9`, same family, above 3:1 on both — and 4.5:1 on the darkest background, since the bar
draws the inactive item at reduced opacity.

Honest note on size: the art carries fine detail, and at the Activity Bar's real size (16–24px) the
inner strokes land around 0.2px and it reads as a silhouette. That is a legitimate brand choice; if
you want more definition there, the `agent` glyph from `@vscode/codicons` is the immediate
alternative.

To regenerate the PNG: export `media/icon-source.svg` at **128×128, RGBA, transparent background**.
`vsce` refuses SVG and requires a PNG in `icon`.

## Publishing to the Marketplace

```bash
npx vsce package                  # produces the .vsix (no warnings)
npx vsce publish                  # needs a publisher + PAT (or Entra ID)
```

What still depends on you:

1. **`publisher`** — currently `Danil0ws`; it must match your Marketplace publisher id exactly.
2. **Token** — an Azure DevOps PAT with the *Marketplace → Manage* scope, or Entra ID authentication
   (`vsce publish --azure-credential`). Global Azure DevOps PATs are retired on 2026-12-01, so Entra
   ID is Microsoft's own recommendation.

`repository` is already in the manifest (`github.com/Danil0ws/hermes-agent-vscode`), and it is what
lets `vsce` resolve the local art in this README: with the field present, `vsce package` rewrites the
image to the absolute GitHub URL and passes; without it, packaging **fails** (not a warning). The
store icon comes from `package.json > icon` (`media/icon.png`) and is independent of that.

Checked: `hermes-agent.hermes-agent-vscode` is **still free** on the Marketplace (name and display
name have to be unique; if it were taken, publishing would fail with "already exists").

## Auto-approve (YOLO)

By default Hermes **asks** before running commands and editing files. The policy lives in
`hermes.permissions` and takes three values: `ask` (default), `allowSession` (repeats, for this
session, what you already approved once) and `allowAll` (never asks).

```jsonc
// settings.json — same as the palette command
{ "hermes.permissions": "allowAll" }
```

The extension answers with the options the **agent** offered — it never invents a permission — and
never picks a deny option. While YOLO is on, an item sits in the status bar (`Hermes: approving
everything`, warning background) and clicking it turns it off. A restricted workspace (Workspace
Trust) still wins: nothing runs.

## Languages

The extension language follows the **VS Code display language** (there is no picker of its own):
change it in `Ctrl+Shift+P` → *Configure Display Language* and reload the window.

| Language | Manifest / Command Palette | Webview UI | Host (notices, pickers, status bar) |
|---|---|---|---|
| English (`en`) | default | ✅ | ✅ |
| Português (`pt-BR`) | ✅ | ✅ (source language) | ✅ (source language) |
| Русский (`ru`) | ✅ | ✅ | ✅ |
| 简体中文 (`zh-CN`) | ✅ | ✅ | ✅ |

How it works: the manifest uses `package.nls.*.json` (VS Code's native mechanism, one entry per
command/setting string) and the runtime uses two dictionaries — `webview/*/i18n.<locale>.ts` (typed
by `Strings`, so the compiler enforces key parity) and `src/l10n.<locale>.ts` (a pt-BR text →
translation map).

**pt-BR is the source language**: it holds the original strings, and a string with no translation
falls back to it instead of showing a raw key. This is not `vscode.l10n` plus a language pack: the
language comes from `vscode.env.language`, which reflects the installed language packs without
shipping `bundle.l10n.*.json` files (`docs/ARCHITECTURE.md` §11.18 explains the choice).

## Contributing

See `CONTRIBUTING.md` (environment, mandatory gates, one-screen architecture, the parallel-lanes
pattern and the documentation rules). **MIT** licensed — see `LICENSE`.

## Development

```bash
npm run compile     # tsc --noEmit (the type gate)
npm run build       # everything
npm test            # unit + integration; the integration ones spawn the real `hermes acp`
npm run watch       # esbuild in watch mode (extension host)
```

The integration tests use the real Hermes and are **skipped** when `hermes` is not on the PATH —
they never pretend to pass. Test and command counts are deliberately absent here: they drift, and
`npm test` counts itself.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| "The connection to Hermes dropped" | `hermes` exited (PATH, credentials, WSL) | `hermes acp --check`, `hermes doctor`; check the `Hermes` channel |
| No models in the list | provider without credentials in Hermes | `hermes model` (or the "Run CLI Command…" menu) |
| Mode/model picker empty | the agent announced no modes and no catalog | in this build the **Start** button creates the session; without a session there is nothing to announce |
| Windows | Hermes does not run natively | use WSL2 with `hermes.cliPath = "wsl hermes"` |
| `npm install` installs nothing | `NODE_ENV=production` in the shell skips devDeps | `export NODE_ENV=development` |
| `Cannot find module .../dist/extension.js` | `dist/` was empty: the build starts by cleaning, so a failed (or interrupted) build leaves nothing behind | run `npm run build`; on F5 the `preLaunchTask` builds first. The typecheck runs **before** `clean`, so a type error no longer wipes `dist/` |
| The UI is in a language I do not want | the language follows VS Code | *Configure Display Language* → pick one → reload the window |
| A string has no translation | a new string without a dictionary entry | it falls back to pt-BR on purpose; add the entry in `src/l10n.<locale>.ts` or `webview/*/i18n.<locale>.ts` |
| `command 'hermes.x' not found` | a command declared in the manifest that nobody registered (usually a duplicate registration throwing and being swallowed) | the `Hermes` channel logs `comandos: N/M registrados` on activation; `npm test` enforces the manifest invariant |
| The extension cannot find Hermes | wrong `hermes.cliPath`, CLI off the PATH, or a WSL install | `Hermes: Check / install Hermes`; on Windows the value must be `wsl hermes` — the first token is the executable |
| YOLO is on and you forgot | `hermes.permissions = allowAll` | the `Hermes: approving everything` status bar item; click to turn it off |

## Documentation

- `docs/ARCHITECTURE.md` — transport, capability→UI map, turn flow, security, milestones and the
  **verified gaps** (modes, queue, skills, MCP, effort, cost, checkpoints). (pt-BR)
- `docs/ROADMAP.md` — what to do about each verified gap: ordered by value over cost, with the proof
  that closes it, who owns it (this repo × a human at the editor × upstream) and the items
  deliberately left undone, with the reason. (pt-BR)
- `docs/UX.md` — wireframes for the composer, pickers, context meter, Manage panel and sessions,
  each element mapped to its data source, plus the degraded states. (pt-BR)
