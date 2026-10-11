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
  streaming?: boolean;
  startedAt: number;
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
export const draft = signal('');
