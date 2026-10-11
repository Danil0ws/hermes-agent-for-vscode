/**
 * Protocolo da webview "Gerenciar" (Host <-> Webview).
 *
 * O contrato geral (`src/core/types.ts`) é do CHAT e não tem as variantes deste painel — a
 * lane M6 não é dona daquele arquivo, então este canal define o próprio conjunto de mensagens
 * e trafega pelos mesmos `send`/`onMessage` de `webview/shared/bridge.ts` (com cast explícito).
 * Tudo aqui é JSON puro (só tipos + uma fábrica de estado vazio), sem import de runtime.
 */

export type ManageTab =
  | 'models' | 'skills' | 'tools' | 'instructions'
  | 'context' | 'agents' | 'approvals' | 'advanced';

export interface ModelEntry { modelId: string; name: string; description?: string }
export interface ModelGroupView { provider: string; label: string; models: ModelEntry[] }

export interface ModelsTab {
  /** false = ainda não há catálogo (nenhuma sessão `session/new` aberta) */
  available: boolean;
  groups: ModelGroupView[];
  total: number;
  current?: string;
  favorites: string[];
  recent: string[];
  /** janela do modelo ATIVO, só quando o agente reportou (`usage_update.size`) */
  activeWindow?: { size: number; used: number; modelId?: string };
}

export interface SkillEntryView {
  name: string; description: string; version?: string;
  tags: string[]; path: string; scope: 'user' | 'project' | 'hub';
}
export interface SkillRootView { path: string; exists: boolean; scope: string }
export interface SkillsTab { roots: SkillRootView[]; skills: SkillEntryView[] }

export interface ToolsetView { name: string; label: string; enabled: boolean }
export interface ToolGroupView { kind: 'builtin' | 'plugin'; items: ToolsetView[] }
export interface McpServerView { name: string; transport: string; tools: string; status: string; enabled: boolean }
export interface ToolsTab {
  acpToolset: string[];
  acpToolsetIsDefault: boolean;
  disabled: string[];
  groups: ToolGroupView[];
  mcp: McpServerView[];
  activeCount: number;
  totalCount: number;
  source: { configOk: boolean; toolsOk: boolean; mcpOk: boolean };
}

export interface InstructionView {
  label: string; path: string; scope: 'workspace' | 'perfil'; found: boolean; tokens: number;
}
export interface InstructionsTab { files: InstructionView[] }

export interface ContextTab {
  available: boolean;
  size?: number;
  used?: number;
  estimates: { label: string; tokens: number }[];
}

export interface AgentView {
  name: string; command: string; args: string[]; profile?: string;
  cwd?: string; model?: string; active: boolean;
}
export interface ProfileView { name: string; model: string; active: boolean }
export interface AgentsTab { agents: AgentView[]; profiles: ProfileView[]; profilesError?: string }

export interface ApprovalsTab { policy: string; allowlist: string[]; configPath: string }
export interface AdvancedTab { version: string; configPath: string; envPath: string; logTraffic: boolean }

export interface ManageState {
  tab: ManageTab;
  /** workspace não confiável: painel em modo leitura */
  restricted: boolean;
  home: string;
  workspace: string;
  models: ModelsTab;
  skills: SkillsTab;
  tools: ToolsTab;
  instructions: InstructionsTab;
  context: ContextTab;
  agents: AgentsTab;
  approvals: ApprovalsTab;
  advanced: AdvancedTab;
  notice: { level: 'info' | 'warning' | 'error'; text: string } | null;
}

/** Webview -> Host */
export type ManageToHost =
  | { type: 'manage/tab'; tab: ManageTab }
  | { type: 'manage/refresh'; tab: ManageTab }
  | { type: 'manage/model/set'; modelId: string }
  | { type: 'manage/model/favorite'; modelId: string; on: boolean }
  | { type: 'manage/skill/open'; path: string }
  | { type: 'manage/skill/create'; scope: 'user' | 'project' }
  | { type: 'manage/skills/install' }
  | { type: 'manage/instructions/open'; path: string }
  | { type: 'manage/openFile'; path: string }
  | { type: 'manage/agents/test'; name: string }
  | { type: 'manage/mcp/add' }
  | { type: 'manage/approvals/suggest' }
  | { type: 'manage/approvals/open' }
  | { type: 'manage/advanced/toggleTraffic'; value: boolean }
  | { type: 'manage/cli'; args: string[]; name?: string };

/** Host -> Webview */
export type HostToManage = { type: 'manage/state'; state: ManageState };

export function emptyState(tab: ManageTab = 'models'): ManageState {
  return {
    tab, restricted: false, home: '', workspace: '',
    models: { available: false, groups: [], total: 0, favorites: [], recent: [] },
    skills: { roots: [], skills: [] },
    tools: {
      acpToolset: [], acpToolsetIsDefault: true, disabled: [], groups: [], mcp: [],
      activeCount: 0, totalCount: 0, source: { configOk: false, toolsOk: false, mcpOk: false },
    },
    instructions: { files: [] },
    context: { available: false, estimates: [] },
    agents: { agents: [], profiles: [] },
    approvals: { policy: 'ask', allowlist: [], configPath: '' },
    advanced: { version: '', configPath: '', envPath: '', logTraffic: false },
    notice: null,
  };
}
