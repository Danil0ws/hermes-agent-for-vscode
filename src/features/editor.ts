/**
 * Feature "editor" — integração com o editor.
 *
 * Fornece: provider de Code Action mínimo ("Corrigir problema com o Hermes") e os handlers
 * `hermes.fixProblem` e `hermes.copyResponse`. `hermes.askAboutSelection`, `hermes.explainSelection`
 * e `hermes.sendFileToHermes` já vivem em extension.ts — não são reimplementados aqui.
 *
 * Ícones/textos em pt-BR, sem cor literal. O anexo do diagnóstico usa o ContextManager da lane
 * "context" (via `contextApi()`) para reaproveitar o formato do chip.
 */
import * as vscode from 'vscode';
import { activeAgent, settings, workingDirectory } from '../config/Settings';
import { contextApi } from './context';
import type { Feature, FeatureDeps } from './registry';
import { tr } from '../l10n';

export const feature: Feature = {
  id: 'editor',
  register(ctx: vscode.ExtensionContext, deps: FeatureDeps): void {
    const log = deps.log;

    ctx.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        { scheme: 'file' },
        new HermesCodeActionProvider(),
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
      ),
    );

    const reg = (id: string, fn: (...args: never[]) => unknown) => ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

    reg('hermes.fixProblem', (diag?: vscode.Diagnostic, uri?: vscode.Uri) => fixProblem(deps, log, diag, uri));
    reg('hermes.copyResponse', () => copyResponse());

    log('info', 'feature editor: Code Action + hermes.fixProblem + hermes.copyResponse');
  },
};

class HermesCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    // um Quick Fix por diagnóstico na faixa (o VS Code já filtra pelo range/cursor).
    return context.diagnostics.map((d) => {
      const action = new vscode.CodeAction('Corrigir problema com o Hermes', vscode.CodeActionKind.QuickFix);
      action.diagnostics = [d];
      action.command = {
        title: tr('Corrigir problema com o Hermes'),
        command: 'hermes.fixProblem',
        arguments: [d, document.uri],
      };
      return action;
    });
  }
}

/** "Corrigir problema com o Hermes": anexa o diagnóstico e pede a correção ao agente. */
async function fixProblem(
  deps: FeatureDeps,
  log: (level: 'info' | 'warn' | 'error', text: string) => void,
  diag?: vscode.Diagnostic,
  uri?: vscode.Uri,
): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    const target = uri ?? editor?.document.uri;
    if (!target) { void vscode.window.showWarningMessage(tr('Nenhum arquivo ativo.')); return; }
    const document = await vscode.workspace.openTextDocument(target);
    const diagnostic = diag ?? diagnosticsAt(document, editor?.selection.active);
    if (!diagnostic) { void vscode.window.showInformationMessage(tr('Nenhum problema no cursor.')); return; }

    const rel = vscode.workspace.asRelativePath(target);
    const line = diagnostic.range.start.line + 1;
    const severity = ['', 'erro', 'aviso', 'informação', 'dica'][diagnostic.severity] ?? 'problema';
    const text = `Corrija este problema em ${rel}:${line}:\n${diagnostic.message}`;

    const api = contextApi();
    const chip = api
      ? api.manager.add({ kind: 'diagnostic', label: `${rel}:${line}`, ref: `${target.fsPath}:${line}`, text: `[${severity}] ${diagnostic.message}` })
      : undefined;

    await vscode.commands.executeCommand('hermes.chat.focus');

    let session = deps.agents.session;
    if (!session) {
      const s = settings();
      session = await deps.agents.newSession(activeAgent(s).cfg, workingDirectory(s), activeAgent(s).name);
    }
    if (session.busy) {
      void vscode.window.showInformationMessage(tr('O turno está em andamento: o diagnóstico foi anexado ao contexto.'));
      return;
    }
    await session.prompt(text, chip ? [chip] : []);
  } catch (err) {
    log('error', `hermes.fixProblem falhou: ${String(err)}`);
    void vscode.window.showWarningMessage(`Não foi possível corrigir: ${String(err)}`);
  }
}

function diagnosticsAt(document: vscode.TextDocument, position?: vscode.Position): vscode.Diagnostic | undefined {
  const diags = vscode.languages.getDiagnostics(document.uri);
  if (!diags.length) return undefined;
  if (position) {
    const at = diags.find((d) => d.range.contains(position));
    if (at) return at;
  }
  return diags[0];
}

/**
 * "Copiar resposta": o host NÃO mantém o transcript (a webview é dona das mensagens), então não
 * há "última resposta" acessível por aqui. Degradação honesta: copia a seleção do editor quando
 * existe; senão orienta o botão de copiar do balão no chat (mensagem `copy` do contrato).
 */
async function copyResponse(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const selection = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
  if (selection) {
    await vscode.env.clipboard.writeText(selection);
    void vscode.window.showInformationMessage(tr('Seleção do editor copiada.'));
    return;
  }
  void vscode.window.showInformationMessage(tr('Use o botão "Copiar" do balão da resposta no chat.'));
}
