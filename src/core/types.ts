/**
 * Contrato único Extension Host <-> Webview (e tipos de domínio).
 *
 * Fonte da verdade dos dois lados: a webview importa daqui (`../../src/core/types`).
 * Regras:
 *  - união discriminada por `type`; nunca `any` atravessando a ponte;
 *  - nada de função/símbolo no payload (só JSON);
 *  - adicionar variante é compatível; mudar campo existente é breaking -> bump de PROTOCOL.
 */
export const PROTOCOL = 1;

/* ───────────────────────── domínio ───────────────────────── */

export type StopReason =
  | 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

export interface ContextChip {
  id: string;
  kind: 'file' | 'folder' | 'symbol' | 'selection' | 'diagnostic' | 'terminal' | 'git' | 'url' | 'image' | 'skill';
  label: string;
  /** caminho absoluto, url, ou id do símbolo */
  ref: string;
  /** faixa de linhas quando for trecho */
  lines?: [number, number];
  /** texto que será enviado (arquivo inteiro, trecho, resumo) */
  text?: string;
  tokensEstimate: number;
  /** chip implícito (arquivo ativo / seleção): entra esmaecido e desligável */
  implicit?: boolean;
  /** caminho de imagem, quando kind === 'image' */
  imagePath?: string;
}

export interface ToolView {
  id: string;
  /** ACP ToolKind */
  kind: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  /** texto de entrada/saída já renderizável */
  input?: string;
  output?: string;
  /** diffs trazidos pelo tool_call (patch/write_file/skill_manage) */
  diffs?: FileDiff[];
  locations?: { path: string; line?: number }[];
  startedAt: number;
  endedAt?: number;
}

export interface FileDiff {
  path: string;
  oldText?: string;
  newText?: string;
  added?: number;
  removed?: number;
}

export interface ChangedFile {
  path: string;
  added: number;
  removed: number;
  /** 'M' | 'A' | 'D' */
  status: string;
}

export interface PlanEntry {
  content: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ModeInfo { id: string; name: string; description?: string }
export interface ModelInfo { modelId: string; name: string; description?: string }
export interface SlashCommand { name: string; description: string; hint?: string }

export interface QueueItem { id: string; text: string; chips: ContextChip[] }

export interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  thoughtTokens?: number;
  cachedReadTokens?: number;
}

export interface PermissionOption { optionId: string; name: string; kind: string }

export interface PermissionRequest {
  id: string;
  title: string;
  /** corpo a mostrar: comando ou resumo do diff */
  detail?: string;
  cwd?: string;
  options: PermissionOption[];
  /** epoch ms em que o agente desiste sozinho (approvals.timeout) */
  expiresAt?: number;
}

export interface SessionSummary {
  sessionId: string;
  title?: string;
  cwd?: string;
  updatedAt?: string;
  /** estado derivado no cliente */
  state: 'idle' | 'running' | 'waiting' | 'error';
  pending: number;
}

export interface ChatState {
  sessionId: string | null;
  agent: string;
  busy: boolean;
  modes: ModeInfo[];
  currentMode?: string;
  models: ModelInfo[];
  currentModel?: string;
  commands: SlashCommand[];
  chips: ContextChip[];
  queue: QueueItem[];
  plan: PlanEntry[];
  workingSet: ChangedFile[];
  usage?: { size: number; used: number };
  turnUsage?: TurnUsage;
  showReasoning: 'always' | 'collapsed' | 'hidden';
  contextWarnAt: number;
  queueEnabled: boolean;
  queueDefaultAction: 'queue' | 'steer';
}

/* ───────────────────── Extension -> Webview ───────────────────── */

export type HostToWebview =
  | { type: 'init'; state: ChatState }
  /** reidratação: transcript persistido da sessão */
  | { type: 'hydrate'; turns: unknown[] }
  | { type: 'session'; sessionId: string | null; title?: string }
  | { type: 'busy'; value: boolean }
  | { type: 'user/message'; text: string; chips: ContextChip[] }
  | { type: 'agent/chunk'; messageId: string; text: string }
  | { type: 'agent/message'; messageId: string; text: string }
  | { type: 'thought/chunk'; messageId: string; text: string }
  | { type: 'turn/end'; stopReason: StopReason }
  | { type: 'tool/start'; tool: ToolView }
  | { type: 'tool/update'; id: string; patch: Partial<ToolView> }
  | { type: 'plan'; entries: PlanEntry[] }
  | { type: 'usage'; size: number; used: number; turn?: TurnUsage }
  | { type: 'permission/ask'; req: PermissionRequest }
  | { type: 'permission/resolve'; id: string; outcome: string }
  | { type: 'commands'; commands: SlashCommand[] }
  | { type: 'modes'; modes: ModeInfo[]; current?: string }
  | { type: 'models'; models: ModelInfo[]; current?: string }
  | { type: 'queue'; items: QueueItem[] }
  | { type: 'chips'; chips: ContextChip[] }
  | { type: 'workingset'; files: ChangedFile[] }
  | { type: 'notice'; level: 'info' | 'warning' | 'error'; text: string }
  | { type: 'error'; text: string };

/* ───────────────────── Webview -> Extension ───────────────────── */

export type SendAction = 'send' | 'queue' | 'steer' | 'interrupt';

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'prompt'; text: string; chips: ContextChip[]; action: SendAction }
  | { type: 'cancel' }
  | { type: 'setMode'; modeId: string }
  | { type: 'setModel'; modelId: string }
  | { type: 'setReasoning'; value: 'always' | 'collapsed' | 'hidden' }
  | { type: 'addContext'; source?: string }
  | { type: 'removeChip'; id: string }
  | { type: 'openFile'; path: string; line?: number }
  | { type: 'openDiff'; path: string }
  | { type: 'applyToEditor'; text: string }
  | { type: 'copy'; text: string }
  | { type: 'permission/answer'; id: string; optionId: string }
  | { type: 'queue/remove'; id: string }
  | { type: 'queue/move'; id: string; delta: -1 | 1 }
  | { type: 'queue/clear' }
  | { type: 'queue/sendNow'; id: string }
  | { type: 'compact' }
  | { type: 'newConversation' }
  | { type: 'showSessions' }
  | { type: 'openManage'; tab?: string }
  | { type: 'openCli' }
  | { type: 'undoFile'; path: string }
  | { type: 'keepFile'; path: string };
