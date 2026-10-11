/**
 * View do plano do agente (session/update `plan`).
 *
 * A view `hermes.plan` está declarada como `webview` no package.json (não editável por esta
 * lane), então é uma WebviewView; nada de cor/fonte literal (tudo por `--vscode-*`) e sem emoji.
 * A ordenação por prioridade e o progresso N/M são lógica pura, exportada para reuso.
 */
import * as vscode from 'vscode';
import type { PlanEntry } from '../core/types';
import { tr } from '../l10n';

const RANK: Record<PlanEntry['priority'], number> = { high: 0, medium: 1, low: 2 };

/** `priority` só ordena; empates mantêm a ordem de chegada do agente. */
export function sortByPriority(entries: PlanEntry[]): PlanEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (RANK[a.e.priority] - RANK[b.e.priority]) || (a.i - b.i))
    .map((x) => x.e);
}

export function progress(entries: PlanEntry[]): { done: number; total: number } {
  return { done: entries.filter((e) => e.status === 'completed').length, total: entries.length };
}

export class PlanView implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'hermes.plan';

  private view?: vscode.WebviewView;
  private entries: PlanEntry[] = [];
  private readonly visibility = new vscode.EventEmitter<void>();
  private readonly click = new vscode.EventEmitter<void>();

  /** Fired quando a view aparece/some: o feature usa para atualizar o snapshot enquanto visível. */
  readonly onDidChangeVisibility = this.visibility.event;
  readonly onDidClickImplement = this.click.event;

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((m: { type?: string }) => {
      if (m?.type === 'implement') this.click.fire();
    });
    view.onDidChangeVisibility(() => this.visibility.fire());
    if (view.visible) this.visibility.fire();
    this.render();
  }

  get visible(): boolean { return this.view?.visible ?? false; }

  setPlan(entries: PlanEntry[]): void {
    this.entries = entries;
    this.render();
  }

  reveal(): void { this.view?.show(true); }

  dispose(): void { this.visibility.dispose(); this.click.dispose(); }

  private render(): void {
    const p = progress(this.entries);
    void this.view?.webview.postMessage({
      type: 'plan', entries: sortByPriority(this.entries), done: p.done, total: p.total,
    });
  }

  private html(w: vscode.Webview): string {
    const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${w.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { margin: 0; padding: 8px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  #count { font-variant-numeric: tabular-nums; color: var(--vscode-descriptionForeground); }
  .bar { flex: 1; height: 6px; border-radius: 3px; background: var(--vscode-editorWidget-border); overflow: hidden; }
  #fill { height: 100%; width: 0%; background: var(--vscode-progressBar-background); transition: width .2s ease; }
  #list { list-style: none; margin: 0; padding: 0; }
  .item { display: flex; align-items: baseline; gap: 8px; padding: 4px 2px; border-bottom: 1px solid var(--vscode-panel-border); }
  .mark { flex: none; width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; }
  .item.completed .mark { background: var(--vscode-charts-green); }
  .item.in_progress .mark { background: var(--vscode-charts-yellow); }
  .item.pending .mark { border: 1px solid var(--vscode-descriptionForeground); }
  .item.completed .text { color: var(--vscode-descriptionForeground); text-decoration: line-through; }
  .text { flex: 1; white-space: pre-wrap; word-break: break-word; }
  .prio { flex: none; font-size: .85em; color: var(--vscode-descriptionForeground); }
  .empty { color: var(--vscode-descriptionForeground); padding: 8px 2px; }
  .foot { margin-top: 10px; }
  button { width: 100%; padding: 4px 10px; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: none; border-radius: 2px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { cursor: default; color: var(--vscode-disabledForeground); background: var(--vscode-button-secondaryBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
</style>
</head>
<body>
  <div class="head">
    <span id="count" aria-live="polite">—</span>
    <div class="bar" id="bar" role="progressbar" aria-label="${tr('Progresso do plano')}" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"><div id="fill"></div></div>
  </div>
  <ul id="list" role="list" aria-label="${tr('Tarefas do plano')}"></ul>
  <div class="foot">
    <button id="impl" type="button" aria-label="${tr('Implementar plano')}">${tr('Implementar plano')}</button>
  </div>
<script nonce="${nonce}">
  const api = acquireVsCodeApi();
  const list = document.getElementById('list');
  const count = document.getElementById('count');
  const bar = document.getElementById('bar');
  const fill = document.getElementById('fill');
  const btn = document.getElementById('impl');
  const LABEL = { pending: '${tr('pendente')}', in_progress: '${tr('em andamento')}', completed: '${tr('concluído')}' };
  btn.addEventListener('click', () => api.postMessage({ type: 'implement' }));
  window.addEventListener('message', (e) => { if (e.data && e.data.type === 'plan') render(e.data); });
  function render(m) {
    const { entries, done, total } = m;
    count.textContent = total ? done + '/' + total : '—';
    bar.setAttribute('aria-valuemax', String(total));
    bar.setAttribute('aria-valuenow', String(done));
    fill.style.width = total ? (done / total) * 100 + '%' : '0%';
    list.textContent = '';
    if (!entries.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '${tr('Sem plano nesta sessão. O Hermes publica o plano quando o agente usa a ferramenta "todo".')}';
      list.appendChild(li);
    }
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = 'item ' + e.status;
      li.setAttribute('aria-label', e.content + ' — ' + (LABEL[e.status] || e.status));
      const mark = document.createElement('span'); mark.className = 'mark'; mark.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span'); text.className = 'text'; text.textContent = e.content;
      const prio = document.createElement('span'); prio.className = 'prio'; prio.textContent = e.priority;
      li.append(mark, text, prio);
      list.appendChild(li);
    }
    const pending = entries.some((e) => e.status !== 'completed');
    btn.disabled = !pending;
    btn.setAttribute('aria-disabled', String(!pending));
  }
</script>
</body>
</html>`;
  }
}
