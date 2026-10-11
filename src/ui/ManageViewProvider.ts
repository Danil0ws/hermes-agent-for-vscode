/**
 * Painel "Gerenciar" — WebviewPanel com as 8 abas verticais.
 *
 * Regra dura de produto: o painel NÃO guarda estado próprio. Ele lê/escreve a configuração
 * real do Hermes (via CLI de leitura, arquivos de skill, settings da extensão) ou delega à CLI
 * num terminal integrado. O que o ACP não expõe vira leitura da fonte real ou atalho para a CLI.
 *
 * As mensagens deste painel têm o seu próprio protocolo (`webview/manage/protocol.ts`), porque
 * o contrato do chat (`src/core/types.ts`) não é desta lane — ver relatório.
 */
import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentManager } from '../core/AgentManager';
import { ModelCatalog } from '../core/ModelCatalog';
import { SkillCatalog, hermesHome } from '../core/SkillCatalog';
import { ToolCatalog, parseYamlList, type CliExec, type ToolSnapshot } from '../core/ToolCatalog';
import { estimateFileTokens, estimateTokens } from '../utils/Tokens';
import { settings, workingDirectory, type Settings } from '../config/Settings';
import { t } from '../../webview/manage/i18n';
import type {
  AdvancedTab, AgentView, ApprovalsTab, ContextTab, InstructionView, ManageState, ManageTab,
  ManageToHost, ModelEntry, ModelsTab, ProfileView, SkillEntryView, SkillsTab, ToolsTab,
} from '../../webview/manage/protocol';

const WS_FILES = ['AGENTS.md', '.hermes.md', 'CLAUDE.md', 'SOUL.md', '.cursorrules'];
const HOME_FILES = ['SOUL.md', 'AGENTS.md', 'CLAUDE.md'];
const TABS: ManageTab[] = ['models', 'skills', 'tools', 'instructions', 'context', 'agents', 'approvals', 'advanced'];

export class ManageViewProvider implements vscode.Disposable {
  static readonly viewType = 'hermes.manage';

  private panel?: vscode.WebviewPanel;
  private tab: ManageTab = 'models';
  private notice: ManageState['notice'] = null;

  // caches por aba (refeitos sob demanda; nunca fonte de verdade — só evitam repetir I/O)
  private skills?: SkillEntryView[];
  private toolSnap?: ToolSnapshot;
  private profiles?: ProfileView[];
  private profilesError?: string;
  private allowlist?: string[];
  private adv?: { version: string; configPath: string; envPath: string };

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly agents: AgentManager,
    private readonly catalogs: { models: ModelCatalog; skills: SkillCatalog; tools: ToolCatalog },
    private readonly capture: CliExec,
    private readonly log: (level: 'info' | 'warn' | 'error', text: string) => void,
    private readonly openCli: (opts?: { command?: string; args?: string[]; sessionId?: string }) => Promise<void>,
  ) {}

  /* ─────────── ciclo de vida ─────────── */

  open(tab?: string): void {
    if (tab && (TABS as string[]).includes(tab)) this.tab = tab as ManageTab;
    if (this.panel) { this.panel.reveal(); void this.push(); return; }
    const panel = vscode.window.createWebviewPanel(
      ManageViewProvider.viewType, t.title, vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.assetsRoot()] },
    );
    this.panel = panel;
    panel.webview.html = this.html(panel.webview);
    panel.onDidDispose(() => { if (this.panel === panel) this.panel = undefined; });
    panel.webview.onDidReceiveMessage((m: ManageToHost | { type: 'ready' }) => void this.onMessage(m));
  }

  dispose(): void { this.panel?.dispose(); this.panel = undefined; }

  private assetsRoot(): vscode.Uri { return vscode.Uri.joinPath(this.ctx.extensionUri, 'dist'); }

  /* ─────────── ponte ─────────── */

  private async onMessage(m: ManageToHost | { type: 'ready' }): Promise<void> {
    try {
      switch (m.type) {
        case 'ready':
          await this.push(); return;
        case 'manage/tab':
          this.tab = m.tab; await this.push(); return;
        case 'manage/refresh':
          this.invalidate(m.tab); this.tab = m.tab; await this.push(); return;
        case 'manage/model/set': {
          const sess = this.agents.session;
          if (!sess) { this.notice = { level: 'warning', text: t.notice.setModelFail }; break; }
          await sess.setModel(m.modelId);
          this.catalogs.models.markUsed(m.modelId);
          this.notice = { level: 'info', text: t.notice.setModelOk };
          break;
        }
        case 'manage/model/favorite':
          this.catalogs.models.setFavorite(m.modelId, m.on);
          break;
        case 'manage/skill/open':
          await this.openPath(m.path); return;
        case 'manage/skill/create': {
          const name = await vscode.window.showInputBox({ title: t.skills.create, prompt: 'nome-da-skill', placeHolder: 'minha-skill' });
          if (!name) return;
          const file = this.catalogs.skills.createSkeleton(m.scope, name);
          this.skills = undefined;
          this.notice = { level: 'info', text: t.skills.onCreate };
          await this.openPath(file);
          break;
        }
        case 'manage/skills/install':
          await this.openCli({ args: ['skills', 'browse'] }); return;
        case 'manage/instructions/open':
        case 'manage/openFile':
          await this.openPath(m.path); return;
        case 'manage/agents/test': {
          const cfg = settings().agents[m.name];
          await this.openCli({ command: cfg?.command, args: ['acp', '--check'] });
          return;
        }
        case 'manage/mcp/add':
          await this.openCli({ args: ['mcp', 'add'] }); return;
        case 'manage/approvals/suggest':
          await this.openCli({ args: ['approvals', 'suggest'] }); return;
        case 'manage/approvals/open':
          await this.openPath(this.adv?.configPath || join(hermesHome(), 'config.yaml'));
          return;
        case 'manage/advanced/toggleTraffic':
          await vscode.workspace.getConfiguration('hermes').update('logTraffic', m.value, vscode.ConfigurationTarget.Global);
          this.notice = { level: 'info', text: t.notice.saved };
          await this.push(); return;
        case 'manage/cli':
          await this.openCli({ args: m.args }); return;
      }
      await this.push();
    } catch (err) {
      this.log('error', `Gerenciar: ${String(err)}`);
      this.notice = { level: 'error', text: String(err) };
      await this.push();
    }
  }

  private invalidate(tab: ManageTab): void {
    if (tab === 'skills') this.skills = undefined;
    else if (tab === 'tools') this.toolSnap = undefined;
    else if (tab === 'agents') { this.profiles = undefined; this.profilesError = undefined; }
    else if (tab === 'approvals') this.allowlist = undefined;
    else if (tab === 'advanced') this.adv = undefined;
  }

  private async ensure(tab: ManageTab): Promise<void> {
    if (tab === 'skills' && !this.skills) this.skills = this.catalogs.skills.list();
    else if (tab === 'tools' && !this.toolSnap) this.toolSnap = await this.catalogs.tools.load();
    else if (tab === 'agents' && !this.profiles) await this.loadProfiles();
    else if (tab === 'approvals' && !this.allowlist) {
      const r = await this.capture(['config', 'get', 'command_allowlist']);
      this.allowlist = r.ok ? parseYamlList(r.stdout) : [];
    } else if (tab === 'advanced' && !this.adv) {
      const [v, cp, ep] = await Promise.all([
        this.capture(['--version']), this.capture(['config', 'path']), this.capture(['config', 'env-path']),
      ]);
      this.adv = { version: firstLine(v.stdout), configPath: firstLine(cp.stdout), envPath: firstLine(ep.stdout) };
    }
  }

  private async loadProfiles(): Promise<void> {
    const r = await this.capture(['profile', 'list']);
    if (!r.ok) { this.profiles = []; this.profilesError = t.agents.profilesError; return; }
    this.profiles = parseProfiles(r.stdout);
    this.profilesError = undefined;
  }

  /* ─────────── estado ─────────── */

  private async buildState(): Promise<ManageState> {
    const s = settings();
    const ws = workingDirectory(s);
    const home = hermesHome();
    await this.ensure(this.tab);

    // Modelos: cache do que o agente anunciou em `session/new`; sem sessão = estado vazio honesto.
    const sess = this.agents.session;
    if (sess) {
      this.catalogs.models.setModels(sess.snapshot.models, sess.snapshot.currentModel);
      const u = sess.snapshot.usage;
      if (u) this.catalogs.models.setUsage(u.size, u.used);
    } else {
      // sem sessão o catálogo por sessão não existe: invalida (favoritos continuam no arquivo)
      this.catalogs.models.invalidate();
    }
    const ms = this.catalogs.models.snapshot();
    const skillList = this.skills ?? [];
    const instructions = detectInstructions(ws, home);

    const models: ModelsTab = {
      available: ms.total > 0,
      groups: ms.groups.map((g) => ({ provider: g.provider, label: g.label, models: g.models.map(toEntry) })),
      total: ms.total,
      current: ms.current,
      favorites: ms.favorites,
      recent: ms.recent,
      activeWindow: ms.activeWindow,
    };

    const skills: SkillsTab = {
      roots: this.catalogs.skills.roots().map((r) => ({ path: r.path, exists: r.exists, scope: r.scope })),
      skills: skillList,
    };

    const tools: ToolsTab = this.toolSnap ?? emptyTools();

    const context: ContextTab = {
      available: !!sess?.snapshot.usage,
      size: sess?.snapshot.usage?.size,
      used: sess?.snapshot.usage?.used,
      estimates: [
        { label: 'Instruções', tokens: instructions.filter((f) => f.found).reduce((a, f) => a + f.tokens, 0) },
        { label: 'Skills (nome + descrição)', tokens: skillList.reduce((a, k) => a + estimateTokens(k.name + k.description), 0) },
      ],
    };

    const approvals: ApprovalsTab = {
      policy: s.permissions,
      allowlist: this.allowlist ?? [],
      configPath: this.adv?.configPath ?? join(home, 'config.yaml'),
    };

    const advanced: AdvancedTab = {
      version: this.adv?.version ?? '—',
      configPath: this.adv?.configPath ?? '',
      envPath: this.adv?.envPath ?? '',
      logTraffic: s.logTraffic,
    };

    return {
      tab: this.tab,
      restricted: !vscode.workspace.isTrusted,
      home, workspace: ws,
      models, skills, tools,
      instructions: { files: instructions },
      context,
      agents: { agents: agentViews(s), profiles: this.profiles ?? [], profilesError: this.profilesError },
      approvals, advanced,
      notice: this.notice,
    };
  }

  private async push(): Promise<void> {
    const panel = this.panel;
    if (!panel) return;
    const state = await this.buildState();
    this.notice = null;
    void panel.webview.postMessage({ type: 'manage/state', state });
  }

  /* ─────────── helpers ─────────── */

  private async openPath(p: string): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch {
      void vscode.window.showWarningMessage(`${t.skills.openFail} (${p})`);
    }
  }

  private html(w: vscode.Webview): string {
    const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    const base = w.asWebviewUri(this.assetsRoot());
    return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${w.cspSource} data:; style-src ${w.cspSource} 'unsafe-inline'; font-src ${w.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${base}/codicon.css">
<link rel="stylesheet" href="${base}/manage.css">
<title>${t.title}</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" type="module" src="${base}/manage.js"></script>
</body>
</html>`;
  }
}

/* ─────────── conversões e parsers ─────────── */

function toEntry(m: { modelId: string; name: string; description?: string }): ModelEntry {
  return { modelId: m.modelId, name: m.name, description: m.description };
}

function agentViews(s: Settings): AgentView[] {
  return Object.entries(s.agents).map(([name, cfg]) => ({
    name, command: cfg.command, args: cfg.args, profile: cfg.profile,
    cwd: cfg.cwd, model: cfg.model, active: name === s.defaultAgent,
  }));
}

export function detectInstructions(ws: string, home: string): InstructionView[] {
  const out: InstructionView[] = [];
  for (const f of WS_FILES) {
    const p = join(ws, f);
    const found = existsSync(p);
    out.push({ label: f, path: p, scope: 'workspace', found, tokens: found ? estimateFileTokens(p) : 0 });
  }
  if (ws !== home) {
    for (const f of HOME_FILES) {
      const p = join(home, f);
      if (existsSync(p)) out.push({ label: f, path: p, scope: 'perfil', found: true, tokens: estimateFileTokens(p) });
    }
  }
  return out;
}

export function parseProfiles(text: string): ProfileView[] {
  const out: ProfileView[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || /^Profile\b/i.test(line) || /^[─━-]+$/.test(line.replace(/\s/g, ''))) continue;
    const cols = line.split(/\s{2,}/);
    if (cols.length < 2) continue;
    const active = /^◆/.test(cols[0]);
    const name = cols[0].replace(/^[◆*\s]+/, '').trim();
    if (!name) continue;
    out.push({ name, model: cols[1].trim(), active });
  }
  return out;
}

function emptyTools(): ToolsTab {
  return {
    acpToolset: [], acpToolsetIsDefault: true, disabled: [], groups: [], mcp: [],
    activeCount: 0, totalCount: 0, source: { configOk: false, toolsOk: false, mcpOk: false },
  };
}

function firstLine(text: string): string {
  return text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
}
