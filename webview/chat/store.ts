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
  sessionId: null, agent: '', busy: false, modes: [], models: [], commands: [],
  chips: [], queue: [], plan: [], workingSet: [], showReasoning: 'collapsed',
  contextWarnAt: 80, queueEnabled: true, queueDefaultAction: 'queue',
});

export const turns = signal<Turn[]>([]);
export const tools = signal<ToolView[]>([]);
export const permission = signal<PermissionRequest | null>(null);
export const notice = signal<{ level: string; text: string } | null>(null);
export const lastStop = signal<StopReason | null>(null);
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
 * Qual popover do composer está aberto ('meter' | 'send' | null). Eles ancoram no MESMO canto
 * inferior direito (`.composer`), então dois abertos ao mesmo tempo se sobrepõem: o menu do envio
 * cobria a última linha e o botão do popover do medidor (visto no harness em 1440px). Um signal só
 * resolve a exclusividade — não há como abrir o segundo sem fechar o primeiro.
 */
export const openPopover = signal<'meter' | 'send' | null>(null);
