/** Estado da webview: signals do @preact/signals. Espelha o contrato HostToWebview. */
import { signal } from '@preact/signals';
import type {
  ChangedFile, ChatState, ContextChip, PlanEntry, QueueItem, SlashCommand, StopReason,
  ToolView, TurnUsage, PermissionRequest, ModeInfo, ModelInfo,
} from '../../src/core/types';

export interface Turn {
  id: string;
  role: 'user' | 'agent';
  text: string;
  chips?: ContextChip[];
  thought?: string;
  /** epoch ms do 1º chunk de raciocínio (para o tempo decorrido) */
  thoughtStartedAt?: number;
  /** duração final do raciocínio (ms), fixada no fim do turno */
  thoughtMs?: number;
  streaming?: boolean;
  startedAt: number;
  /** bloco de raciocínio colapsado manualmente pelo usuário */
  collapsed?: boolean;
}

export const state = signal<ChatState>({
  sessionId: null, agent: '', busy: false, paused: false, modes: [], models: [], commands: [],
  chips: [], queue: [], plan: [], workingSet: [], showReasoning: 'collapsed',
  contextWarnAt: 80, queueEnabled: true, queueDefaultAction: 'queue',
  // preenchidos pelo primeiro `init`/`tabs` do host (o estado por aba vive em `snapshots`)
  tabs: [], activeTab: '',
});

export const turns = signal<Turn[]>([]);
export const tools = signal<ToolView[]>([]);
export const permission = signal<PermissionRequest | null>(null);
export const notice = signal<{ level: string; text: string } | null>(null);
export const lastStop = signal<StopReason | null>(null);
/**
 * Fim do último turno (`turn/end`) — é o que o chat mostra como "Foi concluído.".
 *
 * Antes o fim do turno não tinha aviso NENHUM na webview: o indicador de "pensando" simplesmente
 * parava e a conversa ficava igual a um turno em andamento. Some na primeira mensagem/chunk do
 * turno seguinte (`router.ts`), então só o turno recém-terminado carrega o aviso.
 */
export const turnEnd = signal<{ stopReason: StopReason; at: number } | null>(null);
export const usage = signal<{ size: number; used: number; turn?: TurnUsage } | undefined>(undefined);
export const plan = signal<PlanEntry[]>([]);
export const changed = signal<ChangedFile[]>([]);
export const commands = signal<SlashCommand[]>([]);
export const modes = signal<ModeInfo[]>([]);
export const models = signal<ModelInfo[]>([]);
export const queue = signal<QueueItem[]>([]);
export const chips = signal<ContextChip[]>([]);

/** Rascunho do composer (compartilhado com "editar" do transcript e ações do estado vazio). */
export const draft = signal('');

/** Histórico de prompts enviados (↑/↓ no composer). */
export const userHistory = signal<string[]>([]);

/** Incrementar pede foco no composer (ex.: "editar e reenviar"). */
export const focusComposer = signal(0);

/**
 * Posição do caret no campo, mantida pelo composer. `null` = campo sem foco — aí uma inserção do
 * host (`draft/insert`, ex.: referência `arquivo:linha` de uma seleção) vai para o FIM do rascunho.
 * O router é sem-DOM e não consegue ler o `selectionStart`; este signal é a ponte.
 */
export const caret = signal<number | null>(null);

/**
 * Qual popover do composer está aberto ('meter' | 'send' | null). Eles ancoram no MESMO canto
 * inferior direito (`.composer`), então dois abertos ao mesmo tempo se sobrepõem: o menu do envio
 * cobria a última linha e o botão do popover do medidor (visto no harness em 1440px). Um signal só
 * resolve a exclusividade — não há como abrir o segundo sem fechar o primeiro.
 */
export const openPopover = signal<'meter' | 'send' | null>(null);

/* ─────────── estado por aba ─────────── *
 *
 * Os signals acima são SEMPRE o espelho da aba ATIVA. Cada aba tem um snapshot (transcript +
 * permissão + medidor) guardado em `snapshots`; mensagens de sessão chegam com a aba selada
 * (`tab`), então as de uma aba de FUNDO mexem no snapshot dela sem tocar na aba visível — é isso
 * que faz uma lane continuar acumulando turnos em background.
 *
 * O que NÃO entra no snapshot: `tabs`/`activeTab` (são do host e vivem em `state`) e os campos de
 * configuração (showReasoning, queueEnabled…), que são globais e iguais em todas as abas.
 */

export interface Snapshot {
  state: ChatState;
  turns: Turn[];
  tools: ToolView[];
  plan: PlanEntry[];
  changed: ChangedFile[];
  usage?: { size: number; used: number; turn?: TurnUsage };
  queue: QueueItem[];
  chips: ContextChip[];
  permission: PermissionRequest | null;
  notice: { level: string; text: string } | null;
  lastStop: StopReason | null;
  turnEnd: { stopReason: StopReason; at: number } | null;
}

const snapshots = new Map<string, Snapshot>();

/** Aba recém-criada: conversa vazia, herdando só a configuração global do estado corrente. */
function blank(id: string): Snapshot {
  const base = state.value;
  return {
    state: {
      ...base, sessionId: null, busy: false, starting: false, paused: false,
      modes: [], currentMode: undefined, models: [], currentModel: undefined, commands: [],
      chips: [], queue: [], plan: [], workingSet: [], usage: undefined, turnUsage: undefined,
      tabs: base.tabs, activeTab: id,
    },
    turns: [], tools: [], plan: [], changed: [], usage: undefined,
    queue: [], chips: [], permission: null, notice: null, lastStop: null, turnEnd: null,
  };
}

export function snapshotOf(id: string): Snapshot {
  let s = snapshots.get(id);
  if (!s) { s = blank(id); snapshots.set(id, s); }
  return s;
}

export function readSnapshot(): Snapshot {
  return {
    state: state.value, turns: turns.value, tools: tools.value, plan: plan.value,
    changed: changed.value, usage: usage.value, queue: queue.value, chips: chips.value,
    permission: permission.value, notice: notice.value, lastStop: lastStop.value,
    turnEnd: turnEnd.value,
  };
}

function applySnapshot(s: Snapshot): void {
  state.value = s.state;
  turns.value = s.turns; tools.value = s.tools; plan.value = s.plan; changed.value = s.changed;
  usage.value = s.usage; queue.value = s.queue; chips.value = s.chips;
  permission.value = s.permission; notice.value = s.notice; lastStop.value = s.lastStop;
  turnEnd.value = s.turnEnd;
}

/** Guarda o estado vivo na aba ativa (antes de trocar de aba). */
export function captureActive(): void {
  if (state.value.activeTab) snapshots.set(state.value.activeTab, readSnapshot());
}

/** Roda `run` no estado de uma aba de FUNDO: a aba ativa fica intacta no fim. */
export function routeBackground(tab: string, run: () => void): void {
  const live = readSnapshot();
  applySnapshot(snapshotOf(tab));
  run();
  snapshots.set(tab, readSnapshot());
  applySnapshot(live);
}

/** Troca a aba ativa: guarda a atual e restaura o transcript da nova. */
export function switchTab(tab: string): void {
  captureActive();
  restoreTranscript(snapshotOf(tab));
}

/** Só o transcript da aba (o resto do estado da nova aba vem do `init` do host). */
export function restoreTranscript(s: Snapshot): void {
  turns.value = s.turns; tools.value = s.tools; plan.value = s.plan; changed.value = s.changed;
  usage.value = s.usage; queue.value = s.queue; chips.value = s.chips;
  permission.value = s.permission; notice.value = s.notice; lastStop.value = s.lastStop;
  turnEnd.value = s.turnEnd;
}
