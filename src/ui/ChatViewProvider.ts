/**
 * Hospeda a webview do chat e faz a ponte tipada com o AgentManager.
 *
 * Toda cor/estilo vem de `--vscode-*` (ver webview/chat/styles.css). Nada de componente
 * nativo do VS Code é reconstruído aqui: barra de título, quick picks, diff e terminal
 * são do próprio editor.
 */
import * as vscode from 'vscode';
import { basename } from 'node:path';
import { AgentManager } from '../core/AgentManager';
import { QueueManager } from '../core/QueueManager';
import { activeAgent, settings, workingDirectory } from '../config/Settings';
import { estimateTokens } from '../utils/Tokens';
import type { ChatState, ContextChip, HostToWebview, WebviewToHost } from '../core/types';
import { tr } from '../l10n';

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'hermes.chat';
  static readonly panelType = 'hermes.chat.panel';

  private view?: vscode.WebviewView | vscode.WebviewPanel;
  private queue: QueueManager;
  private running = false;
  private chips: ContextChip[] = [];
  private last: HostToWebview[] = [];
  private starting = false;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly agents: AgentManager,
    private readonly log: (level: 'info' | 'warn' | 'error', text: string) => void,
  ) {
    this.queue = new QueueManager(ctx.workspaceState);
    this.agents.onEvent((m) => this.post(m));
    this.agents.onAuthRequired(() => void this.runAuthTerminal());
  }

  resolveWebviewView(view: vscode.WebviewView): void { this.attach(view); }

  /** Transcript cru já enviado à webview: insumo do "Exportar conversa". */
  get transcript(): HostToWebview[] { return this.last; }

  async openInEditor(): Promise<void> {
    const panel = vscode.window.createWebviewPanel(ChatViewProvider.panelType, 'Hermes', vscode.ViewColumn.Beside, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.assetsRoot()],
    });
    this.attach(panel);
  }

  /* ─────────── ponte ─────────── */

  private attach(view: vscode.WebviewView | vscode.WebviewPanel): void {
    this.detach();
    this.view = view;
    const w = view.webview;
    w.options = { enableScripts: true, localResourceRoots: [this.assetsRoot()] };
    w.html = this.html(w);
    w.onDidReceiveMessage((raw: WebviewToHost) => void this.onMessage(raw));
    view.onDidDispose(() => { if (this.view === view) this.view = undefined; });
    this.post({ type: 'init', state: this.initialState() });
    for (const m of this.last) w.postMessage(m);
  }

  private detach(): void {
    // WebviewView não tem dispose(): quem controla o ciclo de vida é o próprio VS Code.
    if (this.view && 'dispose' in this.view) (this.view as vscode.WebviewPanel).dispose();
    this.view = undefined;
  }

  private async onMessage(msg: WebviewToHost): Promise<void> {
    try {
      switch (msg.type) {
        case 'ready':
          this.post({ type: 'init', state: this.initialState() });
          for (const m of this.last) this.post(m);
          return;
        case 'start':
          await this.start();
          return;
        case 'prompt':
          await this.send(msg.text, msg.chips, msg.action);
          return;
        case 'cancel':
          await this.agents.session?.cancel();
          return;
        case 'setMode':
          await this.agents.session?.setMode(msg.modeId);
          return;
        case 'setModel':
          await this.agents.session?.setModel(msg.modelId);
          return;
        case 'permission/answer':
          this.agents.answerPermission(msg.id, msg.optionId);
          return;
        case 'queue/remove':
          this.queue.remove(msg.id); this.post({ type: 'queue', items: this.queue.all }); return;
        case 'queue/move':
          this.queue.move(msg.id, msg.delta); this.post({ type: 'queue', items: this.queue.all }); return;
        case 'queue/clear':
          this.queue.clear(); this.post({ type: 'queue', items: this.queue.all }); return;
        case 'queue/sendNow': {
          const item = this.queue.take(msg.id);
          if (item) { await this.agents.session?.cancel(); await this.send(item.text, item.chips, 'send'); }
          this.post({ type: 'queue', items: this.queue.all });
          return;
        }
        case 'newConversation':
          await this.newConversation();
          return;
        case 'compact':
          await this.send('/compress', [], 'send');
          return;
        case 'openFile': {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.path));
          const editor = await vscode.window.showTextDocument(doc);
          if (msg.line) {
            const pos = new vscode.Position(Math.max(0, msg.line - 1), 0);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
          }
          return;
        }
        case 'openDiff':
          await vscode.commands.executeCommand('hermes.diff.open', msg.path);
          return;
        case 'applyToEditor':
          await this.insertInEditor(msg.text);
          return;
        case 'copy':
          await vscode.env.clipboard.writeText(msg.text);
          void vscode.window.showInformationMessage('Copiado.');
          return;
        case 'openCli':
          await vscode.commands.executeCommand('hermes.openCli');
          return;
        case 'showSessions':
          await vscode.commands.executeCommand('hermes.showSessions');
          return;
        case 'openManage':
          await vscode.commands.executeCommand('hermes.manage', msg.manageTab);
          return;
        case 'addContext':
          await vscode.commands.executeCommand('hermes.context.add', msg.source);
          return;
        case 'removeChip':
          await vscode.commands.executeCommand('hermes.context.remove', msg.id);
          return;
        case 'addPath':
          await this.attachFilePath(msg.path);
          return;
        case 'undoFile':
          await vscode.commands.executeCommand('hermes.undoFile', msg.path);
          return;
        case 'keepFile':
          await vscode.commands.executeCommand('hermes.keepFile', msg.path);
          return;
        default:
          this.log('info', `mensagem desconhecida da webview: ${JSON.stringify(msg)}`);
      }
    } catch (err) {
      this.log('error', `erro tratando ${msg.type}: ${String(err)}`);
      this.post({ type: 'error', text: String(err) });
    }
  }

  private async send(text: string, chips: ContextChip[], action: 'send' | 'queue' | 'steer' | 'interrupt'): Promise<void> {
    const s = settings();
    if (!text.trim() && chips.length === 0) return;

    if (this.running && s.queueEnabled && action === 'queue') {
      this.queue.add(text, chips);
      this.post({ type: 'queue', items: this.queue.all });
      return;
    }
    if (this.running && action === 'interrupt') await this.agents.session?.cancel();

    let session = this.agents.session;
    if (!session) session = await this.agents.newSession(activeAgent(s).cfg, workingDirectory(s), activeAgent(s).name);

    this.chips = chips;
    this.running = true;
    this.post({ type: 'user/message', text, chips });
    const stop = await session.prompt(text, chips);
    this.running = false;
    this.log('info', `turno terminou: ${stop}`);

    if (s.queueEnabled) {
      const nextItem = this.queue.next();
      if (nextItem) {
        this.post({ type: 'queue', items: this.queue.all });
        await this.send(nextItem.text, nextItem.chips, 'send');
      }
    }
  }

  /**
   * Botão "Iniciar": cria a sessão SEM enviar prompt. É o handshake que ANUNCIA modos, modelos e
   * comandos — sem ele o `init` que a webview recebeu foi montado quando `snapshot` ainda estava
   * vazio, e os seletores só se enchem no primeiro envio (o usuário vê "sem modos"/"sem modelos").
   * Idempotente: clique duplo não abre duas sessões.
   */
  async start(): Promise<void> {
    // `existing` numa const: ler `this.agents.session` dentro do guard faz o TS estreitar a
    // propriedade (aliasing) e a leitura seguinte virar `never`.
    const existing = this.agents.session;
    if (this.starting || existing) return;
    this.starting = true;
    this.post({ type: 'init', state: this.initialState() });
    try {
      const s = settings();
      // a sessão devolvida pelo `newSession` é a que vale — não reler `this.agents.session`
      const session = await this.agents.newSession(activeAgent(s).cfg, workingDirectory(s), activeAgent(s).name);
      this.post({ type: 'session', sessionId: session.sessionId });
      this.log('info', `sessão iniciada: ${session.sessionId}`);
    } catch (err) {
      this.log('error', `falha ao iniciar a sessão: ${String(err)}`);
      this.post({ type: 'error', text: String(err) });
    } finally {
      this.starting = false;
      this.post({ type: 'init', state: this.initialState() });
    }
  }

  async newConversation(): Promise<void> {
    this.running = false;
    this.chips = [];
    this.last = [];
    const s = settings();
    await this.agents.newSession(activeAgent(s).cfg, workingDirectory(s), activeAgent(s).name);
    const sess = this.agents.session;
    if (sess) this.post({ type: 'session', sessionId: sess.sessionId });
    this.post({ type: 'init', state: this.initialState() });
    this.log('info', `nova sessão: ${sess?.sessionId ?? '?'}`);
  }

  /** chip de arquivo (menu do explorer / "Enviar arquivo atual"). */
  async attachFilePath(path: string): Promise<void> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
    const text = new TextDecoder().decode(bytes);
    this.addChip({ kind: 'file', ref: path, label: basename(path), text });
  }

  /** chip de seleção ("Perguntar sobre a seleção"). */
  async attachSelection(editor: vscode.TextEditor, prefix: string): Promise<void> {
    const sel = editor.selection;
    const text = editor.document.getText(sel);
    this.addChip({
      kind: 'selection',
      ref: editor.document.uri.fsPath,
      label: `${basename(editor.document.uri.fsPath)} L${sel.start.line + 1}–L${sel.end.line + 1}`,
      text,
      lines: [sel.start.line + 1, sel.end.line + 1],
      prefix,
    });
    await vscode.commands.executeCommand('hermes.chat.focus');
    this.post({ type: 'notice', level: 'info', text: `${(text.length / 4 / 1000).toFixed(1)}k tokens anexados.` });
  }

  private chipPrefix = new Map<string, string>();

  private addChip(c: Omit<ContextChip, 'id' | 'tokensEstimate'> & { prefix?: string }): void {
    const id = `chip-${Date.now()}-${this.chips.length}`;
    if (c.prefix) this.chipPrefix.set(id, c.prefix);
    this.chips = [
      ...this.chips,
      { id, kind: c.kind, ref: c.ref, label: c.label, text: c.text, lines: c.lines, implicit: c.implicit, imagePath: c.imagePath, tokensEstimate: estimateTokens(c.text ?? '') },
    ];
    this.post({ type: 'chips', chips: this.chips });
  }

  private async runAuthTerminal(): Promise<void> {
    const s = settings();
    const a = activeAgent(s);
    await vscode.commands.executeCommand('hermes.openCli', { command: a.cfg.command, args: ['acp', '--setup'] });
  }

  private async insertInEditor(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { void vscode.window.showWarningMessage(tr('Sem editor ativo.')); return; }
    await editor.edit((b) => b.insert(editor.selection.active, text));
  }

  /**
   * Abre uma aba nova (uma sessão nova). `cwd` escolhe a pasta de trabalho da sessão — é por aqui
   * que a lane do worktree entra.
   * STUB(lane A): o corpo real (criar a aba, subir a sessão com esse cwd, ativá-la) é da lane A.
   */
  async newTab(_cwd?: string): Promise<void> {
    this.log('info', 'newTab: stub');
  }

  private initialState(): ChatState {
    const s = settings();
    const sess = this.agents.session;
    return {
      sessionId: sess?.sessionId ?? null,
      agent: activeAgent(s).name,
      busy: this.running,
      starting: this.starting,
      // STUB(lane A): as abas são desta camada — a lane A troca por `this.tabList()`/`this.activeTabId`
      tabs: [],
      activeTab: '',
      modes: sess?.snapshot.modes ?? [],
      currentMode: sess?.snapshot.currentMode,
      models: sess?.snapshot.models ?? [],
      currentModel: sess?.snapshot.currentModel,
      commands: sess?.snapshot.commands ?? [],
      chips: this.chips,
      queue: this.queue.all,
      plan: sess?.snapshot.plan ?? [],
      workingSet: sess?.changedFiles ?? [],
      usage: sess?.snapshot.usage,
      turnUsage: sess?.snapshot.turnUsage,
      showReasoning: s.showReasoning,
      contextWarnAt: s.contextWarnAt,
      queueEnabled: s.queueEnabled,
      queueDefaultAction: s.queueDefaultAction,
    };
  }

  private post(m: HostToWebview): void {
    if (m.type !== 'init' && m.type !== 'busy') {
      this.last.push(m);
      if (this.last.length > 200) this.last.shift();
    }
    void this.view?.webview.postMessage(m);
  }

  private assetsRoot(): vscode.Uri { return vscode.Uri.joinPath(this.ctx.extensionUri, 'dist'); }

  private html(w: vscode.Webview): string {
    const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    const base = w.asWebviewUri(this.assetsRoot());
    return /* html */ `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${w.cspSource} data:; style-src ${w.cspSource} 'unsafe-inline'; font-src ${w.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${base}/codicon.css">
<link rel="stylesheet" href="${base}/chat.css">
<title>Hermes</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" type="module" src="${base}/chat.js"></script>
</body>
</html>`;
  }

  dispose(): void { this.detach(); this.agents.dispose(); }
}
