/**
 * Hospeda a webview do chat e faz a ponte tipada com o AgentManager.
 *
 * Toda cor/estilo vem de `--vscode-*` (ver webview/chat/styles.css). Nada de componente
 * nativo do VS Code é reconstruído aqui: barra de título, quick picks, diff e terminal
 * são do próprio editor.
 */
import * as vscode from 'vscode';
import { basename, join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { AgentManager } from '../core/AgentManager';
import type { HermesSession } from '../core/HermesSession';
import { QueueManager } from '../core/QueueManager';
import { activeAgent, settings, workingDirectory } from '../config/Settings';
import { estimateTokens } from '../utils/Tokens';
import {
  CHIP_MAX_TOKENS, MAX_IMAGE_BYTES, imageExt, isImageMime, refText, truncateChipText, type DraftChip,
} from '../core/ContextManager';
import type { ChatState, ContextChip, HostToWebview, TabInfo, WebviewToHost } from '../core/types';
import { tr } from '../l10n';

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'hermes.chat';
  static readonly panelType = 'hermes.chat.panel';

  private view?: vscode.WebviewView | vscode.WebviewPanel;
  private queue: QueueManager;
  private chips: ContextChip[] = [];
  /** ContextManager (dono da lista), instalado pela feature "context". */
  private contextManager?: { add(draft: DraftChip): ContextChip; clear(): void };
  private last: HostToWebview[] = [];
  private starting = false;
  /** abas abertas (uma conversa = uma sessão) e qual está ativa. Vive só aqui — a sessão não sabe. */
  private tabs: TabInfo[] = [];
  private activeTabId = '';
  private tabSeq = 0;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly agents: AgentManager,
    private readonly log: (level: 'info' | 'warn' | 'error', text: string) => void,
  ) {
    this.queue = new QueueManager(ctx.workspaceState);
    this.agents.onEvent((m) => this.onAgentEvent(m));
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
          await this.start(msg.tab);
          return;
        case 'prompt':
          await this.send(msg.text, msg.action, msg.tab);
          return;
        case 'cancel':
          await this.sessionFor(msg.tab)?.cancel();
          return;
        case 'setMode':
          await this.sessionFor(msg.tab)?.setMode(msg.modeId);
          return;
        case 'setModel':
          await this.sessionFor(msg.tab)?.setModel(msg.modelId);
          return;
        /* ── abas ── */
        case 'activateTab':
          this.activateTab(msg.tab);
          return;
        case 'closeTab':
          this.closeTab(msg.tab);
          return;
        case 'renameTab':
          this.renameTab(msg.tab, msg.title);
          return;
        case 'newTab':
          // com `worktree`, quem cria o worktree é a feature (que chama `newTab(caminho)` de volta);
          // sem ele, `newTab` abre uma aba no cwd atual.
          if (msg.worktree) await vscode.commands.executeCommand('hermes.worktree.new', msg.worktree);
          else await this.newTab(msg.cwd);
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
          if (item) { await this.sessionFor(msg.tab)?.cancel(); await this.send(item.text, 'send', msg.tab); }
          this.post({ type: 'queue', items: this.queue.all });
          return;
        }
        case 'newConversation':
          await this.newConversation();
          return;
        case 'compact':
          await this.send('/compress', 'send', msg.tab);
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
          void vscode.window.showInformationMessage(tr('Copiado.'));
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
        case 'attachImage':
          await this.attachImage(msg.name, msg.mime, msg.data);
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

  private async send(text: string, action: 'send' | 'queue' | 'steer' | 'interrupt', tab?: string): Promise<void> {
    const s = settings();
    // FONTE ÚNICA: o que vai ao modelo é a lista do host (nunca uma cópia que a webview mandou).
    const chips = this.chips;
    if (!text.trim() && chips.length === 0) return;

    const t = this.tabs.find((x) => x.id === (tab ?? this.activeTabId)) ?? this.ensureTab();
    let session = this.sessionFor(t.id);
    const busy = session?.busy ?? false;

    if (busy && s.queueEnabled && action === 'queue') {
      this.queue.add(text, chips);
      this.post({ type: 'queue', items: this.queue.all });
      return;
    }
    if (busy && action === 'interrupt') await session?.cancel();

    if (!session) {
      session = await this.agents.newSession(activeAgent(s).cfg, t.cwd, activeAgent(s).name, t.id);
      t.sessionId = session.sessionId;
    }

    this.post({ type: 'user/message', text, chips, tab: t.id });
    const stop = await session.prompt(text, chips);
    this.log('info', `turno terminou: ${stop}`);

    if (s.queueEnabled) {
      const nextItem = this.queue.next();
      if (nextItem) {
        this.post({ type: 'queue', items: this.queue.all });
        await this.send(nextItem.text, 'send');
      }
    }
  }

  /**
   * Botão "Iniciar": cria a sessão SEM enviar prompt. É o handshake que ANUNCIA modos, modelos e
   * comandos — sem ele o `init` que a webview recebeu foi montado quando `snapshot` ainda estava
   * vazio, e os seletores só se enchem no primeiro envio (o usuário vê "sem modos"/"sem modelos").
   * Idempotente: clique duplo não abre duas sessões.
   */
  async start(tab?: string): Promise<void> {
    const t = this.tabs.find((x) => x.id === (tab ?? this.activeTabId)) ?? this.ensureTab();
    if (this.starting || t.sessionId) return;
    this.starting = true;
    t.starting = true;
    this.announce();
    try {
      const s = settings();
      // a sessão devolvida pelo `newSession` é a que vale — não reler por sessionId
      const session = await this.agents.newSession(activeAgent(s).cfg, t.cwd, activeAgent(s).name, t.id);
      t.sessionId = session.sessionId;
      this.post({ type: 'session', sessionId: session.sessionId, tab: t.id });
      this.log('info', `sessão iniciada (aba ${t.id}): ${session.sessionId}`);
    } catch (err) {
      this.log('error', `falha ao iniciar a sessão: ${String(err)}`);
      this.post({ type: 'error', text: String(err), tab: t.id });
    } finally {
      this.starting = false;
      t.starting = false;
      this.announce();
    }
  }

  /** Nova conversa: troca a sessão DENTRO da aba ativa (o histórico antigo continua em `hermes sessions`). */
  async newConversation(): Promise<void> {
    const t = this.ensureTab();
    this.clearChips();
    this.last = [];
    t.sessionId = null;
    t.busy = false;
    t.waiting = false;
    const s = settings();
    const session = await this.agents.newSession(activeAgent(s).cfg, t.cwd, activeAgent(s).name, t.id);
    t.sessionId = session.sessionId;
    this.post({ type: 'session', sessionId: session.sessionId, tab: t.id });
    this.announce();
    this.log('info', `nova sessão (aba ${t.id}): ${session.sessionId}`);
  }

  /**
   * Abre uma aba nova (uma sessão nova). `cwd` escolhe a pasta de trabalho da sessão — é por aqui
   * que a lane do worktree entra.
   */
  async newTab(cwd?: string): Promise<void> {
    const s = settings();
    const dir = cwd || workingDirectory(s);
    const id = `tab-${++this.tabSeq}`;
    const tab: TabInfo = {
      id,
      title: `${tr('Conversa')} ${this.tabs.length + 1}`,
      sessionId: null,
      cwd: dir,
      agent: activeAgent(s).name,
      busy: false,
      starting: true,
    };
    this.tabs = [...this.tabs, tab];
    this.activeTabId = id;
    this.announce();
    try {
      const session = await this.agents.newSession(activeAgent(s).cfg, dir, activeAgent(s).name, id);
      tab.sessionId = session.sessionId;
      this.log('info', `aba ${id} → sessão ${session.sessionId} (cwd ${dir})`);
    } catch (err) {
      this.log('error', `newTab: falha ao criar a sessão — ${String(err)}`);
      this.post({ type: 'error', text: String(err), tab: id });
    } finally {
      tab.starting = false;
      this.announce();
    }
  }

  /* ─────────── chips: UMA lista (a do host) ─────────── */

  /** a feature "context" instala o ContextManager (dono da lista). Sem ele o provider mantém a lista. */
  setContextManager(manager: { add(draft: DraftChip): ContextChip; clear(): void }): void {
    this.contextManager = manager;
  }

  /**
   * ÚNICO ponto de escrita da lista de chips: guarda a lista, espelha na webview e, quando houver
   * sessão na aba ativa, espelha também no lado ACP. `init`/`send` leem daqui — a cópia paralela que
   * fazia o `×` "não pegar" não existe mais.
   */
  setChips(chips: ContextChip[]): void {
    this.chips = chips;
    this.post({ type: 'chips', chips });
    this.sessionFor()?.setChips(chips);
  }

  private clearChips(): void {
    if (this.contextManager) this.contextManager.clear();
    else this.setChips([]);
  }

  /** chip de arquivo (menu do explorer / "Enviar arquivo atual"). */
  async attachFilePath(path: string): Promise<void> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
    const text = new TextDecoder().decode(bytes);
    this.addChip({ kind: 'file', ref: path, label: basename(path), text });
    this.post({ type: 'draft/insert', text: refText(vscode.workspace.asRelativePath(vscode.Uri.file(path))) });
  }

  /** chip de seleção ("Perguntar sobre a seleção"). */
  async attachSelection(editor: vscode.TextEditor, _prefix: string): Promise<void> {
    const sel = editor.selection;
    const text = editor.document.getText(sel);
    const lines: [number, number] = [sel.start.line + 1, sel.end.line + 1];
    this.addChip({
      kind: 'selection',
      ref: editor.document.uri.fsPath,
      label: `${basename(editor.document.uri.fsPath)} L${lines[0]}–L${lines[1]}`,
      text,
      lines,
    });
    await vscode.commands.executeCommand('hermes.chat.focus');
    // o chip carrega o QUÊ; a referência no campo diz ONDE (caminho relativo + linhas).
    this.post({ type: 'draft/insert', text: refText(vscode.workspace.asRelativePath(editor.document.uri), lines) });
    this.post({ type: 'notice', level: 'info', text: tr(`${(text.length / 4 / 1000).toFixed(1)}k tokens anexados.`) });
  }

  /** imagem colada no campo: valida o mime, grava num temporário e cria o chip `kind: 'image'`. */
  async attachImage(name: string, mime: string, data: string): Promise<void> {
    if (!isImageMime(mime)) { void vscode.window.showWarningMessage(tr('Só é possível colar imagens como anexo.')); return; }
    // contrato: base64 SEM o prefixo `data:`; remove um prefixo se algum dia vier (defensivo).
    const b64 = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length > MAX_IMAGE_BYTES) { void vscode.window.showWarningMessage(tr('Imagem grande demais: o limite é 10 MB.')); return; }
    const dir = mkdtempSync(join(tmpdir(), 'hermes-img-'));
    const file = join(dir, `colada${imageExt(mime)}`);
    writeFileSync(file, bytes);
    this.addChip({ kind: 'image', label: name.trim() || 'colada.png', ref: file, text: b64, imagePath: file });
  }

  /** cria um chip: pelo ContextManager quando existe (fonte única), senão localmente (mesmo teto). */
  private addChip(draft: DraftChip): void {
    if (this.contextManager) { this.contextManager.add(draft); return; }
    const cap = draft.kind === 'image' ? { text: draft.text ?? '', truncated: false } : truncateChipText(draft.text ?? '', CHIP_MAX_TOKENS);
    const id = `chip-${Date.now()}-${this.chips.length}`;
    this.setChips([
      ...this.chips,
      {
        id, kind: draft.kind, ref: draft.ref, label: draft.label, tokensEstimate: estimateTokens(cap.text),
        ...(draft.lines ? { lines: draft.lines } : {}),
        ...(draft.text !== undefined ? { text: cap.text } : {}),
        ...(draft.imagePath ? { imagePath: draft.imagePath } : {}),
        ...(draft.implicit ? { implicit: true } : {}),
        ...(cap.truncated ? { truncated: true } : {}),
      },
    ]);
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

  /* ─────────── abas ─────────── */

  private activeTab(): TabInfo | undefined { return this.tabs.find((t) => t.id === this.activeTabId); }

  /** Sessão viva da aba (por `sessionId`); sem aba, a ativa. */
  private sessionFor(tab?: string): HermesSession | undefined {
    const t = this.tabs.find((x) => x.id === (tab ?? this.activeTabId));
    const sid = t?.sessionId;
    return sid ? this.agents.allSessions.find((s) => s.sessionId === sid) : undefined;
  }

  /** Garante ao menos uma aba: a view nunca fica sem `activeTab` (o estado sem sessão mora numa aba). */
  private ensureTab(): TabInfo {
    if (this.tabs.length === 0) {
      const s = settings();
      const t: TabInfo = {
        id: `tab-${++this.tabSeq}`, title: `${tr('Conversa')} 1`, sessionId: null,
        cwd: workingDirectory(s), agent: activeAgent(s).name, busy: false,
      };
      this.tabs = [t];
      this.activeTabId = t.id;
    }
    return this.activeTab() ?? this.tabs[0];
  }

  /** Anuncia as abas e o estado da aba ativa (o estado das OUTRAS vive na webview). */
  private announce(): void {
    const state = this.initialState();
    this.post({ type: 'tabs', tabs: state.tabs, active: state.activeTab });
    this.post({ type: 'init', state });
  }

  private activateTab(tab: string): void {
    if (!this.tabs.some((t) => t.id === tab)) return;
    this.activeTabId = tab;
    this.announce();
  }

  /** Fechar a aba NÃO apaga a sessão: o histórico continua em `hermes sessions`. */
  private closeTab(tab: string): void {
    const i = this.tabs.findIndex((t) => t.id === tab);
    if (i < 0) return;
    this.tabs = this.tabs.filter((t) => t.id !== tab);
    if (this.activeTabId === tab) this.activeTabId = this.tabs[Math.min(i, this.tabs.length - 1)]?.id ?? '';
    this.ensureTab();
    this.announce();
  }

  private renameTab(tab: string, title: string): void {
    const t = this.tabs.find((x) => x.id === tab);
    if (!t) return;
    t.title = title.trim() || t.title;
    this.announce();
  }

  /**
   * Indicadores de lane (o `busy`/`waiting` de cada aba é o que a barra mostra): a sessão emite
   * com a aba selada, então aqui só espelhamos no `TabInfo` e reanunciamos quando muda.
   */
  private onAgentEvent(m: HostToWebview): void {
    const tab = (m as { tab?: string }).tab;
    if (tab) {
      const t = this.tabs.find((x) => x.id === tab);
      if (t) {
        let dirty = false;
        if (m.type === 'busy' && t.busy !== m.value) { t.busy = m.value; dirty = true; }
        if (m.type === 'permission/ask' && !t.waiting) { t.waiting = true; dirty = true; }
        if (m.type === 'permission/resolve' && t.waiting) { t.waiting = false; dirty = true; }
        if (m.type === 'session' && m.sessionId && t.sessionId !== m.sessionId) { t.sessionId = m.sessionId; dirty = true; }
        if (dirty) this.post({ type: 'tabs', tabs: this.tabs, active: this.activeTabId });
      }
    }
    this.post(m);
  }

  private initialState(): ChatState {
    const s = settings();
    const tab = this.ensureTab();
    const sess = this.sessionFor(tab.id);
    return {
      sessionId: sess?.sessionId ?? null,
      agent: tab.agent || activeAgent(s).name,
      busy: tab.busy,
      starting: tab.starting,
      tabs: this.tabs.map((t) => ({ ...t })),
      activeTab: this.activeTabId,
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
    // `tabs` é anúncio próprio (não deve obrigar a webview a reprocessar o estado) e não entra no
    // replay; `init`/`busy` também não (o `init` já é reconstruído no attach/ready). `draft/insert`
    // é uma ação de uma vez só — replay insere de novo ao reabrir a view.
    if (m.type !== 'init' && m.type !== 'busy' && m.type !== 'tabs' && m.type !== 'draft/insert') {
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
