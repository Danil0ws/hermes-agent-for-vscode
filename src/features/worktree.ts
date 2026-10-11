/**
 * Lane (worktree): cria um worktree git e abre a conversa nele, para cada lane trabalhar num
 * diretório próprio sem pisar na outra.
 *
 * STUB da coordenação: fixa o contrato (id da feature, comando `hermes.worktree.new`, uso de
 * `deps.provider.newTab(cwd)`). A lane B substitui o corpo.
 */
import * as vscode from 'vscode';
import type { Feature } from './registry';

export const feature: Feature = {
  id: 'worktree',
  register(ctx: vscode.ExtensionContext, deps) {
    ctx.subscriptions.push(
      vscode.commands.registerCommand('hermes.worktree.new', async () => {
        // STUB(lane B): cria o worktree e chama deps.provider.newTab(caminho)
        deps.log('info', 'worktree.new: stub');
      }),
    );
  },
};
