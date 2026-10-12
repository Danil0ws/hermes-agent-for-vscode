/**
 * Sessão ACP: cria/retoma sessões, envia prompts e traduz `session/update`
 * nas mensagens do contrato (HostToWebview).
 *
 * Fonte de cada campo (verificado em docs/ARCHITECTURE.md §6):
 *  - agent_message_chunk / agent_thought_chunk / tool_call / tool_call_update / plan /
 *    available_commands_update / current_mode_update / usage_update / session_info_update;
 *  - modes e models vêm da resposta de session/new (e de set_model).
 * Sem `usage_update` o medidor fica em "—": nunca estimamos o total da janela.
 */
import * as acp from '@agentclientprotocol/sdk';
import { basename } from 'node:path';
import { tr } from '../l10n';
import type {
  ChangedFile, SessionState, ContextChip, FileDiff, HostToWebview, ModeInfo, ModelInfo,
  PermissionRequest, PlanEntry, SessionSummary, SlashCommand, ToolView, TurnUsage,
} from './types';

export interface SessionDeps {
  /** caminhos permitidos para escrita do agente (fs/write_text_file) */
  isPathAllowed(path: string, write: boolean): boolean;
  /** lê arquivo do workspace (fs/read_text_file) */
  readFile(path: string): Promise<string>;
  /** escreve arquivo do workspace (fs/write_text_file) */
  writeFile(path: string, content: string): Promise<void>;
  /** pede aprovação ao usuário; devolve o optionId escolhido */
  askPermission(req: PermissionRequest, resolve: (optionId: string | null) => void): void;
  /** log de tráfego / erros */
  log?(level: 'info' | 'warn' | 'error', text: string): void;
}

/* ── Tipos do que o agente REALMENTE manda (verificado por probe em 11/out-2026).
      O SDK 1.8.0 não tipa `models` nem `session/set_model`/`session/fork`, que o
      adapter do Hermes implementa; lemos por cast e enviamos por `extMethod`. ── */
interface SessionModeStateLite {
  availableModes: { id: string; name: string; description?: string | null }[];
  currentModeId?: string | null;
}
interface SessionModelStateLite {
  availableModels: { modelId: string; name: string; description?: string | null }[];
  currentModelId?: string | null;
}
interface SessionResponseLite {
  sessionId?: string;
  modes?: SessionModeStateLite | null;
  models?: SessionModelStateLite | null;
}
/** chama um método do agente que o SDK não expõe tipado (extensões `session/*` do Hermes). */
async function ext<T>(conn: acp.ClientSideConnection, method: string, params: Record<string, unknown>): Promise<T> {
  return (await conn.extMethod(method, params)) as T;
}

const KINDS = new Set(['read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other']);

/** tool que ainda "está rodando": só estes dois estados; qualquer outro já terminou. Predicado local
 *  do core — espelha `webview/chat/status.ts` sem importá-lo (o core não depende da webview). */
const isOpen = (t: ToolView): boolean => t.status === 'pending' || t.status === 'in_progress';

export class HermesSession {
  readonly sessionId: string;
  private state: SessionState;
  private tools = new Map<string, ToolView>();
  private workingSet = new Map<string, ChangedFile>();
  private pending = new Map<string, (optionId: string | null) => void>();
  private permissionSeq = 0;
  /** id do turno mais recente (1-based). `0` nunca é um id real: é o sentinel do `cancel()` sem turno. */
  private turnSeq = 0;
  /** turno aberto de verdade; `null` quando nenhum prompt está em andamento. */
  private openTurn: number | null = null;

  constructor(
    readonly conn: acp.ClientSideConnection,
    sessionId: string,
    private readonly deps: SessionDeps,
    private readonly emit: (m: HostToWebview) => void,
    state: SessionState,
  ) {
    this.sessionId = sessionId;
    this.state = state;
  }

  get snapshot(): SessionState { return this.state; }
  get busy(): boolean { return this.state.busy; }

  /* ─────────── ciclo de vida ─────────── */

  static async create(
    conn: acp.ClientSideConnection, cwd: string,
    deps: SessionDeps, emit: (m: HostToWebview) => void, agent: string,
  ): Promise<HermesSession> {
    const res = (await conn.newSession({ cwd, mcpServers: [] })) as unknown as SessionResponseLite;
    const state: SessionState = {
      sessionId: res.sessionId ?? '',
      agent,
      busy: false,
      paused: false, // a pausa é do PROVIDER (aba), não da sessão: aqui só existe o campo
      modes: toModes(res.modes),
      currentMode: res.modes?.currentModeId ?? undefined,
      models: toModels(res.models),
      currentModel: res.models?.currentModelId ?? undefined,
      commands: [],
      chips: [],
      queue: [],
      plan: [],
      workingSet: [],
      showReasoning: 'collapsed',
      contextWarnAt: 80,
      queueEnabled: true,
      queueDefaultAction: 'queue',
    };
    const session = new HermesSession(conn, res.sessionId ?? '', deps, emit, state);
    session.emitScope();
    return session;
  }

  /**
   * Anuncia o escopo da sessão (modos e catálogo de modelos) para quem estiver ouvindo.
   *
   * `session/new` já traz os dois, mas a sessão só emitia em EVENTOS de mudança — então a sessão
   * criada sob demanda dentro do `send()` ficava com os seletores vazios a conversa inteira: o
   * `init` que a webview recebeu foi montado quando ainda não havia sessão (`modes: []`). Emitir
   * no nascimento cobre TODOS os caminhos que criam sessão (primeiro prompt, nova conversa, abrir
   * do histórico) num lugar só, em vez de depender de cada chamador lembrar de reenviar o estado.
   */
  private emitScope(): void {
    this.emit({ type: 'modes', modes: this.state.modes, current: this.state.currentMode });
    this.emit({ type: 'models', models: this.state.models, current: this.state.currentModel });
  }

  static async load(
    conn: acp.ClientSideConnection, cwd: string, sessionId: string,
    deps: SessionDeps, emit: (m: HostToWebview) => void, agent: string,
  ): Promise<HermesSession | undefined> {
    const res = (await conn.loadSession({ cwd, sessionId, mcpServers: [] })) as unknown as SessionResponseLite | null;
    if (!res) return undefined;
    const session = new HermesSession(conn, sessionId, deps, emit, {
      sessionId, agent, busy: false, paused: false, modes: toModes(res.modes), currentMode: res.modes?.currentModeId ?? undefined,
      models: toModels(res.models), currentModel: res.models?.currentModelId ?? undefined,
      commands: [], chips: [], queue: [], plan: [], workingSet: [],
      showReasoning: 'collapsed', contextWarnAt: 80, queueEnabled: true, queueDefaultAction: 'queue',
    });
    // o agente replaya o histórico como session/update antes de responder: o roteador já cuidou.
    session.emitScope();
    return session;
  }

  async list(conn: acp.ClientSideConnection, cwd: string): Promise<SessionSummary[]> {
    const out: SessionSummary[] = [];
    let cursor: string | undefined;
    do {
      const page = await conn.listSessions({ cwd, cursor });
      for (const s of page.sessions) {
        out.push({ sessionId: s.sessionId, title: s.title ?? undefined, cwd: s.cwd, updatedAt: s.updatedAt ?? undefined, state: 'idle', pending: 0 });
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return out;
  }

  async fork(cwd: string): Promise<string | undefined> {
    // `session/fork` existe no adapter do Hermes e no protocolo, mas não no SDK 1.8.0.
    const res = await ext<{ sessionId?: string }>(this.conn, 'session/fork', {
      sessionId: this.sessionId, cwd, mcpServers: [],
    });
    return res.sessionId || undefined;
  }

  /* ─────────── turno ─────────── */

  async prompt(text: string, chips: ContextChip[] = []): Promise<acp.StopReason | 'error'> {
    this.state.busy = true;
    this.emit({ type: 'busy', value: true });
    const id = ++this.turnSeq;
    this.openTurn = id;
    let stop: acp.StopReason | 'cancelled' = 'cancelled';
    try {
      const res = await this.conn.prompt({
        sessionId: this.sessionId,
        prompt: toContentBlocks(text, chips),
      });
      const turn = toTurnUsage(res.usage);
      if (turn) {
        this.state.turnUsage = turn;
        this.emit({ type: 'usage', size: this.state.usage?.size ?? 0, used: this.state.usage?.used ?? 0, turn });
      }
      stop = res.stopReason;
      return res.stopReason;
    } catch (err) {
      this.deps.log?.('error', `prompt falhou: ${String(err)}`);
      this.emit({ type: 'error', text: String(err) });
      // `cancelled` no catch TAMBÉM encerra o turno (via `settle` no `finally`): é o ÚNICO evento que
      // limpa o `streaming` na webview. Sem ele, um turno que terminou com erro deixava o indicador
      // de "pensando" girando para sempre — o sintoma relatado ("depois de concluído ele fica
      // pensando"). `cancelled` é a verdade: o turno não chegou ao fim pelo caminho normal.
      stop = 'cancelled';
      return 'error';
    } finally {
      // O `finally` cobre TODOS os caminhos terminais (sucesso, erro, cancel) num só lugar: fecha as
      // tools que ficaram abertas, emite `turn/end` e zera `busy` — inclusive quando o `cancel()` já
      // liquidou o turno antes (aí `settle` é no-op e nada duplica).
      this.settle(id, stop);
    }
  }

  /**
   * Encerra um turno: fecha as tools ainda abertas, emite `turn/end` e zera `busy`.
   *
   * Idempotente e seguro contra corrida: só o turno ainda aberto (`openTurn === id`) é liquidado, e
   * a primeira chamada zera `openTurn`. Assim uma segunda chamada (o `finally` do prompt depois de
   * um cancel, ou um novo cancel) vira no-op e NÃO duplica mensagens; e o `finally` de um prompt
   * ANTIGO não derruba um turno NOVO que já assumiu (`openTurn` aponta para o mais recente).
   */
  private settle(id: number, stopReason: acp.StopReason | 'cancelled'): void {
    if (this.openTurn !== id) return;
    this.openTurn = null;
    const endedAt = Date.now();
    for (const tool of this.tools.values()) {
      if (!isOpen(tool)) continue;
      this.tools.set(tool.id, { ...tool, status: 'cancelled', endedAt });
      this.emit({ type: 'tool/update', id: tool.id, patch: { status: 'cancelled', endedAt } });
    }
    this.emit({ type: 'turn/end', stopReason });
    this.state.busy = false;
    this.emit({ type: 'busy', value: false });
  }

  async cancel(): Promise<void> {
    // O protocolo manda responder toda permissão pendente com "cancelled" ao cancelar.
    for (const [id, resolve] of this.pending) {
      resolve(null);
      this.emit({ type: 'permission/resolve', id, outcome: 'cancelled' });
    }
    this.pending.clear();
    await this.conn.cancel({ sessionId: this.sessionId });
    // Liquidar o turno NA HORA, sem esperar a resposta do agente ao cancel: ele pode nunca responder
    // e a UI ficaria girando para sempre com a tool "rodando" e `busy` ligado. `?? 0` cobre o cancel
    // sem turno aberto — `settle(0)` cai no guard (openTurn é `null` por construção) e é no-op.
    this.settle(this.openTurn ?? 0, 'cancelled');
  }

  async setMode(modeId: string): Promise<void> {
    try {
      await this.conn.setSessionMode({ sessionId: this.sessionId, modeId });
      this.state.currentMode = modeId;
    } finally {
      // O agente NÃO emite `current_mode_update` ao trocar de modo (verificado no adaptador: ele
      // grava `state.mode`, salva a sessão e responde `{}`), então sem este emit a webview fica com
      // o modo VELHO no estado e o seletor do composer volta para "Default" no `init` seguinte.
      // No `finally` porque a falha também tem de ser contada: aí o valor emitido é o antigo, que é
      // a verdade — o erro em si sobe para quem chamou.
      this.emit({ type: 'modes', modes: this.state.modes, current: this.state.currentMode });
    }
  }

  async setModel(modelId: string): Promise<void> {
    // `session/set_model` é o caminho do Hermes (o `set_config_option` do adapter é um stub
    // que devolve configOptions vazio — verificado).
    const res = await ext<{ models?: SessionModelStateLite | null }>(this.conn, 'session/set_model', {
      sessionId: this.sessionId, modelId,
    });
    this.state.currentModel = res.models?.currentModelId ?? modelId;
    const models = toModels(res.models);
    if (models.length) this.state.models = models;
    this.emit({ type: 'models', models: this.state.models, current: this.state.currentModel });
  }

  setChips(chips: ContextChip[]): void {
    this.state.chips = chips;
    this.emit({ type: 'chips', chips });
  }

  /* ─────────── roteador de session/update ─────────── */

  handleUpdate(update: acp.SessionUpdate): void {
    const u = update as Record<string, unknown> & { sessionUpdate: string };
    const messageId = (u.messageId as string) ?? this.sessionId;
    switch (u.sessionUpdate) {
      case 'agent_message_chunk': {
        const text = textOf(u.content);
        if (text) this.emit({ type: 'agent/chunk', messageId, text });
        break;
      }
      case 'agent_thought_chunk': {
        const text = textOf(u.content);
        if (text) this.emit({ type: 'thought/chunk', messageId, text });
        break;
      }
      case 'user_message_chunk': {
        const text = textOf(u.content);
        if (text) this.emit({ type: 'user/message', text, chips: [] });
        break;
      }
      case 'tool_call': {
        const tool = this.toolFrom(u, 'pending');
        if (u.title && u.status) tool.status = String(u.status) as ToolView['status'];
        this.tools.set(tool.id, tool);
        if (u._meta && (u._meta as Record<string, unknown>).hermes) { /* provenance: só lemos */ }
        this.emit({ type: 'tool/start', tool });
        break;
      }
      case 'tool_call_update': {
        const id = String(u.toolCallId);
        const tool = this.tools.get(id);
        const patch: Partial<ToolView> = {};
        if (u.status) patch.status = String(u.status) as ToolView['status'];
        if (u.title) patch.title = String(u.title);
        const out = contentText(u.content);
        if (out) patch.output = out;
        const diffs = diffBlocks(u.content);
        if (diffs.length) { patch.diffs = diffs; this.recordDiffs(diffs); }
        if (patch.status && patch.status !== 'pending' && patch.status !== 'in_progress') patch.endedAt = Date.now();
        if (tool) this.tools.set(id, { ...tool, ...patch });
        this.emit({ type: 'tool/update', id, patch });
        break;
      }
      case 'plan': {
        const entries = (u.entries as PlanEntry[]) ?? [];
        this.state.plan = entries;
        this.emit({ type: 'plan', entries });
        break;
      }
      case 'available_commands_update': {
        const commands = ((u.availableCommands as unknown[]) ?? []).map((c) => {
          const cmd = c as Record<string, unknown>;
          return {
            name: `/${String(cmd.name)}`,
            description: String(cmd.description ?? ''),
            hint: (cmd.input as Record<string, unknown> | undefined)?.hint as string | undefined,
          } satisfies SlashCommand;
        });
        this.state.commands = commands;
        this.emit({ type: 'commands', commands });
        break;
      }
      case 'current_mode_update': {
        this.state.currentMode = String(u.currentModeId);
        this.emit({ type: 'modes', modes: this.state.modes, current: this.state.currentMode });
        break;
      }
      case 'session_info_update': {
        if (u.title) this.emit({ type: 'session', sessionId: this.sessionId, title: String(u.title) });
        break;
      }
      case 'usage_update': {
        const size = Number(u.size ?? 0);
        const used = Number(u.used ?? 0);
        this.state.usage = { size, used };
        this.emit({ type: 'usage', size, used });
        break;
      }
      // Variantes que o Hermes não emite hoje (notice, compaction_*, config_option_update):
      // ignoradas de propósito. Se um dia vierem, entram aqui sem quebrar nada.
      default:
        this.deps.log?.('info', `session/update ignorado: ${u.sessionUpdate}`);
    }
  }

  /* ─────────── permissão ─────────── */

  requestPermission(req: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    const id = `perm-${++this.permissionSeq}`;
    const options = (req.options ?? []).map((o) => ({ optionId: o.optionId, name: o.name, kind: String(o.kind) }));
    const startedAt = Date.now();
    const detail = permissionDetail(req.toolCall);
    const view: PermissionRequest = {
      id,
      title: req.toolCall?.title ?? tr('Aprovação necessária'),
      detail,
      cwd: (req.toolCall?._meta as Record<string, unknown> | undefined)?.cwd as string | undefined,
      options,
      expiresAt: startedAt + 300_000,
    };
    return new Promise<acp.RequestPermissionResponse>((resolve) => {
      this.pending.set(id, (optionId) => {
        resolve(optionId ? { outcome: { outcome: 'selected', optionId } as acp.RequestPermissionOutcome } : { outcome: { outcome: 'cancelled' } as acp.RequestPermissionOutcome });
      });
      this.deps.askPermission(view, (optionId) => {
        const fn = this.pending.get(id);
        if (!fn) return;
        this.pending.delete(id);
        this.emit({ type: 'permission/resolve', id, outcome: optionId ?? 'cancelled' });
        fn(optionId);
      });
    });
  }

  /* ─────────── fs/* (confinado ao workspace) ─────────── */

  async readTextFile(p: acp.ReadTextFileRequest): Promise<acp.ReadTextFileResponse> {
    return { content: await this.deps.readFile(p.path) };
  }

  async writeTextFile(p: acp.WriteTextFileRequest): Promise<acp.WriteTextFileResponse> {
    if (!this.deps.isPathAllowed(p.path, true)) throw new Error(`escrita fora do workspace: ${p.path}`);
    await this.deps.writeFile(p.path, p.content);
    return {};
  }

  /* ─────────── helpers ─────────── */

  private toolFrom(u: Record<string, unknown>, status: ToolView['status']): ToolView {
    const kind = String(u.kind ?? 'other');
    const diffs = diffBlocks(u.content);
    if (diffs.length) this.recordDiffs(diffs);
    return {
      id: String(u.toolCallId),
      kind: KINDS.has(kind) ? kind : 'other',
      title: String(u.title ?? ''),
      status,
      input: contentText(u.rawInput) ?? truncate(JSON.stringify(u.rawInput ?? ''), 400),
      diffs,
      locations: ((u.locations as { path: string; line?: number }[]) ?? []).map((l) => ({ path: l.path, line: l.line })),
      startedAt: Date.now(),
    };
  }

  private recordDiffs(diffs: FileDiff[]): void {
    let changed = false;
    for (const d of diffs) {
      const prev = this.workingSet.get(d.path);
      this.workingSet.set(d.path, {
        path: d.path,
        status: d.newText && !d.oldText ? 'A' : d.oldText && !d.newText ? 'D' : 'M',
        added: (prev?.added ?? 0) + (d.added ?? countLines(d.newText, '+')),
        removed: (prev?.removed ?? 0) + (d.removed ?? countLines(d.oldText, '-')),
      });
      changed = true;
    }
    if (changed) this.emit({ type: 'workingset', files: [...this.workingSet.values()] });
  }

  /** diffs acumulados nesta sessão (usado para "desfazer por arquivo") */
  get changedFiles(): ChangedFile[] { return [...this.workingSet.values()]; }
  diffsFor(path: string): FileDiff[] {
    return [...this.tools.values()].flatMap((t) => t.diffs ?? []).filter((d) => d.path === path);
  }
}

/* ─────────── conversões ─────────── */

function toModes(m?: SessionModeStateLite | null): ModeInfo[] {
  return (m?.availableModes ?? []).map((x) => ({ id: x.id, name: x.name, description: x.description ?? undefined }));
}
function toModels(m?: SessionModelStateLite | null): ModelInfo[] {
  return (m?.availableModels ?? []).map((x) => ({ modelId: x.modelId, name: x.name, description: x.description ?? undefined }));
}
function toTurnUsage(u?: acp.Usage | null): TurnUsage | undefined {
  if (!u) return undefined;
  return {
    inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens,
    thoughtTokens: u.thoughtTokens ?? undefined, cachedReadTokens: u.cachedReadTokens ?? undefined,
  };
}

function textOf(content: unknown): string | undefined {
  const c = content as { type?: string; text?: string } | undefined;
  return c?.type === 'text' ? c.text : undefined;
}

/** Concatena texto de blocos de saída (content blocks de tool result). */
function contentText(content: unknown): string | undefined {
  if (!content) return undefined;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return textOf(content);
  const parts: string[] = [];
  for (const block of content) {
    const b = block as Record<string, unknown>;
    if (b.type === 'text') parts.push(String((b as { text?: string }).text ?? ''));
    else if (b.type === 'content') parts.push(contentText(b.content) ?? '');
    else if (b.type === 'diff') parts.push(`--- ${String(b.path)}\n`);
  }
  return parts.join('').trim() || undefined;
}

function diffBlocks(content: unknown): FileDiff[] {
  if (!Array.isArray(content)) return [];
  const out: FileDiff[] = [];
  for (const block of content) {
    const b = block as Record<string, unknown>;
    const raw = b.type === 'diff' ? b : b.type === 'content' ? ((b.content as Record<string, unknown>) ?? {}) : undefined;
    if (!raw || raw.type !== 'diff') continue;
    out.push({
      path: String(raw.path),
      oldText: (raw.oldText as string | null) ?? undefined,
      newText: (raw.newText as string | null) ?? undefined,
    });
  }
  // diff também pode chegar como texto unificado dentro de um bloco de texto
  for (const block of content) {
    const b = block as Record<string, unknown>;
    if (b.type !== 'text') continue;
    const text = String(b.text ?? '');
    if (!text.includes('--- ') || !text.includes('+++ ')) continue;
    for (const d of parseUnifiedDiff(text)) out.push(d);
  }
  return out;
}

/** Parser mínimo de diff unificado: blocos `--- a/x` / `+++ b/x`. Um caso por arquivo. */
export function parseUnifiedDiff(text: string): FileDiff[] {
  const out: FileDiff[] = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const m = /^---\s+(\S.*)$/.exec(lines[i]);
    if (!m) { i++; continue; }
    const next = lines[i + 1] ?? '';
    const m2 = /^\+\+\+\s+(\S.*)$/.exec(next);
    if (!m2) { i++; continue; }
    const oldLines: string[] = [];
    const newLines: string[] = [];
    let j = i + 2;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (/^---\s+\S/.test(l) && /^\+\+\+\s+\S/.test(lines[j + 1] ?? '')) break;
      if (l.startsWith('-')) oldLines.push(l.slice(1));
      else if (l.startsWith('+')) newLines.push(l.slice(1));
      else { oldLines.push(l.startsWith(' ') ? l.slice(1) : l); newLines.push(l.startsWith(' ') ? l.slice(1) : l); }
    }
    out.push({ path: cleanPath(m2[1]), oldText: oldLines.join('\n'), newText: newLines.join('\n') });
    i = j;
  }
  return out;
}

function cleanPath(p: string): string {
  const t = p.split('\t')[0].trim();
  return t.replace(/^[ab]\//, '');
}
function countLines(text: string | undefined, prefix: string): number {
  if (!text) return 0;
  return text.split('\n').filter((l) => l.startsWith(prefix)).length;
}
function truncate(s: string, n: number): string { return s.length > n ? `${s.slice(0, n)}…` : s; }

/** Blocos de conteúdo do prompt. Imagens são capability anunciada; arquivos entram como TEXTO
 *  porque o Hermes não anuncia `embeddedContext` (ver ARCHITECTURE §3.8). */
export function toContentBlocks(text: string, chips: ContextChip[]): acp.ContentBlock[] {
  const blocks: acp.ContentBlock[] = [];
  const files = chips.filter((c) => c.text && c.kind !== 'image');
  if (files.length) {
    const header = files
      .map((c) => `<!-- ${basename(c.ref)}${c.lines ? ` L${c.lines[0]}–L${c.lines[1]}` : ''}: ${c.ref} -->`)
      .join('\n');
    const body = files.map((c) => `### ${c.ref}${c.lines ? ` (linhas ${c.lines[0]}–${c.lines[1]})` : ''}\n\`\`\`\n${c.text}\n\`\`\``).join('\n\n');
    blocks.push({ type: 'text', text: `${header}\n\n${body}` });
  }
  if (text.trim()) blocks.push({ type: 'text', text });
  for (const img of chips.filter((c) => c.kind === 'image' && c.imagePath)) {
    blocks.push({ type: 'image', data: img.text ?? '', mimeType: 'image/png' });
  }
  return blocks.length ? blocks : [{ type: 'text', text: '' }];
}

function permissionDetail(toolCall?: acp.ToolCallUpdate | acp.ToolCall): string | undefined {
  if (!toolCall) return undefined;
  const raw = toolCall.rawInput as Record<string, unknown> | undefined;
  const cmd = raw?.command ?? raw?.file_path ?? raw?.path;
  if (typeof cmd === 'string') return cmd;
  const text = contentText((toolCall as { content?: unknown }).content);
  return text ? truncate(text, 2000) : undefined;
}
