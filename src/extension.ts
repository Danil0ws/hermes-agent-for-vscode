/** Ativação da extensão: canais de saída, agente, view de chat e comandos. */
import * as vscode from 'vscode';
import { AgentManager } from './core/AgentManager';
import { ChatViewProvider } from './ui/ChatViewProvider';
import { CliRunner } from './cli/CliRunner';
import { activeAgent, onSettingsChanged, settings } from './config/Settings';
import { FEATURES } from './features';
import { setLanguage, tr } from './l10n';

export function activate(ctx: vscode.ExtensionContext): void {
  setLanguage(vscode.env.language);   // feeds src/l10n.ts and <html lang> of the webviews
  const log = vscode.window.createOutputChannel('Hermes', { log: true });
  const traffic = vscode.window.createOutputChannel('Hermes Traffic');

  const trafficLog = (direction: 'in' | 'out', message: unknown) => {
    if (!settings().logTraffic) return;
    const ts = new Date().toISOString();
    traffic.appendLine(`[${ts}] ${direction === 'out' ? '-->' : '<--'} ${redact(JSON.stringify(message))}`);
  };

  const agents = new AgentManager((level, text) => log[level === 'info' ? 'info' : level](text));
  const cli = new CliRunner((level, text) => log[level === 'info' ? 'info' : level](text));
  const provider = new ChatViewProvider(ctx, agents, (level, text) => log[level === 'info' ? 'info' : level](text));

  const reg = (id: string, fn: (...args: never[]) => unknown) => ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));
  const restricted = () => !vscode.workspace.isTrusted;

  ctx.subscriptions.push(
    log, traffic,
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
    // o `+` do título da view é o único caminho para uma conversa nova: abre uma ABA nova.
    await provider.newTab();
  });
  reg('hermes.openInEditor', async () => { await provider.openInEditor(); });
  reg('hermes.openCli', async (opts) => {
    if (restricted()) return warnRestricted();
    await cli.openFullCli(opts as { command?: string; args?: string[]; sessionId?: string } | undefined);
  });
  reg('hermes.runCliCommand', async () => { await cli.runCommand(); });
  reg('hermes.restartSession', async () => { await provider.newConversation(); });
  reg('hermes.showSessions', async () => { await vscode.commands.executeCommand('hermes.sessions.pick'); });
  reg('hermes.showContext', async () => { await vscode.commands.executeCommand('hermes.chat.focus'); });
  reg('hermes.showPlan', async () => { await vscode.commands.executeCommand('hermes.plan.focus'); });
  reg('hermes.exportConversation', async () => { await vscode.commands.executeCommand('hermes.export'); });
  reg('hermes.askAboutSelection', async () => { await askAboutSelection(provider); });
  reg('hermes.explainSelection', async () => { await askAboutSelection(provider, 'Explique este código: '); });
  reg('hermes.sendFileToHermes', async () => {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (!uri) return;
    await vscode.commands.executeCommand('hermes.chat.focus');
    await provider.attachFilePath(uri.fsPath);
  });

  reg('hermes.setupCli', async () => { await cli.setupFlow(); });

  reg('hermes.permissions.toggleYolo', async () => {
    const cfg = vscode.workspace.getConfiguration('hermes');
    if (settings().permissions === 'allowAll') {
      await cfg.update('permissions', 'ask', vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(tr('Aprovação automática desligada: o Hermes volta a pedir permissão.'));
      return;
    }
    const yes = tr('Ligar a aprovação automática');
    const pick = await vscode.window.showWarningMessage(
      tr('Ligar a aprovação automática? O Hermes passa a executar comandos e editar arquivos sem perguntar. Vale para todas as sessões deste perfil do Hermes.'),
      { modal: true }, yes,
    );
    if (pick !== yes) return;
    await cfg.update('permissions', 'allowAll', vscode.ConfigurationTarget.Global);
    void vscode.window.showWarningMessage(tr('Aprovação automática LIGADA. Clique no item da barra de status (ou rode este comando de novo) para desligar.'));
  });

  // Enquanto o YOLO estiver ligado, ele fica VISÍVEL: política que aprova tudo sem indicador e
  // um jeito de esquecer que ela está ligada.
  const yolo = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const syncYolo = () => {
    if (settings().permissions !== 'allowAll') { yolo.hide(); return; }
    yolo.text = tr('$(shield) Hermes: aprovando tudo');
    yolo.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    yolo.tooltip = tr('hermes.permissions = allowAll: o Hermes não pede permissão. Clique para desligar.');
    yolo.command = 'hermes.permissions.toggleYolo';
    yolo.show();
  };
  ctx.subscriptions.push(yolo);
  syncYolo();

  // As features (src/features/*) são donas dos próprios comandos. Nada de no-op aqui:
  // registrar o mesmo id duas vezes faz o segundo `registerCommand` lançar.
  // `hermes.diagnostics` passou a ser da feature de diagnóstico; `hermes.manage` da de Gerenciar.

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

  ctx.subscriptions.push(onSettingsChanged(() => { log.info('configuração do Hermes alterada'); syncYolo(); }));

  // Um comando declarado no manifesto que ninguém registra aparece na palette e nos menus
  // (o VS Code desenha pelo manifesto) e falha só no clique, com "command not found" — foi assim
  // que um registro duplicado deixou metade dos comandos do Gerenciar inertes sem nenhum erro
  // visível. Aqui a checagem é feita na ativação, com a API do editor e o manifesto real.
  void reportCommandCoverage(ctx, (level, text) => log[level === 'info' ? 'info' : level](text));

  // Ativação é lazy (onView/onCommand): chegar aqui já significa que o usuário quer usar o chat.
  // Com o Hermes ausente, o aviso é modal — em silêncio a view só mostraria "conexão caiu".
  void cli.setupFlow(true);

  if (process.platform === 'win32' && !process.env.WSL_DISTRO_NAME) {
    void vscode.window.showWarningMessage(tr('O Hermes roda em Linux/macOS/WSL2. Ajuste hermes.cliPath para "wsl hermes" (ou use WSL2).'),
    );
  }
  log.info(`Hermes Agent for VS Code ativo · agente padrão: ${activeAgent(settings()).name}`);
}

// Nada a desmontar: a feature de diagnóstico é dona da sua DiagnosticCollection e o
// AgentManager encerra o processo do Hermes no dispose da assinatura.
export function deactivate(): void { /* ver comentário acima */ }

async function askAboutSelection(provider: ChatViewProvider, prefix = 'Pergunta sobre esta seleção: '): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return;
  await provider.attachSelection(editor, prefix);
}

async function reportCommandCoverage(
  ctx: vscode.ExtensionContext,
  log: (level: 'info' | 'warn' | 'error', text: string) => void,
): Promise<void> {
  try {
    const manifest = ctx.extension.packageJSON as { contributes?: { commands?: { command: string }[] } };
    const declared = (manifest.contributes?.commands ?? []).map((c) => c.command);
    if (declared.length === 0) return;
    const live = new Set(await vscode.commands.getCommands(true));
    const missing = declared.filter((id) => !live.has(id));
    log('info', `comandos: ${declared.length - missing.length}/${declared.length} registrados`);
    if (missing.length > 0) {
      log('error', `comandos declarados e NÃO registrados: ${missing.join(', ')}`);
      void vscode.window.showWarningMessage(
        tr(`A extensão não registrou ${missing.length} comando(s): ${missing.join(', ')}. Ver o canal de saída Hermes.`),
      );
    }
  } catch (e) {
    log('warn', `checagem de comandos falhou: ${String(e)}`);
  }
}

function warnRestricted(): void {
  void vscode.window.showWarningMessage(tr('Workspace em modo restrito: o Hermes só roda em modo leitura.'));
}

/** Remove valores de chave/segredo antes de logar tráfego. */
function redact(json: string): string {
  return json.replace(
    /("(?:[^"]*(?:api[_-]?key|token|secret|password|authorization)[^"]*)"\s*:\s*)"[^"]*"/gi,
    '$1"«redigido»"',
  );
}
