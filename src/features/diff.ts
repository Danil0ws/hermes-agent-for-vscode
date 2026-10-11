/**
 * Feature "diff": abre o diff de uma edição do agente no DIFF EDITOR NATIVO.
 *
 * O provider do scheme `hermes-diff:` é registrado aqui; o comando `hermes.diff.open`
 * (já no package.json) monta as duas pontas e chama `vscode.diff`.
 */
import * as vscode from 'vscode';
import { basename } from 'node:path';
import type { Feature, FeatureDeps } from './registry';
import { DiffProvider, composeApplied, diffTitle, kindOf, normalizeDiffPath } from '../ui/DiffProvider';

export const feature: Feature = {
  id: 'diff',
  register(ctx: vscode.ExtensionContext, deps: FeatureDeps): void {
    const provider = new DiffProvider(vscode);
    ctx.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(DiffProvider.scheme, provider),
      provider,
    );

    register(ctx, deps, 'hermes.diff.open', async (arg?: unknown) => {
      const path = typeof arg === 'string' ? arg : (arg as { path?: string } | undefined)?.path;
      if (!path) { void vscode.window.showInformationMessage('Nenhum arquivo para mostrar o diff.'); return; }

      const diffs = deps.agents.session?.diffsFor(path) ?? [];
      if (!diffs.length) {
        void vscode.window.showInformationMessage(`Sem diff registrado para ${basename(path)} nesta sessão.`);
        return;
      }

      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const realPath = normalizeDiffPath(path, root);
      const label = basename(realPath);
      const left = vscode.Uri.file(realPath);                 // arquivo real, à esquerda
      const right = provider.put(composeApplied(diffs), label); // documento virtual (aplicado), à direita
      await vscode.commands.executeCommand('vscode.diff', left, right, diffTitle(label, kindOf(diffs)), { preview: true });
    });
  },
};

function register(ctx: vscode.ExtensionContext, deps: FeatureDeps, id: string, fn: (...args: unknown[]) => unknown): void {
  try {
    ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));
  } catch (e) {
    // O no-op correspondente ainda está em src/extension.ts; remover de lá libera o comando.
    deps.log('warn', `comando ${id} já registrado (${String(e)}); remova o no-op em src/extension.ts.`);
  }
}
