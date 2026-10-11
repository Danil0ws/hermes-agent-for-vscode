/**
 * ContextManager — dono dos chips de contexto da sessão.
 *
 * Regras:
 *  - tokens SEMPRE por `estimateTokens` (heurística única em utils/Tokens.ts) — nunca reimplementar;
 *  - o pick ÚNICO de "Adicionar contexto" (`#`, com `@` como alias) é montado aqui;
 *  - aviso de anexo grande usa `hermes.context.warnAt`;
 *  - chip IMPLÍCITO de seleção via `onDidChangeTextEditorSelection`, esmaecido e desligável;
 *  - nada de cor/fonte literal; strings em pt-BR.
 *
 * O módulo NÃO importa o runtime do `vscode` no topo (só tipos por `typeof import('vscode')`
 * e o módulo é recebido via `deps.vs`). Isso mantém a lógica pura importável num teste Node
 * sem o host do VS Code. Arquivos entram como TEXTO (o Hermes não anuncia `embeddedContext`).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ContextChip } from './types';
import { estimateTokens } from '../utils/Tokens';

const execFileAsync = promisify(execFile);

type VSCode = typeof import('vscode');

/** rascunho de chip: o que uma fonte produz antes de ganhar id e tokens. */
export interface DraftChip {
  kind: ContextChip['kind'];
  label: string;
  ref: string;
  lines?: [number, number];
  text?: string;
  imagePath?: string;
  implicit?: boolean;
}

/* ── lógica pura (testável sem o VS Code) ── */

/** estimativa do chip — sempre pela heurística única. */
export function chipTokens(text: string | undefined): number {
  return estimateTokens(text ?? '');
}

/** % da janela que o anexo ocupa (0 quando a janela é desconhecida). */
export function warningPercent(tokens: number, windowSize: number): number {
  return windowSize > 0 ? Math.round((tokens / windowSize) * 100) : 0;
}

/** avisa quando o anexo passa do limiar configurado (% da janela). */
export function shouldWarn(tokens: number, windowSize: number, warnAt: number): boolean {
  if (windowSize > 0) return warningPercent(tokens, windowSize) >= warnAt;
  // ponytail: sem janela reportada pelo agente não há %; limiar absoluto evita tanto alarme
  // falso quanto anexar um arquivo gigante em silêncio.
  return tokens >= 20_000;
}

/** linhas 1-based inclusivas (usado em "incluir trecho"). */
export function sliceLines(text: string, start: number, end: number): string {
  const lines = text.split('\n');
  const a = Math.max(1, Math.min(start, end));
  const b = Math.min(lines.length, Math.max(start, end));
  return lines.slice(a - 1, b).join('\n');
}

/** cabeça do arquivo para o "resumo local"; o agente resume de verdade quando você pedir. */
export function headLines(text: string, max: number): string {
  const lines = text.split('\n');
  return lines.length <= max ? text : lines.slice(0, max).join('\n');
}

export interface ContextManagerDeps {
  vs: VSCode;
  /** publica a lista ao host (a feature encaminha para a webview via `session.setChips`). */
  publish(chips: ContextChip[]): void;
  /** `hermes.context.warnAt` (%) */
  warnAt(): number;
  /** janela do modelo ativo, se o agente já reportou `usage_update`. */
  windowSize(): number | undefined;
  log(level: 'info' | 'warn' | 'error', text: string): void;
}

interface PickItem {
  label: string;
  description?: string;
  detail?: string;
  action: Action;
}

type Action =
  | { t: 'file' }
  | { t: 'folder' }
  | { t: 'symbol' }
  | { t: 'selection' }
  | { t: 'diagnostics' }
  | { t: 'terminal' }
  | { t: 'git' }
  | { t: 'url' }
  | { t: 'image' }
  | { t: 'file-ref'; path: string }
  | { t: 'symbol-ref'; path: string; line?: number; name: string };

export class ContextManager {
  private list: ContextChip[] = [];
  private pinned = new Set<string>();
  private implicitEnabled = true;
  private seq = 0;

  constructor(private readonly deps: ContextManagerDeps) {}

  get chips(): ContextChip[] { return [...this.list]; }

  /** total estimado dos chips ("estimado"). */
  sumTokens(): number { return this.list.reduce((n, c) => n + c.tokensEstimate, 0); }

  isPinned(id: string): boolean { return this.pinned.has(id); }

  add(draft: DraftChip): ContextChip {
    const chip: ContextChip = {
      id: `chip-${++this.seq}-${Date.now()}`,
      kind: draft.kind,
      label: draft.label,
      ref: draft.ref,
      tokensEstimate: chipTokens(draft.text),
      ...(draft.lines ? { lines: draft.lines } : {}),
      ...(draft.text !== undefined ? { text: draft.text } : {}),
      ...(draft.imagePath ? { imagePath: draft.imagePath } : {}),
      ...(draft.implicit ? { implicit: true } : {}),
    };
    this.list.push(chip);
    this.publish();
    return chip;
  }

  remove(id: string): void {
    const before = this.list.length;
    this.list = this.list.filter((c) => c.id !== id);
    this.pinned.delete(id);
    if (this.list.length !== before) this.publish();
  }

  clear(): void {
    if (!this.list.length) return;
    this.list = [];
    this.pinned.clear();
    this.publish();
  }

  /** "fixar": mantém o chip no topo da lista (o contrato não tem flag `pinned`). */
  togglePin(id: string): void {
    if (this.pinned.has(id)) this.pinned.delete(id);
    else this.pinned.add(id);
    this.list.sort((a, b) => Number(this.pinned.has(b.id)) - Number(this.pinned.has(a.id)));
    this.publish();
  }

  setImplicitEnabled(value: boolean): void {
    this.implicitEnabled = value;
    if (!value) this.setImplicitSelection(undefined);
  }

  isImplicitEnabled(): boolean { return this.implicitEnabled; }

  /**
   * Chip IMPLÍCITO de seleção (esmaecido, desligável). Guardado como um chip comum com
   * `implicit: true`; some quando a seleção fica vazia ou o implícito é desligado.
   */
  setImplicitSelection(info: { ref: string; label: string; text: string; lines: [number, number] } | undefined): void {
    const idx = this.list.findIndex((c) => c.implicit && c.kind === 'selection');
    const active = !!info && this.implicitEnabled && info.text.trim().length > 0;
    if (!active) {
      if (idx >= 0) { this.list.splice(idx, 1); this.publish(); }
      return;
    }
    const sel = info!;
    const existing = idx >= 0 ? this.list[idx] : undefined;
    // evita churn a cada movimento de cursor: só republica quando o texto/faixa muda.
    if (existing && existing.text === sel.text && existing.ref === sel.ref) return;
    const chip: ContextChip = {
      id: existing?.id ?? `chip-implicit-${Date.now()}`,
      kind: 'selection',
      label: sel.label,
      ref: sel.ref,
      lines: sel.lines,
      text: sel.text,
      tokensEstimate: chipTokens(sel.text),
      implicit: true,
    };
    if (idx >= 0) this.list[idx] = chip; else this.list.unshift(chip);
    this.publish();
  }

  /** assina `onDidChangeTextEditorSelection` para o chip implícito. */
  watchSelection(): { dispose(): void } {
    const vs = this.deps.vs;
    return vs.window.onDidChangeTextEditorSelection((e) => {
      const editor = e.textEditor;
      const sel = editor.selection;
      if (sel.isEmpty) { this.setImplicitSelection(undefined); return; }
      const text = editor.document.getText(sel);
      const ref = editor.document.uri.fsPath;
      const lines: [number, number] = [sel.start.line + 1, sel.end.line + 1];
      const label = `${vs.workspace.asRelativePath(editor.document.uri)} L${lines[0]}–L${lines[1]}`;
      this.setImplicitSelection({ ref, label, text, lines });
    });
  }

  /* ───────── pick ÚNICO de contexto (`#`; `@` alias) ───────── */

  /** monta o QuickPick único com busca fuzzy e todas as fontes. `source` só loga a origem. */
  async pick(source?: string): Promise<void> {
    const vs = this.deps.vs;
    const qp = vs.window.createQuickPick<PickItem>();
    qp.title = 'Adicionar contexto';
    qp.placeholder = 'Arquivos, pastas, símbolos, problemas, terminal, Git, URL, imagem…';
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;

    const meta = (): PickItem[] => [
      { label: '$(file) Arquivo…', detail: 'do workspace', action: { t: 'file' } },
      { label: '$(folder) Pasta…', action: { t: 'folder' } },
      { label: '$(symbol-method) Símbolo…', action: { t: 'symbol' } },
      { label: '$(selection) Seleção atual', action: { t: 'selection' } },
      { label: '$(warning) Problemas (diagnósticos)', action: { t: 'diagnostics' } },
      { label: '$(terminal) Terminal (última saída)', action: { t: 'terminal' } },
      { label: '$(git-commit) Alterações do Git', action: { t: 'git' } },
      { label: '$(link) URL…', action: { t: 'url' } },
      { label: '$(file-media) Imagem…', action: { t: 'image' } },
    ];

    const files = await vs.workspace.findFiles('**/*', '**/{node_modules,.git,dist,out,.venv,__pycache__}/**', 500);
    const fileItems: PickItem[] = files.map((f) => ({
      label: `$(file) ${vs.workspace.asRelativePath(f)}`,
      detail: f.fsPath,
      action: { t: 'file-ref', path: f.fsPath },
    }));

    qp.items = [...meta(), ...fileItems];
    qp.onDidChangeValue((value) => {
      const q = value.trim();
      if (!q) { qp.items = [...meta(), ...fileItems]; return; }
      void this.symbolItems(q).then((syms) => { qp.items = [...syms, ...fileItems]; });
    });
    qp.onDidAccept(() => {
      const it = qp.selectedItems[0];
      qp.hide();
      if (it) void this.resolve(it.action);
    });
    qp.onDidHide(() => qp.dispose());
    qp.show();
    this.deps.log('info', `pick de contexto${source ? ` (origem: ${source})` : ''}`);
  }

  private async symbolItems(query: string): Promise<PickItem[]> {
    const vs = this.deps.vs;
    try {
      const syms = (await vs.commands.executeCommand(
        'vscode.executeWorkspaceSymbolProvider', query,
      )) as Array<{ name: string; location: { uri: { fsPath: string }; range: { start: { line: number } } } }> | undefined;
      return (syms ?? []).slice(0, 50).map((s) => ({
        label: `$(symbol-method) ${s.name}`,
        detail: `${vs.workspace.asRelativePath(s.location.uri as never)}:${s.location.range.start.line + 1}`,
        action: { t: 'symbol-ref', path: s.location.uri.fsPath, line: s.location.range.start.line + 1, name: s.name },
      }));
    } catch (err) {
      this.deps.log('warn', `workspace symbol provider falhou: ${String(err)}`);
      return [];
    }
  }

  private async resolve(action: Action): Promise<void> {
    const vs = this.deps.vs;
    try {
      switch (action.t) {
        case 'file': {
          const picked = await vs.window.showOpenDialog({ canSelectMany: true, canSelectFiles: true, canSelectFolders: false });
          for (const uri of picked ?? []) await this.attachFile(uri.fsPath);
          return;
        }
        case 'folder': {
          const picked = await vs.window.showOpenDialog({ canSelectMany: false, canSelectFiles: false, canSelectFolders: true });
          if (picked?.[0]) await this.attachFolder(picked[0].fsPath);
          return;
        }
        case 'file-ref':
          await this.attachFile(action.path);
          return;
        case 'symbol':
          await this.pick('symbol');
          return;
        case 'symbol-ref':
          this.add({ kind: 'symbol', label: action.name, ref: `${action.path}${action.line ? `:${action.line}` : ''}`, lines: action.line ? [action.line, action.line] : undefined });
          return;
        case 'selection':
          this.attachCurrentSelection();
          return;
        case 'diagnostics':
          await this.attachDiagnostics();
          return;
        case 'terminal':
          await this.attachTerminal();
          return;
        case 'git':
          await this.attachGit();
          return;
        case 'url': {
          const url = await vs.window.showInputBox({ title: 'Adicionar URL', prompt: 'Endereço (entra como referência textual).' });
          if (url?.trim()) this.add({ kind: 'url', label: url.trim(), ref: url.trim(), text: url.trim() });
          return;
        }
        case 'image':
          await this.attachImage();
          return;
      }
    } catch (err) {
      this.deps.log('error', `falha ao anexar contexto: ${String(err)}`);
      void vs.window.showWarningMessage(`Não foi possível anexar: ${String(err)}`);
    }
  }

  private async attachFile(path: string): Promise<void> {
    const vs = this.deps.vs;
    const text = new TextDecoder().decode(await vs.workspace.fs.readFile(vs.Uri.file(path)));
    await this.attachText({ kind: 'file', label: vs.workspace.asRelativePath(vs.Uri.file(path)), ref: path }, text);
  }

  private async attachFolder(path: string): Promise<void> {
    const vs = this.deps.vs;
    const entries = await vs.workspace.fs.readDirectory(vs.Uri.file(path));
    const listing = entries.map(([name, type]) => `${type === vs.FileType.Directory ? 'd' : '-'} ${name}`).join('\n');
    // ponytail: pasta entra como listagem (nomes), não recursão — o agente lê os arquivos que importam.
    this.add({ kind: 'folder', label: vs.workspace.asRelativePath(vs.Uri.file(path)), ref: path, text: listing });
  }

  private attachCurrentSelection(): void {
    const vs = this.deps.vs;
    const editor = vs.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) { void vs.window.showInformationMessage('Sem seleção no editor.'); return; }
    const sel = editor.selection;
    const text = editor.document.getText(sel);
    const lines: [number, number] = [sel.start.line + 1, sel.end.line + 1];
    this.add({ kind: 'selection', label: `${vs.workspace.asRelativePath(editor.document.uri)} L${lines[0]}–L${lines[1]}`, ref: editor.document.uri.fsPath, text, lines });
  }

  private async attachDiagnostics(): Promise<void> {
    const vs = this.deps.vs;
    const all = vs.languages.getDiagnostics();
    const rows: string[] = [];
    const byFile: string[] = [];
    for (const [uri, diags] of all) {
      if (!diags.length) continue;
      byFile.push(uri.fsPath);
      for (const d of diags) {
        const sev = ['', 'erro', 'aviso', 'info', 'dica'][d.severity] ?? 'info';
        rows.push(`${vs.workspace.asRelativePath(uri)}:${d.range.start.line + 1} [${sev}] ${d.message}`);
      }
    }
    if (!rows.length) { void vs.window.showInformationMessage('Sem problemas no workspace.'); return; }
    this.add({ kind: 'diagnostic', label: `${rows.length} problema(s)`, ref: byFile[0] ?? 'diagnostics', text: rows.join('\n') });
  }

  private async attachTerminal(): Promise<void> {
    const vs = this.deps.vs;
    const term = vs.window.activeTerminal;
    if (!term) { void vs.window.showInformationMessage('Sem terminal ativo.'); return; }
    // A API de buffer do terminal ainda é proposta: usa se existir, senão copia a seleção.
    const win = vs.window as unknown as { onDidWriteTerminalData?: (cb: (e: { data: string }) => void) => { dispose(): void } };
    let text = '';
    if (win.onDidWriteTerminalData) {
      // não há histórico retroativo: anexa um aviso claro em vez de inventar a saída.
      text = `(saída do terminal "${term.name}" não é recuperável retroativamente por esta API)`;
    } else {
      await vs.commands.executeCommand('workbench.action.terminal.copySelection');
      text = await vs.env.clipboard.readText();
    }
    if (!text.trim()) { void vs.window.showInformationMessage('Sem saída do terminal para anexar.'); return; }
    this.add({ kind: 'terminal', label: `Terminal: ${term.name}`, ref: 'terminal', text });
  }

  private async attachGit(): Promise<void> {
    const vs = this.deps.vs;
    const cwd = vs.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!cwd) { void vs.window.showInformationMessage('Sem pasta de workspace.'); return; }
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--no-color'], { cwd, maxBuffer: 8 * 1024 * 1024 });
      if (!stdout.trim()) { void vs.window.showInformationMessage('Sem alterações não commitadas.'); return; }
      await this.attachText({ kind: 'git', label: 'Alterações do Git (git diff)', ref: cwd }, stdout);
    } catch (err) {
      this.deps.log('warn', `git diff falhou: ${String(err)}`);
      void vs.window.showWarningMessage('Não foi possível ler as alterações do Git.');
    }
  }

  private async attachImage(): Promise<void> {
    const vs = this.deps.vs;
    const picked = await vs.window.showOpenDialog({
      canSelectMany: false,
      filters: { Imagens: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
    });
    const uri = picked?.[0];
    if (!uri) return;
    const bytes = await vs.workspace.fs.readFile(uri);
    const base64 = Buffer.from(bytes).toString('base64');
    // o contrato envia a imagem pelo ContentBlock::image; aqui só guardamos o dado base64.
    this.add({ kind: 'image', label: vs.workspace.asRelativePath(uri), ref: uri.fsPath, text: base64, imagePath: uri.fsPath });
  }

  /* ───────── aviso de tamanho (§4.3) ───────── */

  /** anexa texto passando pelo aviso de tamanho quando ele passa do limiar. */
  private async attachText(base: Omit<DraftChip, 'text'>, text: string): Promise<void> {
    const tokens = chipTokens(text);
    const win = this.deps.windowSize() ?? 0;
    let body = text;
    if (shouldWarn(tokens, win, this.deps.warnAt())) {
      const mode = await this.askLarge(base.label, tokens, win);
      if (!mode) return; // cancelou
      if (mode === 'range') {
        const ranged = await this.askRange(text);
        if (ranged === undefined) return;
        body = ranged;
      } else if (mode === 'summary') {
        const head = headLines(text, 200);
        body = `[resumo local, estimado — ${head.split('\n').length} de ${text.split('\n').length} linhas]\n${head}`;
      }
    }
    this.add({ ...base, text: body });
  }

  private async askLarge(label: string, tokens: number, windowSize: number): Promise<'all' | 'range' | 'summary' | undefined> {
    const vs = this.deps.vs;
    const k = (tokens / 1000).toFixed(1);
    const pct = windowSize > 0 ? `${warningPercent(tokens, windowSize)}% da janela do modelo ativo` : 'janela do agente ainda não reportada';
    const pick = await vs.window.showQuickPick(
      [
        { label: 'Incluir tudo', action: 'all' as const },
        { label: 'Incluir trecho (definir intervalo)', action: 'range' as const },
        { label: 'Resumir', action: 'summary' as const },
      ],
      { title: `Anexar ${label}`, placeHolder: `≈ ${k}k tokens — cerca de ${pct}.`, ignoreFocusOut: true },
    );
    return pick?.action;
  }

  private async askRange(text: string): Promise<string | undefined> {
    const vs = this.deps.vs;
    const total = text.split('\n').length;
    const answer = await vs.window.showInputBox({
      title: 'Incluir trecho',
      prompt: `Intervalo de linhas (1–${total}), ex.: 40-78`,
      validateInput: (v) => (/^\d+\s*-\s*\d+$/.test(v.trim()) ? undefined : 'Use o formato início-fim, ex.: 40-78'),
    });
    if (!answer) return undefined;
    const [a, b] = answer.split('-').map((n) => parseInt(n.trim(), 10));
    return sliceLines(text, a, b);
  }

  private publish(): void { this.deps.publish(this.chips); }
}
