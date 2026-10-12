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
  /**
   * O texto enviado foi CORTADO (só o começo foi anexado) porque passava do teto de tokens de um
   * anexo. A UI mostra o corte e o `title` diz onde está o conteúdo inteiro — anexar em silêncio
   * seria mentir sobre o que foi para o modelo.
   */
  truncated?: boolean;
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

/* ───────────────────── abas (uma conversa por aba) ───────────────────── */

/**
 * Uma aba do chat = UMA sessão do ACP. `busy` e `waiting` são o indicador de lane ativa: a aba
 * mostra spinner enquanto o turno corre e aviso colorido quando há aprovação pendente.
 * `lane` existe só quando a sessão roda num worktree próprio.
 */
/**
 * O que a SESSÃO conhece. Abas (`tabs`/`activeTab`) são do provider — a sessão não sabe que existe
 * uma barra de abas, e das duas uma sessão pode estar visível ao mesmo tempo.
 */
export type SessionState = Omit<ChatState, 'tabs' | 'activeTab'>;

export interface TabInfo {
  /** id estável da aba (criado pelo host; sobrevive a trocar de sessão dentro dela) */
  id: string;
  title: string;
  sessionId: string | null;
  cwd: string;
  agent: string;
  busy: boolean;
  starting?: boolean;
  waiting?: boolean;
  /**
   * Execuções PAUSADAS nesta aba: o turno em andamento é interrompido e a fila deixa de drenar —
   * nenhum envio novo passa até retomar. Uma por aba (a pausa é da lane, não do editor).
   */
  paused?: boolean;
  lane?: { branch: string; path: string } | null;
}

export interface ChatState {
  sessionId: string | null;
  agent: string;
  busy: boolean;
  /** o botão "Iniciar" está criando a sessão (handshake em andamento) — só o host seta */
  starting?: boolean;
  /** execuções pausadas na aba ativa (ver `TabInfo.paused`) */
  paused: boolean;
  /** abas abertas + qual está ativa. O resto deste estado descreve a aba ATIVA. */
  tabs: TabInfo[];
  activeTab: string;
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
  /** abas abertas/ativa mudaram sem trocar o resto do estado (não entra no replay) */
  | { type: 'tabs'; tabs: TabInfo[]; active: string }
  /** reidratação: transcript persistido da sessão */
  | { type: 'hydrate'; turns: unknown[] }
  | { type: 'session'; tab?: string; sessionId: string | null; title?: string }
  | { type: 'busy'; tab?: string; value: boolean }
  | { type: 'user/message'; tab?: string; text: string; chips: ContextChip[] }
  | { type: 'agent/chunk'; tab?: string; messageId: string; text: string; /** true quando o chunk pós-compactação carrega `_meta.hermes.containsCompactionSummary` */ compaction?: boolean }
  | { type: 'agent/message'; tab?: string; messageId: string; text: string }
  | { type: 'thought/chunk'; tab?: string; messageId: string; text: string }
  | { type: 'turn/end'; tab?: string; stopReason: StopReason }
  | { type: 'tool/start'; tab?: string; tool: ToolView }
  | { type: 'tool/update'; tab?: string; id: string; patch: Partial<ToolView> }
  | { type: 'plan'; tab?: string; entries: PlanEntry[] }
  | { type: 'usage'; tab?: string; size: number; used: number; turn?: TurnUsage }
  | { type: 'permission/ask'; tab?: string; req: PermissionRequest }
  | { type: 'permission/resolve'; tab?: string; id: string; outcome: string }
  | { type: 'commands'; tab?: string; commands: SlashCommand[] }
  | { type: 'modes'; tab?: string; modes: ModeInfo[]; current?: string }
  | { type: 'models'; tab?: string; models: ModelInfo[]; current?: string }
  | { type: 'queue'; tab?: string; items: QueueItem[] }
  | { type: 'chips'; tab?: string; chips: ContextChip[] }
  /** o host manda inserir texto no campo (ex.: referência `arquivo:linha` ao anexar uma seleção) */
  | { type: 'draft/insert'; tab?: string; text: string }
  | { type: 'workingset'; tab?: string; files: ChangedFile[] }
  | { type: 'notice'; tab?: string; level: 'info' | 'warning' | 'error'; text: string }
  | { type: 'error'; tab?: string; text: string };

/* ───────────────────── Webview -> Extension ───────────────────── */

export type SendAction = 'send' | 'queue' | 'steer' | 'interrupt';

export type WebviewToHost =
  | { type: 'ready' }
  /** botão "Iniciar": cria a sessão sem prompt, para os seletores receberem modos/modelos */
  | { type: 'start'; tab?: string }
  /* ── abas: uma conversa por aba ── */
  | { type: 'activateTab'; tab: string }
  | { type: 'closeTab'; tab: string }
  | { type: 'renameTab'; tab: string; title: string }
  /** abre aba nova; `worktree` cria um worktree git antes de subir a sessão nele */
  | { type: 'newTab'; cwd?: string; worktree?: { branch?: string } }
  | { type: 'prompt'; tab?: string; text: string; chips: ContextChip[]; action: SendAction }
  /** arquivo/pasta soltos na webview (drag & drop do Explorer) */
  | { type: 'addPath'; path: string }
  /** imagem colada no campo (bitmap do clipboard): base64 SEM o prefixo `data:` */
  | { type: 'attachImage'; name: string; mime: string; data: string }
  | { type: 'cancel'; tab?: string }
  /** pausa/retoma as execuções da aba: interrompe o turno e segura a fila */
  | { type: 'pause'; tab?: string }
  | { type: 'resume'; tab?: string }
  | { type: 'setMode'; tab?: string; modeId: string }
  | { type: 'setModel'; tab?: string; modelId: string }
  | { type: 'setReasoning'; value: 'always' | 'collapsed' | 'hidden' }
  | { type: 'addContext'; source?: string }
  | { type: 'removeChip'; id: string }
  | { type: 'openFile'; path: string; line?: number }
  | { type: 'openDiff'; path: string }
  | { type: 'applyToEditor'; text: string }
  | { type: 'copy'; text: string }
  | { type: 'permission/answer'; id: string; optionId: string }
  | { type: 'queue/remove'; tab?: string; id: string }
  | { type: 'queue/move'; tab?: string; id: string; delta: -1 | 1 }
  | { type: 'queue/clear'; tab?: string }
  | { type: 'queue/sendNow'; tab?: string; id: string }
  | { type: 'compact'; tab?: string }
  | { type: 'newConversation' }
  | { type: 'showSessions' }
  | { type: 'openManage'; manageTab?: string }
  | { type: 'openCli' }
  | { type: 'undoFile'; path: string }
  | { type: 'keepFile'; path: string };
