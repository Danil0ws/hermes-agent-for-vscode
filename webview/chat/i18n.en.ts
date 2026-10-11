/**
 * Bundle en da webview do chat (tradução do pt-BR — o idioma de ORIGEM).
 *
 * Tipagem: `Strings` (o shape do bundle pt-BR) — o compilador garante paridade de chaves.
 */
import { type Strings } from './i18n.pt-br';

export const en: Strings = {
  /* ───── empty / welcome ───── */
  empty: {
    greeting: 'Hermes runs on your machine, with your skills, memory and tools.',
    actions: [
      ['Explain this project', 'Explain this project\'s architecture and where I should start.'],
      ['Find problems', 'Find problems in this workspace\'s code and prioritize the risks.'],
      ['Write tests', 'Write tests for what is not covered yet.'],
      ['Plan a change', 'Plan, step by step, the change I describe.'],
    ] as const,
    manage: 'Manage models, skills and MCP…',
  },

  /* ───── roles ───── */
  role: { user: 'you', agentFallback: 'hermes' },

  /* ───── states ───── */
  status: {
    completed: 'Completed', failed: 'Failed', in_progress: 'In progress',
    pending: 'Pending', cancelled: 'Cancelled',
  } as Record<string, string>,
  statusGlyph: {
    completed: 'check', failed: 'close', in_progress: 'circle-filled', pending: 'circle-outline',
    cancelled: 'circle-slash',
  } as Record<string, string>,

  /* ───── reasoning ───── */
  thought: {
    summary: 'Reasoning',
    running: 'thinking',
    done: 'done',
    elapsed: (s: string) => `${s} s`,
  },

  /* ───── tool calls ───── */
  tool: {
    titleFallback: 'Tool',
    input: 'Input', output: 'Output',
    duration: (s: string) => `${s} s`,
    expand: 'Expand', collapse: 'Collapse',
    locations: 'Locations',
    kind: {
      read: 'Read', edit: 'Edit', delete: 'Delete', move: 'Move', search: 'Search',
      execute: 'Command', think: 'Reasoning', fetch: 'Fetch', switch_mode: 'Mode switch',
      other: 'Tool',
    } as Record<string, string>,
  },

  /* ───── plan ───── */
  plan: {
    title: 'Plan',
    count: (done: number, total: number) => `${done}/${total}`,
    viewInView: 'View in panel',
    implement: 'Implement plan',
  },

  /* ───── changed files ───── */
  workingSet: {
    title: 'Changed files',
    summary: (n: number, add: number, rem: number) => `${n} · +${add} −${rem}`,
    diff: 'diff',
    keep: 'Keep',
    undo: 'Undo',
    keepAll: 'Keep all',
    undoAll: 'Undo all',
    scopeNote:
      'Hermes has already written these files to disk. "Undo" applies the reverse diff. ' +
      'Restoring the whole turn uses Hermes\'s own checkpoint (hermes chat --checkpoints + /rollback) — ' +
      'the ACP session doesn\'t take checkpoints yet, so the button only shows up when a store exists for this directory.',
  },

  /* ───── approval ───── */
  permission: {
    label: 'Approval required',
    cwdPrefix: 'cwd:',
    remaining: (s: number) => `expires in ${s} s`,
  },

  /* ───── code block / response bar ───── */
  code: { copy: 'Copy', insert: 'Insert into editor' },
  response: {
    copy: 'Copy response',
    rerun: 'Rerun',
    insert: 'Insert into editor',
    openDiff: 'Open diff',
    copied: 'Copied',
  },
  userMsg: { edit: 'Edit and resend', copied: 'Copied' },

  /* ───── composer ───── */
  composer: {
    placeholderIdle: 'Ask Hermes, # for context, / for commands',
    placeholderBusy: 'Queue or steer the turn in progress',
    placeholderChips: (n: number) =>
      n === 1 ? 'Ask about the attached item' : `Ask about the ${n} attached items`,
    inputLabel: 'Message to Hermes',
    addContext: 'Add context',
    addContextTip: 'Add context (+ or #)',
    mode: 'Mode',
    modeTip: 'Mode / edit approval policy',
    noModes: 'no modes',
    model: 'Model',
    modelTip: 'Model',
    noModels: 'no models',
    tools: 'Tools',
    toolsTip: 'Configure tools (Manage)',
    attach: 'Attach',
    dropHint: 'Drop files here to attach as context',
    removeChip: (label: string) => `Remove ${label}`,
    toggleChip: (label: string) => `Toggle implicit context ${label}`,
    chipTokens: (n: string) => `~${n} tokens`,
    chipTooltipSent: 'will be sent as text in the prompt',
    noQueueTip: 'The queue is disabled in settings; this becomes turn steering.',
  },

  /* ───── send ───── */
  send: {
    send: 'Send', sendTip: 'Send (Enter)',
    stop: 'Stop', stopTip: 'Stop (Esc)',
    menuLabel: 'Send options',
    idleMenu: 'Send', queue: 'Add to queue', steer: 'Steer turn',
    interrupt: 'Send now (interrupt)',
  },

  /* ───── context popover (#) ───── */
  hash: {
    title: 'Context',
    empty: 'Nothing matches',
    sources: {
      file: 'File', folder: 'Folder', symbol: 'Symbol', selection: 'Selection',
      diagnostic: 'Problems', terminal: 'Terminal', git: 'Git changes',
      url: 'URL', image: 'Image',
    } as Record<string, string>,
    sourceHint: 'opens the picker in VS Code',
  },

  /* ───── command popover (/) ───── */
  slash: { title: 'Commands', empty: 'No command matches' },

  /* ───── queue ───── */
  queue: {
    title: (n: number) => `${n} queued`,
    clear: 'Clear',
    now: 'now', nowTip: 'Send now (cancels the current turn)',
    edit: 'Edit', editTip: 'Edit in composer',
    remove: 'Remove',
    drag: 'Drag to reorder',
    up: 'Move up (Alt+↑)',
    down: 'Move down (Alt+↓)',
  },

  /* ───── context meter ───── */
  meter: {
    label: 'Context usage',
    noWindow: 'The agent has not reported the context window yet',
    reported: (used: string, size: string, pct: string) =>
      `${used} of ${size} tokens (${pct}%) — reported by the agent`,
    popoverTitle: 'Context',
    usedOf: (used: string, size: string, pct: string) => `${used} of ${size} tokens (${pct}%)`,
    fromAgent: '(from the agent)',
    estimated: 'estimated',
    measured: 'measured',
    notAvailable: '—',
    notAvailableTip: 'the webview does not receive this data from the host yet',
    categories: {
      instructions: 'Project instructions', skills: 'Active skills', tools: 'Tools / MCP',
      files: 'Files and attachments', history: 'History', reasoning: 'Reasoning (last turn)',
      unassigned: 'Unassigned',
    } as Record<string, string>,
    lastTurn: 'Last turn',
    lastTurnLine: (inp: string, out: string, thought: string, cached: string) =>
      `${inp} in · ${out} out · ${thought} reasoning · ${cached} cache`,
    costUnknown: 'Session cost: not reported by the agent',
    compact: 'Compact',
    compactTip: 'Compacts the context (/compress)',
    compactBusyTip: 'wait for the turn to finish or cancel to compact',
    newWithSummary: 'New conversation with summary',
    newWithSummaryTip: 'Starts a new conversation',
    details: 'View details',
    detailsTip: 'Open the "Context and usage" tab in Manage',
  },

  /* ───── notices ───── */
  notice: { cancelled: 'Turn cancelled.', copied: 'Copied.' },

  /* ───── generic a11y ───── */
  a11y: {
    transcript: 'Conversation', queue: 'Prompt queue', context: 'Attached context',
    plan: 'Plan', workingSet: 'Changed files', permissionDialog: 'Hermes approval',
    responseActions: (role: string) => `${role} response actions`,
    thinking: 'Reasoning in progress',
  },

  allowAlwaysNote: '"Always allow" writes to Hermes\'s permanent allowlist — it applies to future sessions.',
  permissionHint: {
    allow_once: 'Allows just this call.',
    allow_session: 'Allows all identical calls for the rest of this agent session.',
    allow_always: 'Allows all identical calls forever (writes to Hermes\'s permanent allowlist).',
    reject_once: 'Denies this call.',
    reject_always: 'Denies this and identical calls for the rest of the session.',
  } as Record<string, string>,

  /* ───── icons by kind (no emoji — symbols + aria-label) ───── */
  icon: {
    file: 'file', folder: 'folder', symbol: 'symbol-method', selection: 'selection',
    diagnostic: 'warning', terminal: 'terminal', git: 'git-branch', url: 'link-external',
    image: 'file-media', skill: 'symbol-event',
    read: 'book', edit: 'edit', delete: 'trash', move: 'arrow-right', search: 'search',
    execute: 'terminal', think: 'lightbulb', fetch: 'cloud-download', switch_mode: 'arrow-swap',
    other: 'tools', showOlder: 'chevron-up',
  } as Record<string, string>,
};
