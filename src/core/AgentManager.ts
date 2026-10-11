/**
 * AgentManager: dona da conexão ACP e das sessões.
 *
 * Implementa o lado Client do ACP (`acp.Client`) e roteia cada `session/update`
 * para a HermesSession correspondente. Aqui também vivem o confinamento de fs/*
 * ao workspace e a fila de aprovações pendentes.
 */
import * as vscode from 'vscode';
import * as acp from '@agentclientprotocol/sdk';
import { Connection, type AgentConfig } from './Connection';
import { HermesSession, type SessionDeps } from './HermesSession';
import { settings } from '../config/Settings';
import type { HostToWebview, PermissionRequest, SessionSummary } from './types';

export class AgentManager implements acp.Client {
  private conn?: Connection;
  private sessions = new Map<string, HermesSession>();
  private handlers: ((m: HostToWebview) => void)[] = [];
  private authHandler?: () => void;

  constructor(private readonly log: (level: 'info' | 'warn' | 'error', text: string) => void) {}

  get connected(): boolean { return !!this.conn?.alive; }
  get session(): HermesSession | undefined {
    const id = [...this.sessions.keys()].at(-1);
    return id ? this.sessions.get(id) : undefined;
  }
  get allSessions(): HermesSession[] { return [...this.sessions.values()]; }

  /** Aditivo de propósito: a view de chat, o tree de sessões e as features assinam o mesmo bus. */
  onEvent(fn: (m: HostToWebview) => void): vscode.Disposable {
    this.handlers.push(fn);
    return new vscode.Disposable(() => {
      const i = this.handlers.indexOf(fn);
      if (i >= 0) this.handlers.splice(i, 1);
    });
  }

  private notify(m: HostToWebview): void {
    for (const fn of [...this.handlers]) {
      try { fn(m); } catch (e) { this.log('warn', `handler de evento falhou: ${String(e)}`); }
    }
  }
  onAuthRequired(fn: () => void): void { this.authHandler = fn; }

  async connect(cfg: AgentConfig, cwd: string): Promise<void> {
    this.dispose();
    this.conn = new Connection(cfg, {
      onStderr: (l) => this.log('info', l),
      onExit: (code, signal) => {
        this.log('error', `hermes acp saiu (code=${code} signal=${signal})`);
        this.notify({ type: 'error', text: 'A conexão com o Hermes caiu. Reinicie a sessão.' });
      },
    });
    const init = await this.conn.start(cwd, this);
    this.log('info', `ACP conectado: ${init.agentInfo?.name ?? '?'} ${init.agentInfo?.version ?? ''} protocolo v${init.protocolVersion}`);
  }

  get capabilities() { return this.selfInit?.agentCapabilities; }
  private selfInit?: acp.InitializeResponse;
  setInit(init: acp.InitializeResponse): void { this.selfInit = init; }

  /* ─────────── sessões ─────────── */

  async newSession(cfg: AgentConfig, cwd: string, agentName: string): Promise<HermesSession> {
    if (!this.connected) await this.connect(cfg, cwd);
    const deps = this.deps();
    const session = await HermesSession.create(this.conn!.connection, cwd, deps, (m) => this.notify(m), agentName);
    this.sessions.set(session.sessionId, session);
    return session;
  }

  async loadSession(cwd: string, sessionId: string, agentName: string): Promise<HermesSession | undefined> {
    if (!this.conn) throw new Error('sem conexão');
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const session = await HermesSession.load(this.conn.connection, cwd, sessionId, this.deps(), (m) => this.notify(m), agentName);
    if (session) this.sessions.set(sessionId, session);
    return session;
  }

  async listSessions(cwd: string): Promise<SessionSummary[]> {
    if (!this.conn) return [];
    const probe = this.session;
    if (probe) return probe.list(this.conn.connection, cwd);
    return [];
  }

  async answerPermission(id: string, optionId: string): Promise<void> {
    // Guarda a CONCESSÃO (não a negação) para a política `allowSession` não voltar a perguntar
    // o que o usuário já autorizou nesta sessão do ACP.
    const req = this.pendingPermReq.get(id);
    const chosen = req?.options.find((o) => o.optionId === optionId);
    if (chosen && !chosen.kind.startsWith('reject')) {
      this.sessionGrants.add(chosen.kind);
      this.log('info', `concessão registrada na sessão: ${chosen.kind}`);
    }
    this.pendingPermReq.delete(id);
    this.pendingPerms.get(id)?.(optionId);
    this.pendingPerms.delete(id);
  }

  disposables(): vscode.Disposable {
    return new vscode.Disposable(() => this.dispose());
  }

  dispose(): void {
    for (const s of this.sessions.values()) void s.cancel().catch(() => {});
    this.sessions.clear();
    this.conn?.stop();
    this.conn = undefined;
  }

  /* ─────────── SessionDeps: workspace, arquivos, permissões ─────────── */

  private pendingPerms = new Map<string, (optionId: string | null) => void>();
  private pendingPermReq = new Map<string, PermissionRequest>();
  /** Concessões já dadas nesta sessão do ACP, para a política `allowSession`. */
  private sessionGrants = new Set<string>();

  /**
   * Política de aprovação → resposta automática, ou `null` para perguntar.
   *
   * `ask`: sempre pergunta. `allowAll` (YOLO): responde sozinho com a primeira opção de permissão
   * que o agente ofereceu — nunca com uma opção de negar. `allowSession`: repete a concessão que o
   * usuário já deu nesta sessão, sem voltar a perguntar.
   *
   * As opções respondidas são SEMPRE as que o agente mandou: a política escolhe entre elas, não
   * inventa uma.
   */
  private autoAnswer(req: PermissionRequest): string | null {
    const policy = settings().permissions;
    if (policy === 'ask') return null;
    const allows = req.options.filter((o) => !o.kind.startsWith('reject'));
    if (allows.length === 0) return null;
    if (policy === 'allowAll') return allows[0].optionId;
    const known = allows.find((o) => this.sessionGrants.has(o.kind));
    return known?.optionId ?? null;
  }

  private deps(): SessionDeps {
    return {
      isPathAllowed: (p, write) => this.isPathAllowed(p, write),
      readFile: async (p) => {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(p));
        return new TextDecoder().decode(bytes);
      },
      writeFile: async (p, content) => {
        await vscode.workspace.fs.writeFile(vscode.Uri.file(p), new TextEncoder().encode(content));
      },
      askPermission: (req: PermissionRequest, resolve) => {
        const auto = this.autoAnswer(req);
        if (auto) {
          const kind = req.options.find((o) => o.optionId === auto)?.kind ?? auto;
          this.log('info', `aprovação automática (hermes.permissions=${settings().permissions}): ${req.title ?? req.id} → ${kind}`);
          resolve(auto);
          return;
        }
        this.pendingPerms.set(req.id, resolve);
        this.pendingPermReq.set(req.id, req);
        this.notify({ type: 'permission/ask', req });
      },
      log: this.log,
    };
  }

  /** Confinamento ao workspace: leitura livre, escrita só dentro (ou com confirmação fora). */
  private isPathAllowed(p: string, write: boolean): boolean {
    if (!write) return true;
    const roots = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const tmp = ['/tmp/', '/private/tmp/', '/var/folders/'];
    return roots.some((r) => p === r || p.startsWith(r + '/')) || tmp.some((t) => p.startsWith(t));
  }

  /* ─────────── acp.Client ─────────── */

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    const session = this.sessions.get(params.sessionId);
    if (!session) { this.log('info', `update para sessão desconhecida ${params.sessionId}`); return; }
    session.handleUpdate(params.update);
  }

  async requestPermission(params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    const session = this.sessions.get(params.sessionId);
    if (!session) return { outcome: { outcome: 'cancelled' } as acp.RequestPermissionOutcome };
    return session.requestPermission(params);
  }

  async readTextFile(params: acp.ReadTextFileRequest): Promise<acp.ReadTextFileResponse> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(params.path));
    return { content: new TextDecoder().decode(bytes) };
  }

  async writeTextFile(params: acp.WriteTextFileRequest): Promise<acp.WriteTextFileResponse> {
    if (!this.isPathAllowed(params.path, true)) throw new Error(`escrita fora do workspace: ${params.path}`);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(params.path));
    const edit = new vscode.WorkspaceEdit();
    edit.replace(vscode.Uri.file(params.path), new vscode.Range(0, 0, doc.lineCount, 0), params.content);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
    return {};
  }

  /** Auth terminal anunciada pelo agente (`hermes acp --setup`). */
  async authenticate(_params: acp.AuthenticateRequest): Promise<acp.AuthenticateResponse | void> {
    this.authHandler?.();
    return {};
  }
}
