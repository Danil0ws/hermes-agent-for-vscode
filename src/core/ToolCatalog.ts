/**
 * Catálogo de ferramentas e MCP — nada disso existe no ACP (`configOptions` volta vazio e
 * `set_config_option` é stub).
 *
 * Fonte real, só de leitura: `hermes config get <chave>` para `platform_toolsets.acp` e
 * `agent.disabled_toolsets`, e o estado por `hermes tools list` / `hermes mcp list`.
 * NUNCA escrevemos no config.yaml — quem escreve é `hermes config set/unset` (via terminal).
 *
 * Mudar toolset exige NOVA SESSÃO: o agente resolve as tools na criação da sessão, então a UI
 * avisa que a alteração só vale no próximo `session/new`.
 */
import { execFile } from 'node:child_process';
import { splitCommand } from './Connection';

export interface ToolsetItem { name: string; label: string; enabled: boolean }
export interface ToolGroup { kind: 'builtin' | 'plugin'; items: ToolsetItem[] }
export interface McpServer { name: string; transport: string; tools: string; status: string; enabled: boolean }

export interface ToolSnapshot {
  /** lista definida em `platform_toolsets.acp` (vazia = padrão do Hermes) */
  acpToolset: string[];
  /** true quando a chave não está no config.yaml (vale o padrão `hermes-acp`) */
  acpToolsetIsDefault: boolean;
  disabled: string[];
  groups: ToolGroup[];
  mcp: McpServer[];
  activeCount: number;
  totalCount: number;
  source: { configOk: boolean; toolsOk: boolean; mcpOk: boolean };
}

export type CliExec = (args: string[]) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

/** Executa a CLI capturando stdout (nunca num shell — sem injeção). Prefixos tipo `wsl hermes` valem. */
export function makeCliExec(command: string, cwd: string): CliExec {
  const { file, prefix } = splitCommand(command);
  return (args) => new Promise((resolve) => {
    execFile(
      file,
      [...prefix, ...args],
      { cwd, timeout: 10_000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' } },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }),
    );
  });
}

/* ─────────── parsers (puros) ─────────── */

/** Lista YAML simples: `[]`, `[a, b]` ou bloco `- item`. */
export function parseYamlList(text: string): string[] {
  const t = text.trim();
  if (!t || t === '[]') return [];
  if (t.startsWith('[')) return t.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
  return t.split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
}

/** Seções `Built-in toolsets (cli):` e `Plugin toolsets (cli):` de `hermes tools list`. */
export function parseToolsList(text: string): ToolGroup[] {
  const groups: ToolGroup[] = [];
  let section: 'builtin' | 'plugin' | 'mcp' | null = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^Built-in toolsets/i.test(line)) { group(groups, 'builtin'); section = 'builtin'; continue; }
    if (/^Plugin toolsets/i.test(line)) { group(groups, 'plugin'); section = 'plugin'; continue; }
    if (/^MCP servers:/i.test(line.trim())) { section = 'mcp'; continue; }
    if (section !== 'builtin' && section !== 'plugin') continue;
    const m = /^\s*(✓|✗)\s+(enabled|disabled)\s+(\S+)\s*(.*)$/.exec(line);
    if (!m) continue;
    const g = groups[groups.length - 1];
    g.items.push({ name: m[3], label: stripEmoji(m[4]), enabled: m[2] === 'enabled' });
  }
  return groups;
}

/** Tabela de `hermes mcp list`: colunas separadas por 2+ espaços. */
export function parseMcpList(text: string): McpServer[] {
  const out: McpServer[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || /^MCP Servers:/i.test(line) || /^Name\s/i.test(line)) continue;
    if (/^[─━-]+$/.test(line.replace(/\s/g, ''))) continue;
    if (!/(✓|✗)\s*(enabled|disabled)/.test(line)) continue;
    const cols = line.split(/\s{2,}/);
    if (cols.length < 3) continue;
    const status = /disabled/.test(cols[cols.length - 1]) ? 'disabled' : 'enabled';
    const name = cols[0];
    const rest = cols.slice(1, -1);
    out.push({ name, transport: rest[0] ?? '', tools: rest[1] ?? '', status, enabled: status === 'enabled' });
  }
  return out;
}

function group(groups: ToolGroup[], kind: 'builtin' | 'plugin'): void {
  groups.push({ kind, items: [] });
}

function stripEmoji(s: string): string {
  return s.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function unquote(s: string): string {
  const t = s.trim();
  const quoted = (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"));
  return quoted && t.length >= 2 ? t.slice(1, -1) : t;
}

/* ─────────── carga ─────────── */

export class ToolCatalog {
  constructor(private readonly run: CliExec) {}

  async load(): Promise<ToolSnapshot> {
    const [acp, disabled, tools, mcp] = await Promise.all([
      safe(this.run, ['config', 'get', 'platform_toolsets.acp']),
      safe(this.run, ['config', 'get', 'agent.disabled_toolsets']),
      safe(this.run, ['tools', 'list']),
      safe(this.run, ['mcp', 'list']),
    ]);
    const acpText = acp.stdout.trim();
    const acpSet = acp.ok && !!acpText && !/^Config key not set/i.test(acpText);
    const groups = tools.ok ? parseToolsList(tools.stdout) : [];
    const items = groups.flatMap((g) => g.items);
    return {
      acpToolset: acpSet ? parseYamlList(acpText) : [],
      acpToolsetIsDefault: !acpSet,
      disabled: disabled.ok ? parseYamlList(disabled.stdout) : [],
      groups,
      mcp: mcp.ok ? parseMcpList(mcp.stdout) : [],
      activeCount: items.filter((i) => i.enabled).length,
      totalCount: items.length,
      source: { configOk: acp.ok && disabled.ok, toolsOk: tools.ok, mcpOk: mcp.ok },
    };
  }
}

async function safe(run: CliExec, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try { return await run(args); } catch (e) { return { ok: false, stdout: '', stderr: String(e) }; }
}
