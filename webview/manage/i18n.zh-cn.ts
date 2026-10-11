/**
 * Bundle zh-cn do painel Gerenciar.
 *
 * Tradução do pt-BR (o idioma de ORIGEM). `Strings` é o contrato: chave faltando ou sobrando
 * quebra o `tsc`. `Texts<>` apenas alarga os literais do shape (`as const` do pt-BR) para
 * `string` — o texto muda de idioma, a estrutura continua sendo conferida intacta.
 */
import type { Strings } from './i18n.pt-br';

type Texts<T> = T extends string ? string
  : T extends (...args: never[]) => unknown ? T
  : T extends readonly unknown[] ? { -readonly [K in keyof T]: Texts<T[K]> }
  : T extends object ? { -readonly [K in keyof T]: Texts<T[K]> }
  : T;

const bundle: Texts<Strings> = {
  title: '管理',
  tabsLabel: '管理分区',
  tabs: {
    models: '模型',
    skills: 'Skills',
    tools: '工具与 MCP',
    instructions: '指令',
    context: '上下文与用量',
    agents: '代理/配置档案',
    approvals: '批准',
    advanced: '高级',
  },
  common: {
    search: '搜索…',
    refresh: '刷新',
    open: '打开',
    openCli: '在 CLI 中打开',
    loading: '加载中…',
    none: '无',
    estimado: '估算',
    source: '来源',
    empty: '暂无可显示的数据。',
    restricted: '工作区处于受限模式：面板只读取，不做任何修改。',
  },
  models: {
    onlyFavorites: '仅收藏',
    favorites: '收藏',
    recent: '最近使用',
    active: '当前',
    setActive: '设为当前',
    star: '收藏',
    unstar: '取消收藏',
    count: (visible: number, total: number) => `${visible} / ${total}`,
    emptyNoSession: '模型目录来自代理的 `session/new`。打开一个对话，然后回到这里。',
    emptyFiltered: '没有符合搜索条件的模型。',
    windowTitle: '上下文窗口（当前模型）',
    windowUnknown: '未知——代理只会在第一个回合之后报告当前模型的窗口。',
    windowReported: '由代理报告',
    switchProvider: '切换 provider / 登录（CLI）',
    source: 'session/new.models + session/set_model',
  },
  skills: {
    scopeAll: '所有范围',
    scopeUser: '用户',
    scopeProject: '项目',
    scopeHub: 'Hub',
    rootsTitle: 'Skills 文件夹',
    create: '新建 Skill',
    install: '从 Skills Hub 安装',
    tags: 'tags',
    empty: '这些文件夹里没有找到任何 Skill。',
    openFail: '无法打开 SKILL.md。',
    source: '$HERMES_HOME/skills + .hermes/skills + .agents/skills',
    onCreate: 'Skill 已创建。',
  },
  tools: {
    counter: (a: number, m: number) => `${a} / ${m} 个 toolsets 已启用`,
    newSession: '更改 toolsets 只对下一次会话生效：代理在创建会话时才解析工具集。',
    acpToolset: 'ACP 的 Toolset（platform_toolsets.acp）',
    acpDefault: '未设置——使用 Hermes 的默认值（hermes-acp）',
    disabled: '已停用的 Toolsets（agent.disabled_toolsets）',
    builtin: '内置',
    plugin: '插件',
    mcp: 'MCP 服务器',
    mcpCols: ['名称', '传输方式', '工具', '状态'] as const,
    addMcp: '添加 MCP 服务器',
    openConfig: '打开 config.yaml',
    source: 'hermes config get · hermes tools list · hermes mcp list',
    unavailable: '无法通过 CLI 读取 Hermes 配置。',
    empty: 'Hermes 没有列出任何 toolset。',
  },
  instructions: {
    found: '存在',
    missing: '未找到',
    tokens: 'tokens',
    empty: '没有检测到任何指令文件。',
    source: '文件系统（工作区 + Hermes 配置档案）',
    workspace: '工作区',
    profile: '配置档案',
  },
  context: {
    used: (used: number, size: number, pct: number) => `${used.toLocaleString('zh-CN')} / ${size.toLocaleString('zh-CN')} tokens（${pct}%）`,
    noUsage: '代理还没有报告上下文窗口（没有 usage_update）。',
    estimates: '明细（本地估算）',
    note: '总数和已用量来自代理；其余按 chars/4 估算，且不按类别归类。',
    source: 'usage_update + Tokens.ts',
  },
  agents: {
    command: '命令',
    args: 'Args',
    profile: 'Hermes 配置档案',
    cwd: 'cwd',
    model: '默认模型',
    active: '已启用',
    test: '测试连接',
    profiles: 'Hermes 配置档案（hermes profile list）',
    profilesError: '无法列出配置档案。',
    source: 'hermes.agents (settings) + hermes profile list',
  },
  approvals: {
    policy: '扩展策略（hermes.permissions）',
    allowlist: '始终允许的命令（command_allowlist）',
    openConfig: '打开 config.yaml',
    suggest: '生成 allowlist 建议（hermes approvals suggest）',
    empty: 'Allowlist 为空。',
    source: 'settings + config.yaml + hermes approvals',
  },
  advanced: {
    version: 'Hermes 版本',
    configPath: 'config.yaml 路径',
    envPath: '.env 路径',
    logTraffic: '记录 JSON-RPC 流量（流量日志）',
    doctor: '运行诊断（hermes doctor）',
    check: '检查 ACP（hermes acp --check）',
    source: 'hermes --version · hermes config path/env-path · hermes doctor',
  },
  notice: {
    setModelOk: '当前模型已更改。',
    setModelFail: '无法切换模型（没有活动会话？）。',
    saved: '已保存到实际配置。',
  },
};

export const zhCN: Strings = bundle as Strings;
