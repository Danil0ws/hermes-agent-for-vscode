/** Ativação da extensão: canais de saída, agente, view de chat e comandos. */
import * as vscode from 'vscode';
import { AgentManager } from './core/AgentManager';
import { ChatViewProvider } from './ui/ChatViewProvider';
import { CliRunner } from './cli/CliRunner';
import { activeAgent, onSettingsChanged, settings, workingDirectory } from './config/Settings';
import { FEATURES } from './features';

let diagnostics: vscode.DiagnosticCollection;

export function activate(ctx: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Hermes', { log: true });
  const traffic = vscode.window.createOutputChannel('Hermes Traffic');
  diagnostics = vscode.languages.createDiagnosticCollection('hermes');

  const trafficLog = (direction: 'in' | 'out', message: unknown) => {
    if (!settings().logTraffic) return;
    const ts = new Date().toISOString();
    traffic.appendLine(`[${ts}] ${direction === 'out' ? '-->' : '<--'} ${redact(JSON.stringify(message))}`);
  };

  const agents = new AgentManager((level, text) => log[level === 'info' ? 'info' : level](text));
  const cli = new CliRunner((level, text) => log[level === 'info' ? 'info' : level](text));
  const provider = new ChatViewProvider(ctx, agents, (level, text) => log[level === 'info' ? 'info' : level](text), (id, opt) => { void agents.answerPermission(id, opt); });

  const reg = (id: string, fn: (...args: never[]) => unknown) => ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));
  const restricted = () => !vscode.workspace.isTrusted;

  ctx.subscriptions.push(
    log, traffic, diagnostics,
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    agents.disposables(),
    vscode.commands.registerCommand('hermes.traffic', trafficLog),
    vscode.commands.registerCommand('hermes.showLog', () => log.show(true)),
    vscode.commands.registerCommand('hermes.showTraffic', () => traffic.show(true)),
  );

  reg('hermes.newConversation', async () => {
    if (restricted()) return warnRestricted();
    await vscode.commands.executeCommand('hermes.chat.focus');
    await provider.newConversation();
  });
  reg('hermes.openInEditor', async () => { await provider.openInEditor(); });
  reg('hermes.openCli', async (opts) => {
    if (restricted()) return warnRestricted();
    await cli.openFullCli(opts as { command?: string; args?: string[]; sessionId?: string } | undefined);
  });
  reg('hermes.runCliCommand', async () => { await cli.runCommand(); });
  reg('hermes.restartSession', async () => { await provider.newConversation(); });
  reg('hermes.showSessions', async () => { await vscode.commands.executeCommand('hermes.sessions.pick'); });
  reg('hermes.manage', async () => { await vscode.commands.executeCommand('hermes.manage.open'); });
  reg('hermes.showContext', async () => { await vscode.commands.executeCommand('hermes.chat.focus'); });
  reg('hermes.showPlan', async () => { await vscode.commands.executeCommand('hermes.plan.focus'); });
  reg('hermes.exportConversation', async () => { await vscode.commands.executeCommand('hermes.export'); });
  reg('hermes.diagnostics', async () => {
    const term = new CliRunner((l, t) => log[l === 'info' ? 'info' : l](t));
    await term.run('hermes', ['doctor'], workingDirectory(settings()), 'Hermes: Diagnóstico');
  });
  reg('hermes.askAboutSelection', async () => { await askAboutSelection(provider); });
  reg('hermes.explainSelection', async () => { await askAboutSelection(provider, 'Explique este código: '); });
  reg('hermes.sendFileToHermes', async () => {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (!uri) return;
    await vscode.commands.executeCommand('hermes.chat.focus');
    await provider.attachFilePath(uri.fsPath);
  });

  // Comandos cujas superfícies chegam nos próximos marcos: registrados como no-op
  // para os menus não quebrarem enquanto isso.
  for (const id of [
    'hermes.fixProblem', 'hermes.diff.open', 'hermes.sessions.pick', 'hermes.manage.open',
    'hermes.plan.focus', 'hermes.export', 'hermes.plan.implement', 'hermes.context.manage',
    'hermes.agents.test', 'hermes.mcp.add', 'hermes.skill.open', 'hermes.instructions.open',
    'hermes.approvals.open', 'hermes.queue.toggle', 'hermes.keepFile', 'hermes.undoFile',
    'hermes.copyResponse',
  ]) {
    ctx.subscriptions.push(vscode.commands.registerCommand(id, (...args: unknown[]) => {
      log.warn(`comando ${id} ainda não implementado (args: ${JSON.stringify(args)})`);
    }));
  }

  // Features dos marcos M2–M9: cada uma é dona do seu arquivo em src/features/.
  const featureDeps = {
    agents, provider, log: (level: 'info' | 'warn' | 'error', text: string) => log[level](text),
    traffic: trafficLog,
    openCli: async (opts?: { command?: string; args?: string[]; sessionId?: string }) => {
      await cli.openFullCli(opts);
    },
  };
  for (const feature of FEATURES) {
    try {
      const r = feature.register(ctx, featureDeps);
      if (r instanceof Promise) void r.catch((e: unknown) => log.error(`feature ${feature.id}: ${String(e)}`));
    } catch (e) {
      log.error(`feature ${feature.id} falhou ao registrar: ${String(e)}`);
    }
  }

  ctx.subscriptions.push(onSettingsChanged(() => log.info('configuração do Hermes alterada')));

  if (process.platform === 'win32' && !process.env.WSL_DISTRO_NAME) {
    void vscode.window.showWarningMessage(
      'O Hermes roda em Linux/macOS/WSL2. Ajuste hermes.cliPath para "wsl hermes" (ou use WSL2).',
    );
  }
  log.info(`Hermes Agent for VS Code ativo · agente padrão: ${activeAgent(settings()).name}`);
}

export function deactivate(): void { diagnostics?.dispose(); }

async function askAboutSelection(provider: ChatViewProvider, prefix = 'Pergunta sobre esta seleção: '): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return;
  await provider.attachSelection(editor, prefix);
}

function warnRestricted(): void {
  void vscode.window.showWarningMessage('Workspace em modo restrito: o Hermes só roda em modo leitura.');
}

/** Remove valores de chave/segredo antes de logar tráfego. */
function redact(json: string): string {
  return json.replace(
    /("(?:[^"]*(?:api[_-]?key|token|secret|password|authorization)[^"]*)"\s*:\s*)"[^"]*"/gi,
    '$1"«redigido»"',
  );
}
