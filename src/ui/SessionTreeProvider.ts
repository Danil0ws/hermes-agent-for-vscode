/**
 * TreeView "Hermes Sessions" (view `hermes.sessions`) e a lógica PURA de agrupamento/forma-
 * tação — exportada para os testes rodarem sem o VS Code.
 *
 * O módulo NÃO importa o RUNTIME do VS Code no topo (só tipos): o namespace é injetado no
 * construtor. Assim `src/test/sessions.test.ts` importa as funções puras sem arrastar `vscode`.
 *
 * O ACP não informa "rodando/erro" por sessão (ARCHITECTURE §11.3): o estado é derivado e chega
 * pronto em `SessionRow.state`; aqui só escolhemos rótulo/ícone/cor por token de tema.
 */
import type * as vscode from 'vscode';
import { tr } from '../l10n';

type Vs = typeof import('vscode');

/** Estado derivado no cliente (é um superconjunto do `SessionSummary['state']` do ACP). */
export type SessionState = 'idle' | 'running' | 'waiting' | 'error' | 'done';

/** Uma linha da árvore: o `SessionSummary` do ACP + o que o cliente sabe (modelo, estado). */
export interface SessionRow {
  sessionId: string;
  title?: string;
  cwd?: string;
  updatedAt?: string;
  state: SessionState;
  pending: number;
  model?: string;
}

export type Period = 'today' | 'yesterday' | 'earlier';

export interface SessionGroup { period: Period; label: string; rows: SessionRow[] }

export type SessionNode =
  | { kind: 'group'; group: SessionGroup }
  | { kind: 'session'; row: SessionRow }
  | { kind: 'empty' };

/* ─────────── rótulos / ícones (Codicon) / cor (token de tema) por estado ─────────── */

export const STATE_LABEL: Record<SessionState, string> = {
  running: 'rodando',
  waiting: 'aguardando aprovação',
  idle: 'ocioso',
  done: 'concluído',
  error: 'erro',
};

/** ids de Codicon para `ThemeIcon` — sem emoji. */
export const STATE_ICON: Record<SessionState, string> = {
  running: 'sync~spin',
  waiting: 'bell',
  idle: 'circle-outline',
  done: 'check',
  error: 'error',
};

/** Nome de cor do tema; `undefined` = cor padrão do item. Nunca um valor de cor literal. */
export const STATE_COLOR: Record<SessionState, string | undefined> = {
  running: 'charts.blue',
  waiting: 'charts.yellow',
  done: 'testing.iconPassed',
  error: 'charts.red',
  idle: undefined,
};

/* ─────────── lógica pura (testável sem VS Code) ─────────── */

function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }

/** Hoje / Ontem / Anteriores pelo calendário LOCAL. Data ausente ou inválida cai em "Anteriores". */
export function periodOf(updatedAt: string | undefined, now: Date): Period {
  const d = parseDate(updatedAt);
  if (!d) return 'earlier';
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return 'earlier';
}

/** Tempo relativo em pt-BR. Sem data → "—" (nunca um tempo inventado). */
export function relativeTime(updatedAt: string | undefined, now: Date): string {
  const d = parseDate(updatedAt);
  if (!d) return '—';
  const ms = now.getTime() - d.getTime();
  if (ms < 60_000) return 'agora';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `há ${days} d`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** Contador de pendências: vazio em zero, singular/plural depois. */
export function formatPending(n: number): string {
  if (!n || n <= 0) return '';
  return n === 1 ? '1 pendência' : `${n} pendências`;
}

/** Título exibido: o do agente, ou um rótulo derivado do ID (nunca uma string vazia). */
export function rowLabel(row: SessionRow): string {
  const t = row.title?.trim();
  return t && t.length ? t : `Sessão ${row.sessionId.slice(0, 8)}`;
}

/** Descrição do item: modelo · tempo relativo · pendências — o que não se sabe, some. */
export function describeRow(row: SessionRow, now: Date): string {
  return [row.model?.trim() || '', relativeTime(row.updatedAt, now), formatPending(row.pending)]
    .filter(Boolean)
    .join(' · ');
}

/** Agrupa em Hoje/Ontem/Anteriores, mais recente primeiro dentro de cada grupo. */
export function groupSessions(rows: SessionRow[], now: Date): SessionGroup[] {
  const buckets = new Map<Period, SessionRow[]>();
  for (const r of rows) {
    const p = periodOf(r.updatedAt, now);
    const list = buckets.get(p);
    if (list) list.push(r); else buckets.set(p, [r]);
  }
  const order: Period[] = ['today', 'yesterday', 'earlier'];
  const labels: Record<Period, string> = { today: 'Hoje', yesterday: 'Ontem', earlier: 'Anteriores' };
  const out: SessionGroup[] = [];
  for (const p of order) {
    const list = buckets.get(p);
    if (!list?.length) continue;
    list.sort((a, b) => (parseDate(b.updatedAt)?.getTime() ?? 0) - (parseDate(a.updatedAt)?.getTime() ?? 0));
    out.push({ period: p, label: labels[p], rows: list });
  }
  return out;
}

/* ─────────── TreeDataProvider ─────────── */

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionNode>, vscode.Disposable {
  private rows: SessionRow[] = [];
  private readonly emitter: vscode.EventEmitter<void>;
  readonly onDidChangeTreeData: vscode.Event<void>;

  /** `vs` = o namespace do VS Code, injetado (mantém o módulo livre do runtime do editor). */
  constructor(private readonly vs: Vs, private readonly cliNote: string) {
    const Emitter = this.vs.EventEmitter;
    this.emitter = new Emitter<void>();
    this.onDidChangeTreeData = this.emitter.event;
  }

  setRows(rows: SessionRow[]): void { this.rows = rows; this.emitter.fire(); }
  refresh(): void { this.emitter.fire(); }

  getTreeItem(node: SessionNode): vscode.TreeItem {
    const vs = this.vs;
    if (node.kind === 'group') {
      const item = new vs.TreeItem(node.group.label, vs.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'hermes.sessionGroup';
      item.description = String(node.group.rows.length);
      return item;
    }
    if (node.kind === 'empty') {
      const item = new vs.TreeItem('Nenhuma sessão', vs.TreeItemCollapsibleState.None);
      item.contextValue = 'hermes.sessionEmpty';
      // Honestidade: sem conexão/sem sessão o `session/list` não devolve nada; não fingimos dados.
      item.tooltip = 'Inicie uma conversa. A lista depende de o Hermes estar conectado (session/list).';
      return item;
    }
    const row = node.row;
    const item = new vs.TreeItem(rowLabel(row), vs.TreeItemCollapsibleState.None);
    const color = STATE_COLOR[row.state];
    item.iconPath = color
      ? new vs.ThemeIcon(STATE_ICON[row.state], new vs.ThemeColor(color))
      : new vs.ThemeIcon(STATE_ICON[row.state]);
    item.description = describeRow(row, new Date());
    item.tooltip = this.tooltip(row);
    item.contextValue = 'hermes.session';
    item.id = row.sessionId;
    item.command = { command: 'hermes.sessions.open', title: tr('Abrir sessão'), arguments: [row.sessionId] };
    return item;
  }

  getChildren(node?: SessionNode): SessionNode[] {
    if (!node) {
      if (!this.rows.length) return [{ kind: 'empty' }];
      return groupSessions(this.rows, new Date()).map((group) => ({ kind: 'group', group }));
    }
    if (node.kind === 'group') return node.group.rows.map((row) => ({ kind: 'session', row }));
    return [];
  }

  dispose(): void { this.emitter.dispose(); }

  private tooltip(row: SessionRow): vscode.MarkdownString {
    const md = new this.vs.MarkdownString();
    md.appendMarkdown(`**${rowLabel(row)}**\n\n`);
    md.appendMarkdown(`- Estado: ${STATE_LABEL[row.state]}\n`);
    if (row.model) md.appendMarkdown(`- Modelo: ${row.model}\n`);
    md.appendMarkdown(`- Atualizada: ${relativeTime(row.updatedAt, new Date())}\n`);
    if (row.cwd) md.appendMarkdown(`- Pasta: \`${row.cwd}\`\n`);
    md.appendMarkdown(`- ID: \`${row.sessionId}\`\n\n`);
    md.appendMarkdown(this.cliNote);
    md.isTrusted = false;
    return md;
  }
}
