/**
 * Feature "sessions" (marco M4): TreeView "Hermes Sessions", quick pick do histórico,
 * barra de status e notificações de sessões em background.
 *
 * O ACP não informa "rodando/erro" por sessão (ARCHITECTURE §11.3): o estado é DERIVADO —
 * sessão ativa ocupada (`HermesSession.busy`), aprovação pendente, erro de conexão; o resto é
 * ocioso. Renomear/arquivar/excluir não existem no ACP (não há `session/delete`): abrem a CLI
 * num terminal integrado. Duplicar usa `session/fork`; copiar o ID é local.
 */
import * as vscode from 'vscode';
import type { Feature, FeatureDeps } from './registry';
import type { AgentManager } from '../core/AgentManager';
import type { HostToWebview, SessionSummary } from '../core/types';
import { activeAgent, settings, workingDirectory } from '../config/Settings';
import {
  STATE_ICON, STATE_LABEL, SessionTreeProvider, describeRow, groupSessions, rowLabel,
  type SessionRow, type SessionState,
} from '../ui/SessionTreeProvider';
import { StatusBar } from '../ui/StatusBar';
import { tr } from '../l10n';

const CLI_NOTE =
  'Renomear, arquivar e excluir abrem a CLI num terminal integrado: o protocolo ACP não expõe ' +
  'essas operações (não há `session/delete`). Duplicar (fork) e copiar o ID acontecem aqui mesmo.';

export const feature: Feature = {
  id: 'sessions',
  register(ctx: vscode.ExtensionContext, deps: FeatureDeps): void {
    const tree = new SessionTreeProvider(vscode, CLI_NOTE);
    const status = new StatusBar('hermes.sessions.pick');
    const view = vscode.window.createTreeView('hermes.sessions', { treeDataProvider: tree });

    /* ── estado derivado (o ACP não manda estado por sessão) ── */
    const titleById = new Map<string, string>();    // título de `session_info_update`
    const activityById = new Map<string, number>(); // última atividade vista (ms)
    const pendingById = new Map<string, number>();  // aprovações pendentes por sessão
    const doneById = new Set<string>();             // concluiu um turno nesta sessão da extensão
    const errorById = new Set<string>();            // erro de turno/conexão
    let lastNotify = 0;

    const activeId = (): string | undefined => deps.agents.session?.sessionId;
    const liveSession = (id: string) => deps.agents.allSessions.find((s) => s.sessionId === id);

    function deriveState(id: string): SessionState {
      if (errorById.has(id)) return 'error';
      if (liveSession(id)?.busy) return 'running';
      if ((pendingById.get(id) ?? 0) > 0) return 'waiting';
      if (doneById.has(id)) return 'done';
      return 'idle';
    }

    function rowsFrom(summaries: SessionSummary[], now: number): SessionRow[] {
      const byId = new Map<string, SessionSummary>();
      for (const s of summaries) byId.set(s.sessionId, s);
      // sessões vivas que o state.db ainda não listou (recém-criadas)
      for (const live of deps.agents.allSessions) {
        if (byId.has(live.sessionId)) continue;
        byId.set(live.sessionId, {
          sessionId: live.sessionId,
          title: titleById.get(live.sessionId),
          cwd: undefined,
          updatedAt: new Date(activityById.get(live.sessionId) ?? now).toISOString(),
          state: 'idle',
          pending: 0,
        });
      }
      const rows: SessionRow[] = [];
      for (const s of byId.values()) {
        const live = liveSession(s.sessionId);
        rows.push({
          sessionId: s.sessionId,
          title: s.title ?? titleById.get(s.sessionId),
          cwd: s.cwd,
          updatedAt: live ? new Date(activityById.get(s.sessionId) ?? now).toISOString() : s.updatedAt,
          state: deriveState(s.sessionId),
          pending: pendingById.get(s.sessionId) ?? s.pending,
          // modelo só é conhecido para a sessão viva (o ACP não devolve modelo por histórico)
          model: live?.snapshot.currentModel ?? undefined,
        });
      }
      return rows;
    }

    function updateStatus(): void {
      const sess = deps.agents.session;
      status.update({ model: sess?.snapshot.currentModel, state: sess ? deriveState(sess.sessionId) : 'idle' });
      const attention = deps.agents.allSessions
        .map((s) => deriveState(s.sessionId))
        .filter((st) => st === 'waiting' || st === 'error').length;
      view.badge = attention
        ? { value: attention, tooltip: `${attention} sessão(ões) precisam de atenção` }
        : undefined;
    }

    let refreshing = false;
    let queued = false;
    async function refresh(): Promise<void> {
      if (refreshing) { queued = true; return; }
      refreshing = true;
      try {
        const cwd = workingDirectory(settings());
        const summaries = await deps.agents.listSessions(cwd);
        tree.setRows(rowsFrom(summaries, Date.now()));
      } catch (err) {
        deps.log('warn', `sessions: falha ao listar — ${String(err)}`);
        tree.setRows(rowsFrom([], Date.now()));
      } finally {
        refreshing = false;
        if (queued) { queued = false; void refresh(); }
      }
      updateStatus();
    }

    let refreshTimer: NodeJS.Timeout | undefined;
    function scheduleRefresh(): void {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => { refreshTimer = undefined; void refresh(); }, 250);
    }

    /* ── notificações (espelham `chat.notifyWindowOn*`, via `hermes.notifications`) ── */
    function notify(kind: 'response' | 'confirm' | 'error', text: string): void {
      const mode = settings().notifications;
      if (mode === 'off') return;
      if (mode === 'windowNotFocused' && vscode.window.state.focused) return;
      const now = Date.now();
      if (now - lastNotify < 2000) return; // evita enxurrada em turnos rápidos
      lastNotify = now;
      const show = kind === 'error'
        ? vscode.window.showWarningMessage
        : vscode.window.showInformationMessage;
      void show(text, 'Abrir sessões').then((choice) => {
        if (choice) void vscode.commands.executeCommand('hermes.sessions.pick');
      });
    }

    /* ── eventos do AgentManager → estado derivado + refresh ── */
    function onEvent(m: HostToWebview): void {
      const now = Date.now();
      const id = activeId();
      if (id) activityById.set(id, now);
      switch (m.type) {
        case 'session':
          if (m.sessionId) titleById.set(m.sessionId, m.title ?? '');
          scheduleRefresh();
          break;
        case 'busy':
          if (id && m.value) { errorById.delete(id); doneById.delete(id); activityById.set(id, now); }
          scheduleRefresh();
          break;
        case 'permission/ask':
          if (id) pendingById.set(id, (pendingById.get(id) ?? 0) + 1);
          notify('confirm', 'O Hermes aguarda a sua aprovação.');
          scheduleRefresh();
          break;
        case 'permission/resolve':
          if (id) pendingById.set(id, Math.max(0, (pendingById.get(id) ?? 0) - 1));
          scheduleRefresh();
          break;
        case 'turn/end':
          if (id && m.stopReason !== 'cancelled') doneById.add(id);
          notify('response', 'Resposta do Hermes concluída.');
          scheduleRefresh();
          break;
        case 'error':
          if (id) errorById.add(id);
          notify('error', 'A sessão do Hermes falhou.');
          scheduleRefresh();
          break;
        default:
          break;
      }
    }

    /* ── resolução de argumentos (string, SessionRow ou SessionNode) ── */
    function idOf(arg: unknown): string | undefined {
      if (typeof arg === 'string') return arg;
      if (arg && typeof arg === 'object') {
        const a = arg as Record<string, unknown>;
        if (typeof a.sessionId === 'string') return a.sessionId;
        const row = a.row as Record<string, unknown> | undefined;
        if (row && typeof row.sessionId === 'string') return row.sessionId;
      }
      return activeId();
    }
    function titleOf(arg: unknown): string | undefined {
      if (arg && typeof arg === 'object') {
        const a = arg as Record<string, unknown>;
        if (typeof a.title === 'string' && a.title) return a.title;
        const row = a.row as Record<string, unknown> | undefined;
        if (row && typeof row.title === 'string' && row.title) return row.title;
      }
      const id = idOf(arg);
      return id ? titleById.get(id) : undefined;
    }

    const reg = (id: string, fn: (...args: unknown[]) => unknown) =>
      ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

    // Árvore, barra de status e observação de eventos ANTES de qualquer comando: se re-registrar
    // `hermes.sessions.pick` (já existe como no-op em extension.ts) algum dia lançar, o VS Code
    // loga o erro do comando mas a view e a barra continuam funcionando.
    ctx.subscriptions.push(tree, status, view);
    ctx.subscriptions.push(view.onDidChangeVisibility((e) => { if (e.visible) void refresh(); }));
    ctx.subscriptions.push(new vscode.Disposable(observeAgents(deps.agents, onEvent)));
    ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('hermes.notifications') ||
          e.affectsConfiguration('hermes.defaultWorkingDirectory') ||
          e.affectsConfiguration('hermes.agents')) void refresh();
    }));

    /* ── comandos ── */

    reg('hermes.sessions.open', async (arg) => {
      const id = idOf(arg);
      if (!id) return;
      const s = settings();
      const session = await deps.agents.loadSession(workingDirectory(s), id, activeAgent(s).name);
      if (!session) {
        void vscode.window.showWarningMessage(tr('Não foi possível abrir a sessão — o Hermes não está conectado?'));
        return;
      }
      await vscode.commands.executeCommand('hermes.chat.focus');
      void refresh();
    });

    reg('hermes.sessions.rename', async (arg) => {
      const id = idOf(arg);
      if (!id) return;
      const title = await vscode.window.showInputBox({
        title: tr('Renomear sessão'),
        value: titleOf(arg) ?? '',
        prompt: 'Novo título. A CLI aplica a mudança (o ACP só informa o título, não o altera).',
        validateInput: (v) => (v.trim().length ? undefined : 'Informe um título.'),
      });
      if (!title) return;
      await deps.openCli({ args: ['sessions', 'rename', id, title.trim()] });
      deps.log('info', `sessions.rename ${id}`);
    });

    reg('hermes.sessions.fork', async (arg) => {
      const id = idOf(arg);
      if (!id) return;
      const s = settings();
      const cwd = workingDirectory(s);
      const session = liveSession(id) ?? await deps.agents.loadSession(cwd, id, activeAgent(s).name);
      if (!session) {
        void vscode.window.showWarningMessage(tr('Não foi possível duplicar: a sessão não está viva.'));
        return;
      }
      const forked = await session.fork(cwd);
      deps.log('info', `sessions.fork ${id} -> ${forked ?? '?'}`);
      if (forked) await deps.agents.loadSession(cwd, forked, activeAgent(s).name);
      void refresh();
    });

    reg('hermes.sessions.archive', async (arg) => {
      const id = idOf(arg);
      if (!id) return;
      // `hermes sessions archive` é filtro em massa (não aceita ID): casa pelo título.
      // Sem título, o caminho exato é o picker interativo da CLI.
      const title = titleOf(arg);
      if (title) await deps.openCli({ args: ['sessions', 'archive', '--title', title] });
      else await deps.openCli({ args: ['sessions', 'browse'] });
      deps.log('info', `sessions.archive ${id} (título: ${title ?? '—'})`);
    });

    reg('hermes.sessions.delete', async (arg) => {
      const id = idOf(arg);
      if (!id) return;
      const ok = await vscode.window.showWarningMessage(
        `Excluir a sessão "${rowLabel({ sessionId: id, title: titleOf(arg), state: 'idle', pending: 0 })}"?`,
        { modal: true },
        'Excluir',
      );
      if (ok !== 'Excluir') return;
      await deps.openCli({ args: ['sessions', 'delete', id, '--yes'] });
      deps.log('info', `sessions.delete ${id}`);
    });

    reg('hermes.sessions.copyId', async (arg) => {
      const id = idOf(arg);
      if (!id) return;
      await vscode.env.clipboard.writeText(id);
      void vscode.window.showInformationMessage(`ID copiado: ${id}`);
    });

    reg('hermes.sessions.pick', async () => { await pick(); });

    /* ── quick pick do histórico (nativo) ── */
    async function pick(): Promise<void> {
      const cwd = workingDirectory(settings());
      let summaries: SessionSummary[] = [];
      try { summaries = await deps.agents.listSessions(cwd); }
      catch (err) { deps.log('warn', `sessions.pick: ${String(err)}`); }
      if (!summaries.length) {
        void vscode.window.showInformationMessage(tr('Nenhuma sessão encontrada. Inicie uma conversa — o Hermes precisa estar conectado para listar o histórico.'),
        );
        return;
      }
      const now = new Date();
      const items: (vscode.QuickPickItem & { sessionId?: string })[] = [];
      for (const group of groupSessions(rowsFrom(summaries, now.getTime()), now)) {
        items.push({ label: group.label, kind: vscode.QuickPickItemKind.Separator });
        for (const row of group.rows) {
          items.push({
            label: rowLabel(row),
            description: describeRow(row, now),
            detail: `${STATE_LABEL[row.state]} · ${row.sessionId}`,
            iconPath: new vscode.ThemeIcon(STATE_ICON[row.state]),
            sessionId: row.sessionId,
          });
        }
      }
      const picked = await vscode.window.showQuickPick(items, {
        title: tr('Histórico de sessões'),
        placeHolder: tr('Buscar por título, modelo ou estado…'),
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (picked?.sessionId) await vscode.commands.executeCommand('hermes.sessions.open', picked.sessionId);
    }

    void refresh();
  },
};

/**
 * Assina o bus de eventos do AgentManager. `onEvent` é aditivo (a view de chat também assina),
 * então basta delegar — o wrapper que contornava o assinante único foi removido.
 */
function observeAgents(agents: AgentManager, handler: (m: HostToWebview) => void): () => void {
  const sub = agents.onEvent(handler);
  return () => sub.dispose();
}
