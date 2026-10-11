/**
 * Strings de UI do painel "Gerenciar" (en) — tradução do pt-BR (idioma de ORIGEM).
 *
 * O pt-BR fixa os valores como literais (`as const`); `Widen` preserva a paridade de
 * chaves (chave faltando ou a mais quebra o `tsc`) trocando só os valores por texto.
 */
import { type Strings } from './i18n.pt-br';

type Widen<T> =
  T extends string ? string :
  T extends (...args: infer A) => unknown ? (...args: A) => string :
  T extends object ? { [K in keyof T]: Widen<T[K]> } :
  T;

export const en: Widen<Strings> = {
  title: 'Manage',
  tabsLabel: 'Management sections',
  tabs: {
    models: 'Models',
    skills: 'Skills',
    tools: 'Tools and MCP',
    instructions: 'Instructions',
    context: 'Context and usage',
    agents: 'Agents/Profiles',
    approvals: 'Approvals',
    advanced: 'Advanced',
  },
  common: {
    search: 'Search…',
    refresh: 'Refresh',
    open: 'Open',
    openCli: 'Open in CLI',
    loading: 'Loading…',
    none: 'none',
    estimado: 'estimated',
    source: 'Source',
    empty: 'No data to show.',
    restricted: 'Workspace in restricted mode: the panel only reads, it changes nothing.',
  },
  models: {
    onlyFavorites: 'Favorites only',
    favorites: 'Favorites',
    recent: 'Recently used',
    active: 'active',
    setActive: 'Set active',
    star: 'Add to favorites',
    unstar: 'Remove from favorites',
    count: (visible: number, total: number) => `${visible} of ${total}`,
    emptyNoSession: 'The catalog comes from the agent\'s `session/new`. Open a conversation and come back here.',
    emptyFiltered: 'No model matches the search.',
    windowTitle: 'Context window (active model)',
    windowUnknown: 'unknown — the agent only reports the active model\'s window, after the first turn.',
    windowReported: 'reported by the agent',
    switchProvider: 'Switch provider / login (CLI)',
    source: 'session/new.models + session/set_model',
  },
  skills: {
    scopeAll: 'All scopes',
    scopeUser: 'User',
    scopeProject: 'Project',
    scopeHub: 'Hub',
    rootsTitle: 'Skill folders',
    create: 'Create new skill',
    install: 'Install from Skills Hub',
    tags: 'tags',
    empty: 'No skill found in these folders.',
    openFail: 'Could not open SKILL.md.',
    source: '$HERMES_HOME/skills + .hermes/skills + .agents/skills',
    onCreate: 'Skill created.',
  },
  tools: {
    counter: (a: number, m: number) => `${a} of ${m} toolsets active`,
    newSession: 'Changing toolsets only applies to the NEXT session: the agent resolves tools when the session is created.',
    acpToolset: 'ACP toolset (platform_toolsets.acp)',
    acpDefault: 'not set — the Hermes default applies (hermes-acp)',
    disabled: 'Disabled toolsets (agent.disabled_toolsets)',
    builtin: 'Built-in',
    plugin: 'Plugins',
    mcp: 'MCP servers',
    mcpCols: ['Name', 'Transport', 'Tools', 'State'],
    addMcp: 'Add MCP server',
    openConfig: 'Open config.yaml',
    source: 'hermes config get · hermes tools list · hermes mcp list',
    unavailable: 'Could not read the Hermes configuration through the CLI.',
    empty: 'No toolset listed by Hermes.',
  },
  instructions: {
    found: 'present',
    missing: 'not found',
    tokens: 'tokens',
    empty: 'No instructions file detected.',
    source: 'file system (workspace + Hermes profile)',
    workspace: 'Workspace',
    profile: 'Profile',
  },
  context: {
    used: (used: number, size: number, pct: number) => `${used.toLocaleString('en-US')} of ${size.toLocaleString('en-US')} tokens (${pct}%)`,
    noUsage: 'The agent has not reported the context window yet (no usage_update).',
    estimates: 'Breakdown (estimated locally)',
    note: 'Total and used come from the agent; the rest is a chars/4 estimate and is not attributed by category.',
    source: 'usage_update + Tokens.ts',
  },
  agents: {
    command: 'Command',
    args: 'Args',
    profile: 'Hermes profile',
    cwd: 'cwd',
    model: 'Default model',
    active: 'active',
    test: 'Test connection',
    profiles: 'Hermes profiles (hermes profile list)',
    profilesError: 'Could not list profiles.',
    source: 'hermes.agents (settings) + hermes profile list',
  },
  approvals: {
    policy: 'Extension policy (hermes.permissions)',
    allowlist: 'Always-allowed commands (command_allowlist)',
    openConfig: 'Open config.yaml',
    suggest: 'Suggest allowlist (hermes approvals suggest)',
    empty: 'Allowlist is empty.',
    source: 'settings + config.yaml + hermes approvals',
  },
  advanced: {
    version: 'Hermes version',
    configPath: 'config.yaml path',
    envPath: '.env path',
    logTraffic: 'Log JSON-RPC traffic (traffic log)',
    doctor: 'Run diagnostics (hermes doctor)',
    check: 'Check ACP (hermes acp --check)',
    source: 'hermes --version · hermes config path/env-path · hermes doctor',
  },
  notice: {
    setModelOk: 'Active model changed.',
    setModelFail: 'Could not switch the model (no active session?).',
    saved: 'Saved to the real configuration.',
  },
};
