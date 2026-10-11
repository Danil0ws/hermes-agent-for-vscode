/**
 * Lógica pura da webview do chat — sem DOM, sem sinais, sem vscode.
 *
 * Vive separada para ser testável isoladamente (`src/test/webview.test.ts`).
 */
import type { ContextChip, SlashCommand } from '../../src/core/types';

/* ─────────── tokens ─────────── */

/**
 * Heurística chars/4 — espelha `src/utils/Tokens.ts::estimateTokens`.
 * ponytail: duplicado porque aquele módulo importa `node:fs` (não empacota na webview);
 * extrair um helper isomórfico quando o host quiser fonte única de verdade.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function percent(used: number, size: number): number {
  return size > 0 ? Math.round((used / size) * 100) : 0;
}

export function meterLevel(used: number, size: number): 'ok' | 'warn' | 'critical' {
  if (size <= 0) return 'ok';
  const pct = (used / size) * 100;
  if (pct > 90) return 'critical';
  if (pct >= 70) return 'warn';
  return 'ok';
}

/* ─────────── medidor: detalhamento por categoria ─────────── */

export interface BreakdownRow { id: string; tokens: number | null; measured: boolean }

export interface Breakdown {
  rows: BreakdownRow[];
  used: number;
  size: number;
  pct: number | null;
  attributed: number;
  unassigned: number;
}

/**
 * Detalhamento local por categoria. `usage_update` só dá o total; o resto é estimado
 * (chars/4) e SEMPRE rotulado. Instruções e Ferramentas/MCP não chegam à webview → `null`.
 */
export function breakdown(input: {
  used?: number; size?: number; chips: ContextChip[]; historyChars: number; thoughtTokens?: number;
}): Breakdown {
  const size = input.size ?? 0;
  const used = input.used ?? 0;
  let files = 0;
  let skills = 0;
  for (const c of input.chips) {
    if (c.kind === 'skill') skills += c.tokensEstimate;
    else files += c.tokensEstimate;
  }
  const history = estimateTokens('x'.repeat(input.historyChars));
  const reasoning = typeof input.thoughtTokens === 'number' ? input.thoughtTokens : null;
  const attributed = files + skills + history + (reasoning ?? 0);
  const unassigned = Math.max(0, used - attributed);
  const rows: BreakdownRow[] = [
    { id: 'instructions', tokens: null, measured: false },
    { id: 'skills', tokens: skills, measured: false },
    { id: 'tools', tokens: null, measured: false },
    { id: 'files', tokens: files, measured: false },
    { id: 'history', tokens: history, measured: false },
    { id: 'reasoning', tokens: reasoning, measured: true },
    { id: 'unassigned', tokens: unassigned, measured: false },
  ];
  return { rows, used, size, pct: size > 0 ? percent(used, size) : null, attributed, unassigned };
}

/* ─────────── virtualização ─────────── */

/** Janela de renderização: só os últimos `limit` itens (transcript pode ter milhares). */
export function visibleTurns<T>(all: T[], limit: number): T[] {
  if (limit >= all.length) return all;
  return all.slice(all.length - limit);
}

/* ─────────── markdown mínimo: cercas ``` ─────────── */

export type Segment =
  | { type: 'text'; text: string }
  | { type: 'code'; lang: string; code: string };

/** Separa texto e blocos de código cercados (```). Sem markdown completo — sem dependência. */
export function splitFenced(src: string): Segment[] {
  const out: Segment[] = [];
  const lines = src.split('\n');
  let buf: string[] = [];
  let code: string[] | null = null;
  let lang = '';
  const flush = () => { if (buf.length) { out.push({ type: 'text', text: buf.join('\n') }); buf = []; } };
  for (const line of lines) {
    const m = /^```([\w+-]*)\s*$/.exec(line);
    if (m) {
      if (code === null) { flush(); code = []; lang = m[1]; }
      else { out.push({ type: 'code', lang, code: code.join('\n') }); code = null; lang = ''; }
      continue;
    }
    (code ?? buf).push(line);
  }
  if (code !== null) out.push({ type: 'code', lang, code: code.join('\n') });
  flush();
  return out;
}

/* ─────────── popovers do composer ─────────── */

export interface TriggerToken { type: 'slash' | 'hash'; query: string; start: number }

/** Acha o token `/`ou `#` sob o cursor (início do popover). */
export function triggerToken(text: string, caret: number): TriggerToken | null {
  const m = /(^|\s)([/#])(\S*)$/.exec(text.slice(0, caret));
  if (!m) return null;
  return { type: m[2] === '/' ? 'slash' : 'hash', query: m[3], start: caret - m[3].length - 1 };
}

/** Comandos que casam com a consulta (`/`): prefixo ou contém. */
export function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const q = query.toLowerCase();
  if (!q) return commands;
  return commands.filter((c) => c.name.toLowerCase().replace(/^\//, '').includes(q));
}

/** Substitui o token sob o cursor por `replacement`. */
export function replaceToken(text: string, tok: TriggerToken, replacement: string): string {
  const caret = tok.start + 1 + tok.query.length;
  return text.slice(0, tok.start) + replacement + text.slice(caret);
}

/* ─────────── fila: reordenar por arrastar ─────────── */

/** Sequência de deltas ±1 que leva o item de `from` a `to` (a fila do host só aceita delta). */
export function moveDeltas(from: number, to: number): number[] {
  if (from === to || from < 0 || to < 0) return [];
  const dir = from < to ? 1 : -1;
  return Array.from({ length: Math.abs(to - from) }, () => dir);
}

/** Navegação do histórico de prompts (↑/↓ no composer). */
export function historyNavigate(history: string[], idx: number, dir: -1 | 1): { idx: number; text: string } {
  if (history.length === 0) return { idx: -1, text: '' };
  if (dir === -1) {
    const i = idx < 0 ? history.length - 1 : Math.max(0, idx - 1);
    return { idx: i, text: history[i] };
  }
  const i = idx + 1;
  if (i >= history.length) return { idx: -1, text: '' };
  return { idx: i, text: history[i] };
}

/* ─────────── guarda de reidratação ─────────── */

/** `hydrate` traz `unknown[]` (transcript persistido) — aceita só o que tem forma de turno. */
export function coerceTurns(raw: unknown[]): Array<{
  id: string; role: 'user' | 'agent'; text: string; chips?: ContextChip[]; startedAt: number;
}> {
  const out: Array<{ id: string; role: 'user' | 'agent'; text: string; chips?: ContextChip[]; startedAt: number }> = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.text !== 'string') continue;
    const role = o.role === 'user' ? 'user' : 'agent';
    out.push({
      id: typeof o.id === 'string' ? o.id : `h${out.length}`,
      role,
      text: o.text,
      chips: Array.isArray(o.chips) ? (o.chips as ContextChip[]) : undefined,
      startedAt: typeof o.startedAt === 'number' ? o.startedAt : 0,
    });
  }
  return out;
}
