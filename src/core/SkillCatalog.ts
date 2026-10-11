/**
 * Catálogo de skills — o ACP não expõe NENHUMA noção de skill (`configOptions` volta vazio).
 *
 * Fonte real: arquivos `SKILL.md` no perfil do Hermes (`$HERMES_HOME/skills`, respeitando a
 * variável de ambiente) e no projeto (`./.hermes/skills` e `./.agents/skills`).
 *
 * O frontmatter YAML é lido à mão — são poucas chaves simples (name, description, version,
 * tags, source) e não vale puxar um parser YAML novo. Nada de dependência adicional.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, type Dirent } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';

export type SkillScope = 'user' | 'project' | 'hub';

export interface Frontmatter {
  name?: string;
  description?: string;
  version?: string;
  tags: string[];
  /** declarado pela própria skill (`metadata.hermes.source: hub`) — nunca inferido */
  hub: boolean;
}

export interface SkillInfo {
  name: string;
  description: string;
  version?: string;
  tags: string[];
  path: string;
  scope: SkillScope;
}

export interface SkillRoot { path: string; scope: SkillScope; exists: boolean }

/** `$HERMES_HOME` antes de assumir `~/.hermes`. */
export function hermesHome(env: NodeJS.ProcessEnv = process.env): string {
  const h = env.HERMES_HOME?.trim();
  return h && h.length ? h : join(homedir(), '.hermes');
}

/* ─────────── frontmatter (YAML simples, à mão) ─────────── */

export function parseFrontmatter(text: string): Frontmatter {
  const out: Frontmatter = { tags: [], hub: false };
  const norm = text.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---/.exec(norm);
  if (!m) return out;
  const lines = m[1].split('\n');
  for (const line of lines) {
    const kv = /^(\s*)([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const indent = kv[1].length;
    const key = kv[2];
    const val = kv[3].trim();
    if (indent !== 0 || !val) continue;
    if (key === 'name') out.name = unquote(val);
    else if (key === 'description') out.description = unquote(val);
    else if (key === 'version') out.version = unquote(val);
  }
  out.tags = tagsFrom(lines);
  out.hub = lines.some((l) => /^\s*source:\s*['"]?hub['"]?\s*$/.test(l));
  return out;
}

/** Acha `tags:` (no topo ou sob `metadata.hermes`), inline ou em lista de blocos. */
function tagsFrom(lines: string[]): string[] {
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:metadata\.hermes\.)?tags:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const inline = m[2].trim();
    if (inline) return inlineTags(inline);
    const indent = m[1].length;
    const out: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim()) continue;
      const li = /^(\s*)-\s+(.+)$/.exec(l);
      if (!li || li[1].length <= indent) break;
      out.push(unquote(li[2].trim()));
    }
    return out;
  }
  return [];
}

function inlineTags(s: string): string[] {
  const t = s.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!t) return [];
  return t.split(',').map((x) => unquote(x.trim())).filter(Boolean);
}

function unquote(s: string): string {
  const t = s.trim();
  const quoted = (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"));
  return quoted && t.length >= 2 ? t.slice(1, -1) : t;
}

/** Primeiro parágrafo depois do frontmatter — descrição de reserva quando o YAML não traz uma. */
function firstParagraph(text: string): string {
  const body = text.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n?/, '');
  for (const raw of body.split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    return l.replace(/^[-*]\s+/, '');
  }
  return '';
}

export function parseSkill(text: string, path: string, scope: SkillScope, fallbackName: string): SkillInfo {
  const fm = parseFrontmatter(text);
  return {
    name: (fm.name ?? '').trim() || fallbackName,
    description: (fm.description ?? '').trim() || firstParagraph(text),
    version: fm.version,
    tags: fm.tags,
    path,
    scope: fm.hub ? 'hub' : scope,
  };
}

/* ─────────── varredura ─────────── */

function walk(dir: string, depth: number, out: string[]): void {
  if (depth < 0) return;
  let entries: Dirent[];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, depth - 1, out);
    else if (e.isFile() && e.name === 'SKILL.md') out.push(full);
  }
}

function readSafe(file: string): string {
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}

/** Lê todos os SKILL.md sob as raízes (projeto vem antes do perfil para o dedup). */
export function scanSkills(roots: SkillRoot[]): SkillInfo[] {
  const out: SkillInfo[] = [];
  const seen = new Set<string>();
  for (const r of roots) {
    if (!r.exists) continue;
    const files: string[] = [];
    walk(r.path, 6, files);
    for (const f of files) {
      if (seen.has(f)) continue;
      seen.add(f);
      out.push(parseSkill(readSafe(f), f, r.scope, basename(dirname(f))));
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'nova-skill';
}

/** Esqueleto de SKILL.md — mesmas chaves que o Hermes lê. */
export function skillSkeleton(name: string): string {
  return `---\nname: ${name}\ndescription: \nmetadata:\n  hermes:\n    tags: []\n---\n\n# ${name}\n\nQuando usar esta skill e o passo a passo.\n`;
}

export interface SkillCatalogOptions { home: string; workspace: string }

export class SkillCatalog {
  constructor(private readonly opts: SkillCatalogOptions) {}

  roots(): SkillRoot[] {
    const user = join(this.opts.home, 'skills');
    const projHermes = join(this.opts.workspace, '.hermes', 'skills');
    const projAgents = join(this.opts.workspace, '.agents', 'skills');
    return [
      { path: projHermes, scope: 'project', exists: existsSync(projHermes) },
      { path: projAgents, scope: 'project', exists: existsSync(projAgents) },
      { path: user, scope: 'user', exists: existsSync(user) },
    ];
  }

  list(): SkillInfo[] { return scanSkills(this.roots()); }

  filter(skills: SkillInfo[], scope?: SkillScope, query = ''): SkillInfo[] {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (scope && s.scope !== scope) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q));
    });
  }

  /** Caminho do SKILL.md para uma skill nova; cria a pasta se faltar. */
  newSkillPath(scope: 'user' | 'project', name: string): string {
    const base = scope === 'project'
      ? join(this.opts.workspace, '.hermes', 'skills')
      : join(this.opts.home, 'skills');
    const dir = join(base, slug(name));
    mkdirSync(dir, { recursive: true });
    return join(dir, 'SKILL.md');
  }

  createSkeleton(scope: 'user' | 'project', name: string): string {
    const file = this.newSkillPath(scope, name);
    if (!existsSync(file)) writeFileSync(file, skillSkeleton(name), 'utf8');
    return file;
  }
}
