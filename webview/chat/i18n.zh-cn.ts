/**
 * Bundle zh-cn da webview do chat.
 *
 * Tipagem: `Strings` (o shape do bundle pt-BR) — o compilador garante paridade de chaves.
 */
import type { Strings } from './i18n.pt-br';


export const zhCN: Strings = {
  /* ───── vazio / boas-vindas ───── */
  empty: {
    greeting: 'Hermes 在你的机器上运行，带着你的技能、记忆和工具。',
    actions: [
      ['解释这个项目', '解释这个项目的架构，以及我应该从哪里开始。'],
      ['找出问题', '找出此工作区代码里的问题，并按风险排出优先级。'],
      ['编写测试', '为还没有测试覆盖的部分编写测试。'],
      ['规划一项改动', '为我描述的改动制定分步计划。'],
    ] as const,
    manage: '管理模型、技能和 MCP…',
    startTitle: '启动代理',
    startBody: '启动会创建会话并加载模式、模型和命令。在你发送消息之前，不会向模型发送任何内容。',
    startHint: '点击“启动”以加载模式、模型和命令。',
    starting: '正在启动代理…',
  },

  /* ───── papéis ───── */
  /* ───── 标签页：一个标签页一个对话 ───── */
  tabs: {
    new: '新建标签页',
    newTip: '在新标签页中开始新对话',
    newWorktree: '新建 lane（worktree）',
    newWorktreeTip: '创建 git worktree 并在其中打开对话',
    close: '关闭标签页',
    closeTip: '关闭此标签页 — 会话仍保留在历史中',
    rename: '重命名',
    noSession: '无会话',
    busy: '工作中',
    waiting: '等待批准',
    paused: '已暂停',
    laneTip: (path: string) => `lane：${path}`,
  },

  role: { user: '你', agentFallback: 'hermes' },

  /* ───── estados ───── */
  status: {
    completed: '已完成', failed: '失败', in_progress: '进行中',
    pending: '待处理', cancelled: '已取消',
  } as Record<string, string>,
  statusGlyph: {
    completed: 'check', failed: 'close', in_progress: 'circle-filled', pending: 'circle-outline',
    cancelled: 'circle-slash',
  } as Record<string, string>,

  /* ───── raciocínio ───── */
  thought: {
    summary: '推理',
    running: '正在思考',
    done: '已完成',
    elapsed: (s: string) => `${s} 秒`,
  },

  /* ───── tool calls ───── */
  tool: {
    titleFallback: '工具',
    input: '输入', output: '输出',
    duration: (s: string) => `${s} 秒`,
    expand: '展开', collapse: '收起',
    locations: '位置',
    kind: {
      read: '读取', edit: '编辑', delete: '删除', move: '移动', search: '搜索',
      execute: '命令', think: '推理', fetch: '获取', switch_mode: '切换模式',
      other: '工具',
    } as Record<string, string>,
  },

  /* ───── plano ───── */
  plan: {
    title: '计划',
    count: (done: number, total: number) => `${done}/${total}`,
    viewInView: '在面板中查看',
    implement: '实施计划',
  },

  /* ───── arquivos alterados ───── */
  workingSet: {
    title: '已更改的文件',
    summary: (n: number, add: number, rem: number) => `${n} · +${add} −${rem}`,
    diff: 'diff',
    keep: '保留',
    undo: '撤销',
    keepAll: '全部保留',
    undoAll: '全部撤销',
    scopeNote:
      'Hermes 已经把这些文件写入磁盘。“撤销”会应用反向 diff。' +
      '要还原整个回合，请用 Hermes 自身的 checkpoint（hermes chat --checkpoints + /rollback）——' +
      'ACP 会话目前不会创建 checkpoint，所以只有此目录存在 store 时，该按钮才会出现。',
  },

  /* ───── aprovação ───── */
  permission: {
    label: '需要批准',
    cwdPrefix: 'cwd:',
    remaining: (s: number) => `将在 ${s} 秒后过期`,
  },

  /* ───── bloco de código / barra de resposta ───── */
  code: { copy: '复制', insert: '插入到编辑器' },
  response: {
    copy: '复制回复',
    rerun: '重新运行',
    insert: '插入到编辑器',
    openDiff: '打开 diff',
    copied: '已复制',
  },
  userMsg: { edit: '编辑并重新发送', copied: '已复制' },

  /* ───── composer ───── */
  composer: {
    placeholderIdle: '向 Hermes 提问，# 引用上下文，/ 使用命令',
    placeholderPaused: '执行已暂停 — 恢复后可发送',
    locked: "启动代理后才能输入",
    placeholderBusy: '加入队列，或为进行中的回合提供指引',
    placeholderChips: (n: number) =>
      n === 1 ? '针对已附加的这一项提问' : `针对已附加的 ${n} 项提问`,
    inputLabel: '发给 Hermes 的消息',
    addContext: '添加上下文',
    addContextTip: '添加上下文（+ 或 #）',
    mode: '模式',
    modeTip: '模式 / 编辑批准策略',
    noModes: '无模式',
    model: '模型',
    modelTip: '模型',
    noModels: '无模型',
    start: '启动',
    starting: '正在启动…',
    startTip: '创建会话并加载模式、模型和命令',
    loading: '加载中…',
    attach: '附加',
    dropHint: '把文件拖到这里，作为上下文附加',
    removeChip: (label: string) => `移除 ${label}`,
    toggleChip: (label: string) => `开启/关闭隐式上下文 ${label}`,
    chipTokens: (n: string) => `约 ${n} tokens`,
    chipTruncated: "已截断",
    chipTruncatedTip: (full: string) => `仅保留开头 — 完整内容在 ${full}`,
    pasteImageFailed: "无法附加粘贴的图片。",
    chipTooltipSent: '将作为文本随提示一起发送',
    noQueueTip: '队列已在设置中关闭；这里会变成对当前回合的指引。',
  },

  /* ───── 执行控制 ───── */
  run: {
    label: '执行',
    pause: '暂停', pauseTip: '暂停：中断当前回合并挂起队列',
    resume: '恢复', resumeTip: '恢复执行与队列',
    stop: '停止', stopTip: '停止当前回合（Esc）',
  },
  /* ───── envio ───── */
  send: {
    send: '发送', sendTip: '发送（Enter）',
    stop: '停止', stopTip: '停止（Esc）',
    menuLabel: '发送选项',
    idleMenu: '发送', queue: '加入队列', steer: '指引回合',
    interrupt: '立即发送（中断）',
  },

  /* ───── popover de contexto (#) ───── */
  hash: {
    title: '上下文',
    empty: '没有匹配项',
    sources: {
      file: '文件', folder: '文件夹', symbol: '符号', selection: '选区',
      diagnostic: '问题', terminal: '终端', git: 'Git 更改',
      url: 'URL', image: '图片',
    } as Record<string, string>,
    sourceHint: '在 VS Code 中打开选择器',
  },

  /* ───── popover de comandos (/) ───── */
  slash: { title: '命令', empty: '没有匹配的命令' },

  /* ───── fila ───── */
  queue: {
    title: (n: number) => `队列中 ${n} 条`,
    clear: '清空',
    now: '立即', nowTip: '立即发送（取消当前回合）',
    edit: '编辑', editTip: '在输入框中编辑',
    remove: '移除',
    drag: '拖动以重新排序',
    up: '上移（Alt+↑）',
    down: '下移（Alt+↓）',
  },

  /* ───── medidor de contexto ───── */
  meter: {
    label: '上下文用量',
    noWindow: '代理还没有报告上下文窗口',
    reported: (used: string, size: string, pct: string) =>
      `${used} / ${size} tokens（${pct}%）— 由代理报告`,
    popoverTitle: '上下文',
    usedOf: (used: string, size: string, pct: string) => `${used} / ${size} tokens（${pct}%）`,
    fromAgent: '（来自代理）',
    estimated: '估算',
    measured: '实测',
    notAvailable: '—',
    notAvailableTip: 'webview 还没有从宿主收到这个数据',
    categories: {
      instructions: '项目指令', skills: '已启用的 Skills', tools: '工具 / MCP',
      files: '文件与附件', history: '历史记录', reasoning: '推理（上一回合）',
      unassigned: '未归类',
    } as Record<string, string>,
    lastTurn: '上一回合',
    lastTurnLine: (inp: string, out: string, thought: string, cached: string) =>
      `${inp} 输入 · ${out} 输出 · ${thought} 推理 · ${cached} 缓存`,
    costUnknown: '会话费用：代理未提供',
    compact: '压缩',
    compactTip: '压缩上下文（/compress）',
    compactBusyTip: '等回合结束或取消后再压缩',
    newWithSummary: '带摘要开启新对话',
    newWithSummaryTip: '开始一个新对话',
    details: '查看详情',
    detailsTip: '在“管理”中打开“上下文与用量”标签页',
  },

  /* ───── avisos ───── */
  notice: { cancelled: '回合已取消。', paused: '执行已暂停。', copied: '已复制。' },

  /* ───── a11y genéricos ───── */
  a11y: {
    transcript: '对话', queue: '提示队列', context: '已附加的上下文',
    plan: '计划', workingSet: '已更改的文件', permissionDialog: 'Hermes 批准',
    responseActions: (role: string) => `${role}的回复操作`,
    thinking: '正在推理',
  },

  allowAlwaysNote: '“始终允许”会写入 Hermes 的永久允许列表——对之后的会话同样生效。',
  permissionHint: {
    allow_once: '仅允许这一次调用。',
    allow_session: '在本代理会话剩余时间内，允许所有同类调用。',
    allow_always: '永久允许所有同类调用（写入 Hermes 的永久允许列表）。',
    reject_once: '拒绝这一次调用。',
    reject_always: '拒绝这一次调用，以及本会话剩余时间内的同类调用。',
  } as Record<string, string>,

  /* ───── ícones por tipo (sem emoji — símbolos + aria-label) ───── */
  icon: {
    file: 'file', folder: 'folder', symbol: 'symbol-method', selection: 'selection',
    diagnostic: 'warning', terminal: 'terminal', git: 'git-branch', url: 'link-external',
    image: 'file-media', skill: 'symbol-event',
    read: 'book', edit: 'edit', delete: 'trash', move: 'arrow-right', search: 'search',
    execute: 'terminal', think: 'lightbulb', fetch: 'cloud-download', switch_mode: 'arrow-swap',
    other: 'tools', showOlder: 'chevron-up',
  } as Record<string, string>,
};

