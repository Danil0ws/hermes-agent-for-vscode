/**
 * Feature "context" — integra ContextManager (chips), WorkingSet (arquivos alterados) e
 * ContextView (painel de contexto) e registra os comandos da lane.
 *
 * Comandos: `hermes.context.manage`, `hermes.keepFile`, `hermes.undoFile`, `hermes.queue.toggle`
 * (+ `hermes.context.add`/`hermes.context.remove`, que são o alvo do roteamento das mensagens
 * `addContext`/`removeChip` da webview — ver relatório).
 *
 * Publicação dos chips para a webview passa pelo provider (`setChips`), o único ponto de escrita:
 * o `ContextManager` publica e o provider espelha na webview e na sessão ativa. Chip anexado antes
 * de existir sessão NÃO é descartado — ele vive na lista do host até a conversa começar.
 * Nada de cor/fonte literal; strings em pt-BR.
 */
import * as vscode from 'vscode';
import { homedir } from 'node:os';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { estimateTokens } from '../utils/Tokens';
import { settings } from '../config/Settings';
import { ContextManager } from '../core/ContextManager';
import { WorkingSet } from '../core/WorkingSet';
import { ContextView, type ContextGroup } from '../ui/ContextView';
import type { HermesSession } from '../core/HermesSession';
import type { Feature, FeatureDeps } from './registry';
import { tr } from '../l10n';

export interface ContextApi {
  manager: ContextManager;
  workingSet: WorkingSet;
  view: ContextView;
}

let api: ContextApi | undefined;
/** acesso entre features (a lane "editor" usa para anexar chips). */
export function contextApi(): ContextApi | undefined { return api; }

export const feature: Feature = {
  id: 'context',
  register(ctx: vscode.ExtensionContext, deps: FeatureDeps): void {
    const log = deps.log;
    const session = () => deps.agents.session;

    const manager = new ContextManager({
      vs: vscode,
      publish: (chips) => deps.provider.setChips(chips),
      warnAt: () => settings().contextWarnAt,
      windowSize: () => session()?.snapshot.usage?.size,
      log,
    });
    // o provider é o dono da lista: anexos por arquivo/seleção entram por ele, não numa cópia.
    deps.provider.setContextManager(manager);

    const workingSet = new WorkingSet({
      changed: () => session()?.changedFiles ?? [],
      diffsFor: (p) => session()?.diffsFor(p) ?? [],
      readFile: async (p) => new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(p))),
      applyEdit: (p, content) => applyContent(vscode.Uri.file(p), content),
      confirm: async (message) => (await vscode.window.showWarningMessage(message, { modal: true }, tr('Desfazer'))) === tr('Desfazer'),
      notify: (message) => void vscode.window.showInformationMessage(message),
      log,
    });

    const view = new ContextView({
      vs: vscode,
      buildGroups: () => buildGroups(manager, session()),
      usage: () => session()?.snapshot.usage,
      canCompact: () => !(session()?.busy ?? false),
      onCompact: async () => {
        const s = session();
        if (!s) { void vscode.window.showInformationMessage(tr('Sem sessão para compactar.')); return; }
        if (s.busy) { void vscode.window.showInformationMessage(tr('Aguarde o turno ou cancele antes de compactar.')); return; }
        await s.prompt('/compress', []);
      },
      onNewConversation: async () => { await vscode.commands.executeCommand('hermes.newConversation'); },
      onRemove: (id) => manager.remove(id),
      onPin: (id) => manager.togglePin(id),
      log,
    });

    api = { manager, workingSet, view };

    const reg = (id: string, fn: (...args: never[]) => unknown) => ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

    reg('hermes.context.manage', () => view.show());
    reg('hermes.context.add', (source?: string) => manager.pick(source));
    reg('hermes.context.remove', (id?: string) => { if (typeof id === 'string') manager.remove(id); else manager.clear(); });
    reg('hermes.context.toggleImplicit', () => { manager.setImplicitEnabled(!manager.isImplicitEnabled()); });
    reg('hermes.keepFile', (path?: string) => pickFile(workingSet, path, (p) => workingSet.keep(p)));
    reg('hermes.undoFile', (path?: string) => pickFile(workingSet, path, (p) => void workingSet.undo(p)));
    reg('hermes.queue.toggle', async () => {
      const c = vscode.workspace.getConfiguration('hermes');
      const next = !c.get<boolean>('queue.enabled', true);
      await c.update('queue.enabled', next, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(tr(`Fila de prompts ${next ? tr('ligada') : tr('desligada')}.`));
    });

    ctx.subscriptions.push(manager.watchSelection() as unknown as vscode.Disposable);
    ctx.subscriptions.push(view);
    log('info', 'feature context: ContextManager, WorkingSet e ContextView registrados');
  },
};

/* ───────── helpers ───────── */

/** grava `content` como conteúdo inteiro do arquivo via WorkspaceEdit (o inverso do agente). */
async function applyContent(uri: vscode.Uri, content: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), content);
  await vscode.workspace.applyEdit(edit);
  await doc.save();
}

async function pickFile(workingSet: WorkingSet, path: string | undefined, fn: (path: string) => void): Promise<void> {
  if (path) { fn(path); return; }
  const files = workingSet.details();
  if (!files.length) { void vscode.window.showInformationMessage(tr('Nenhum arquivo alterado nesta sessão.')); return; }
  const chosen = await vscode.window.showQuickPick(
    files.map((f) => ({ label: f.path, description: `${f.status} +${f.added} −${f.removed}` })),
    { title: tr('Arquivo alterado') },
  );
  if (chosen) fn(chosen.label);
}

/* ───────── grupos do painel de contexto (fontes reais, nunca inventadas) ───────── */

function buildGroups(manager: ContextManager, session: HermesSession | undefined): ContextGroup[] {
  const home = homedir();
  const size = session?.snapshot.usage?.size ?? 0;
  const used = session?.snapshot.usage?.used ?? 0;
  const pct = (tokens: number) => (size > 0 ? Math.round((tokens / size) * 100) : 0);

  /* Instruções do sistema/projeto */
  const instructionDirs = [home + '/.hermes', ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath)];
  const instructionNames = ['AGENTS.md', '.hermes.md', 'CLAUDE.md', 'SOUL.md'];
  const instructions = [];
  for (const dir of instructionDirs) {
    for (const name of instructionNames) {
      const p = join(dir, name);
      const text = safeRead(p);
      if (text !== undefined) instructions.push({ id: p, label: p.replace(home, '~'), tokens: estimateTokens(text) });
    }
  }
  const instructionsGroup: ContextGroup = {
    title: tr('Instruções do sistema/projeto'),
    tokens: sum(instructions),
    percent: pct(sum(instructions)),
    items: instructions,
    ...(instructions.length ? {} : { note: tr('Nenhum AGENTS.md/.hermes.md/CLAUDE.md/SOUL.md detectado.') }),
  };

  /* Skills — o ACP não expõe quais estão ativas: listamos as instaladas e dizemos isso. */
  const skills = collectSkills(home);
  const shown = skills.sort((a, b) => b.tokens - a.tokens).slice(0, 50);
  const skillsTokens = sum(skills);
  const skillsGroup: ContextGroup = {
    title: tr('Skills ativas'),
    tokens: skillsTokens,
    percent: pct(skillsTokens),
    items: shown,
    note: skills.length
      ? tr(`${skills.length} skill(s) instalada(s) em ~/.hermes/skills; o ACP não expõe quais estão carregadas — estimativa pelo cabeçalho (name+description).`)
      : tr('Nenhuma skill em ~/.hermes/skills.'),
  };

  /* Ferramentas / MCP — do config.yaml (o ACP devolve configOptions vazio). */
  const cfg = readSafe(home + '/.hermes/config.yaml');
  const mcp = readSafe(home + '/.hermes/mcp-configs/mcp-servers.json');
  const toolsets = cfg ? parseToolsets(cfg) : [];
  const mcpServers = cfg ? parseBlockKeys(cfg, 'mcp_servers') : (mcp ? parseJsonKeys(mcp) : []);
  const toolsText = [cfg ? extractBlock(cfg, 'platform_toolsets') : '', mcp ?? ''].join('\n');
  const toolsItems = [
    ...toolsets.map((t) => ({ id: `tool:${t}`, label: tr(`Toolset: ${t}`), tokens: 0 })),
    ...mcpServers.map((m) => ({ id: `mcp:${m}`, label: tr(`MCP: ${m}`), tokens: 0 })),
  ];
  const toolsGroup: ContextGroup = {
    title: tr('Ferramentas / MCP'),
    tokens: estimateTokens(toolsText),
    percent: pct(estimateTokens(toolsText)),
    items: toolsItems,
    note: tr('O ACP não expõe os schemas das ferramentas; estimativa pelo config.yaml/MCP — o total pode ser bem maior.'),
  };

  /* Arquivos e anexos — chips (removíveis/fixáveis). */
  const chips = manager.chips;
  const filesGroup: ContextGroup = {
    title: tr('Arquivos e anexos'),
    tokens: manager.sumTokens(),
    percent: pct(manager.sumTokens()),
    items: chips.map((c) => ({ id: c.id, label: c.label, tokens: c.tokensEstimate, removable: true, pinned: manager.isPinned(c.id) })),
    ...(chips.length ? {} : { note: tr('Nenhum chip anexado.') }),
  };

  /* Raciocínio (último turno) — medido pelo agente. */
  const thought = session?.snapshot.turnUsage?.thoughtTokens ?? 0;
  const reasoningGroup: ContextGroup = {
    title: tr('Raciocínio (último turno)'),
    tokens: thought,
    percent: pct(thought),
    items: [],
    note: thought ? tr('Medido pelo agente (thought_tokens).') : tr('O agente não reportou raciocínio p/ o último turno.'),
  };

  /* Histórico — o host não tem o transcript (a webview é dona): mostramos a sobra do total. */
  const attributed = instructionsGroup.tokens + skillsGroup.tokens + toolsGroup.tokens + filesGroup.tokens + reasoningGroup.tokens;
  const history = used > 0 ? Math.max(0, used - attributed) : 0;
  const historyGroup: ContextGroup = {
    title: tr('Histórico da conversa'),
    tokens: history,
    percent: pct(history),
    items: [],
    note: used > 0
      ? tr('Sobra do total do agente menos os grupos acima (estimado; o transcript vive na webview).')
      : tr('O agente ainda não reportou a janela; histórico indisponível.'),
  };

  return [instructionsGroup, skillsGroup, toolsGroup, filesGroup, historyGroup, reasoningGroup];
}

/* ───────── leitura de fontes reais ───────── */

function safeRead(path: string): string | undefined {
  try { return readFileSync(path, 'utf8'); } catch { return undefined; }
}
function readSafe(path: string): string | undefined { return safeRead(path); }
function sum(items: { tokens: number }[]): number { return items.reduce((n, i) => n + i.tokens, 0); }

function collectSkills(home: string): { id: string; label: string; tokens: number }[] {
  const dirs = [home + '/.hermes/skills'];
  const cfg = safeRead(home + '/.hermes/config.yaml');
  if (cfg) dirs.push(...parseExternalDirs(cfg));
  const out: { id: string; label: string; tokens: number }[] = [];
  for (const root of dirs) {
    if (!existsSync(root)) continue;
    let found: string[] = [];
    try { found = readdirSync(root, { recursive: true }) as string[]; } catch { continue; }
    for (const rel of found) {
      if (!rel.endsWith('SKILL.md')) continue;
      const p = join(root, rel);
      const head = (safeRead(p) ?? '').slice(0, 1024);
      const name = /^name:\s*(.+)$/m.exec(head)?.[1]?.trim() ?? rel;
      const desc = /^description:\s*(.+)$/m.exec(head)?.[1]?.trim() ?? '';
      out.push({ id: p, label: name, tokens: estimateTokens(`${name}\n${desc}`) });
      if (out.length >= 300) return out; // ponytail: teto p/ não ler 1k arquivos a cada refresh
    }
  }
  return out;
}

function extractBlock(yaml: string, key: string): string {
  const lines = yaml.split('\n');
  const start = lines.findIndex((l) => l.startsWith(key + ':'));
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i] ?? '')) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}
function blockItems(yaml: string, blockKey: string, subKey?: string): string[] {
  const block = extractBlock(yaml, blockKey);
  const lines = block.split('\n');
  const from = subKey ? lines.findIndex((l) => l.trim() === subKey + ':') : 0;
  if (from < 0) return [];
  const out: string[] = [];
  for (let i = from + 1; i < lines.length; i++) {
    const m = /^\s+-\s+(\S+)/.exec(lines[i] ?? '');
    if (m) { out.push(m[1]); continue; }
    if (subKey && /^\s{2}\S/.test(lines[i] ?? '')) break;
  }
  return out;
}
function parseToolsets(yaml: string): string[] {
  return blockItems(yaml, 'platform_toolsets', 'acp');
}
function parseBlockKeys(yaml: string, key: string): string[] {
  const lines = extractBlock(yaml, key).split('\n');
  const out: string[] = [];
  for (const l of lines.slice(1)) {
    const m = /^  (\S+):/.exec(l);
    if (m) out.push(m[1]);
  }
  return out;
}
function parseJsonKeys(text: string): string[] {
  try {
    const obj = JSON.parse(text) as { mcpServers?: Record<string, unknown> };
    return Object.keys(obj.mcpServers ?? {});
  } catch { return []; }
}
function parseExternalDirs(yaml: string): string[] {
  return blockItems(yaml, 'skills').filter((s) => s.startsWith('/'));
}
