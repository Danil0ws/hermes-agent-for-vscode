/**
 * ContextView — painel de contexto da sessão: mostra TUDO o que vai ao modelo, agrupado,
 * cada grupo com tokens e % da janela. Ações: remover item, fixar (chip), "Compactar contexto"
 * (`/compress`) e "Nova conversa com resumo".
 *
 * Nada de cor literal: o CSS usa só as variáveis `--vscode-*`. Sem emoji. Strings em pt-BR.
 * O host monta os grupos (context.ts lê as fontes reais: AGENTS.md/.hermes.md/CLAUDE.md/SOUL.md,
 * ~/.hermes/skills, config.yaml) e esta view só apresenta — nunca inventa dado.
 */
type VSCode = typeof import('vscode');

export interface ContextGroupItem {
  id: string;
  label: string;
  tokens: number;
  /** true = medido pelo agente (ex.: raciocínio); false/ausente = "estimado". */
  measured?: boolean;
  removable?: boolean;
  pinned?: boolean;
}

export interface ContextGroup {
  title: string;
  tokens: number;
  percent: number;
  items: ContextGroupItem[];
  /** estado vazio ou nota explicativa (ex.: "não acessível pelo host"). */
  note?: string;
}

export interface ContextViewDeps {
  vs: VSCode;
  buildGroups: () => ContextGroup[];
  /** cabeçalho: usado/total do agente + selo. */
  usage: () => { size: number; used: number } | undefined;
  canCompact: () => boolean;
  onCompact: () => void | Promise<void>;
  onNewConversation: () => void | Promise<void>;
  onRemove: (chipId: string) => void;
  onPin: (chipId: string) => void;
  log: (level: 'info' | 'warn' | 'error', text: string) => void;
}

export class ContextView {
  private panel?: import('vscode').WebviewPanel;

  constructor(private readonly deps: ContextViewDeps) {}

  show(): void {
    const vs = this.deps.vs;
    if (this.panel) {
      this.panel.reveal();
      this.refresh();
      return;
    }
    this.panel = vs.window.createWebviewPanel(
      'hermes.context',
      'Contexto da sessão',
      vs.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage((msg: { type: string; id?: string }) => void this.onMessage(msg));
    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.post();
  }

  refresh(): void { this.post(); }

  dispose(): void { this.panel?.dispose(); this.panel = undefined; }

  private async onMessage(msg: { type: string; id?: string }): Promise<void> {
    try {
      switch (msg.type) {
        case 'remove': if (msg.id) { this.deps.onRemove(msg.id); this.post(); } return;
        case 'pin': if (msg.id) { this.deps.onPin(msg.id); this.post(); } return;
        case 'compact': await this.deps.onCompact(); this.post(); return;
        case 'newConversation': await this.deps.onNewConversation(); this.post(); return;
        default: this.deps.log('info', `ContextView: mensagem desconhecida ${msg.type}`);
      }
    } catch (err) {
      this.deps.log('error', `ContextView erro em ${msg.type}: ${String(err)}`);
    }
  }

  private post(): void {
    if (!this.panel) return;
    void this.panel.webview.postMessage({ type: 'groups', groups: this.deps.buildGroups(), usage: this.deps.usage(), canCompact: this.deps.canCompact() });
  }

  private html(): string {
    const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px; }
  h1 { font-size: 1.1em; margin: 0 0 8px; }
  .usage { color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
  .group { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 10px; padding: 8px 10px; }
  .group > header { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
  .group .pct { color: var(--vscode-descriptionForeground); font-weight: 400; }
  ul { list-style: none; margin: 6px 0 0; padding: 0; }
  li { display: flex; align-items: center; gap: 8px; padding: 2px 0; border-top: 1px solid var(--vscode-panel-border); }
  li:first-child { border-top: none; }
  li .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li .tokens { color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
  li .est { font-size: 0.85em; color: var(--vscode-descriptionForeground); }
  .note { color: var(--vscode-descriptionForeground); font-style: italic; margin-top: 6px; }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .actions { display: flex; gap: 8px; margin-top: 12px; }
  .actions button { padding: 4px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .actions button[disabled] { opacity: 0.5; cursor: not-allowed; }
  .pinned { color: var(--vscode-textLink-foreground); }
</style>
<title>Contexto</title>
</head>
<body>
<h1>Contexto da sessão</h1>
<div id="root" role="region" aria-label="Contexto da sessão" aria-live="polite">Carregando…</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  function esc(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function render(state) {
    const root = document.getElementById('root');
    const groups = state.groups || [];
    const usage = state.usage;
    const head = usage && usage.size > 0
      ? usage.used.toLocaleString('pt-BR') + ' de ' + usage.size.toLocaleString('pt-BR') + ' tokens (do agente)'
      : 'o agente ainda não reportou a janela';
    let html = '<div class="usage">' + esc(head) + '</div>';
    for (const g of groups) {
      html += '<section class="group" aria-label="' + esc(g.title) + '">';
      html += '<header><span>' + esc(g.title) + '</span><span class="pct">' + g.tokens.toLocaleString('pt-BR') + ' · ' + g.percent + '%</span></header>';
      if (g.items && g.items.length) {
        html += '<ul>';
        for (const it of g.items) {
          const pin = it.removable ? '<button aria-label="Fixar ' + esc(it.label) + '" title="Fixar" data-pin="' + it.id + '" class="' + (it.pinned ? 'pinned' : '') + '">Fixar</button>' : '';
          const rem = it.removable ? '<button aria-label="Remover ' + esc(it.label) + '" title="Remover" data-remove="' + it.id + '">Remover</button>' : '';
          const est = it.measured ? 'medido' : 'estimado';
          html += '<li><span class="label">' + esc(it.label) + '</span><span class="tokens">' + it.tokens.toLocaleString('pt-BR') + '</span><span class="est">' + est + '</span>' + pin + rem + '</li>';
        }
        html += '</ul>';
      }
      if (g.note) html += '<div class="note">' + esc(g.note) + '</div>';
      html += '</section>';
    }
    const compactDisabled = state.canCompact ? '' : ' disabled';
    html += '<div class="actions">'
      + '<button data-compact' + compactDisabled + ' title="' + (state.canCompact ? 'Envia /compress' : 'aguarde o turno ou cancele') + '">Compactar contexto</button>'
      + '<button data-newconv>Nova conversa com resumo</button>'
      + '</div>';
    root.innerHTML = html;
  }
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.remove) vscode.postMessage({ type: 'remove', id: t.dataset.remove });
    else if (t.dataset.pin) vscode.postMessage({ type: 'pin', id: t.dataset.pin });
    else if (t.hasAttribute('data-compact')) vscode.postMessage({ type: 'compact' });
    else if (t.hasAttribute('data-newconv')) vscode.postMessage({ type: 'newConversation' });
  });
  window.addEventListener('message', (e) => { if (e.data && e.data.type === 'groups') render(e.data); });
</script>
</body>
</html>`;
  }
}
