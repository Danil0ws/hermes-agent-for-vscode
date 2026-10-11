/**
 * Feature "plan": view do plano + "Implementar plano".
 *
 * O Hermes NÃO tem "modo Plan" (os 3 modos do ACP são política de aprovação de edição).
 * "Implementar plano" envia o plano como prompt de implementação e, se o modo atual for
 * `default` (que pede aprovação de edição), SUGERE `accept_edits` — nunca troca sozinho.
 *
 * A view é alimentada pelo bus aditivo do AgentManager (`plan`/`session`/`busy`) e pelo
 * snapshot da sessão no primeiro desenho.
 */
import * as vscode from 'vscode';
import type { Feature, FeatureDeps } from './registry';
import type { PlanEntry } from '../core/types';
import { PlanView } from '../ui/PlanView';
import { tr } from '../l10n';

export const feature: Feature = {
  id: 'plan',
  register(ctx: vscode.ExtensionContext, deps: FeatureDeps): void {
    const view = new PlanView();
    const refresh = () => view.setPlan(deps.agents.session?.snapshot.plan ?? []);

    // O bus do AgentManager é aditivo: assina direto e some o polling do snapshot.
    ctx.subscriptions.push(
      vscode.window.registerWebviewViewProvider(PlanView.viewType, view, { webviewOptions: { retainContextWhenHidden: true } }),
      view,
      view.onDidChangeVisibility(() => refresh()),
      view.onDidClickImplement(() => void implementPlan(deps)),
      deps.agents.onEvent((m) => { if (m.type === 'plan' || m.type === 'session' || m.type === 'busy') refresh(); }),
    );

    register(ctx, deps, 'hermes.plan.focus', async () => {
      try { await vscode.commands.executeCommand('workbench.view.extension.hermes'); } catch { /* container já visível */ }
      view.reveal();
    });
    register(ctx, deps, 'hermes.plan.implement', () => void implementPlan(deps));

    refresh();
  },
};

/** Monta o prompt de implementação a partir do plano (puro, testável). */
export function buildImplementationPrompt(entries: PlanEntry[]): string {
  const lines = entries.map((e) => `- [${e.status === 'completed' ? 'x' : ' '}] (${e.priority}) ${e.content}`);
  return [
    'Implemente o plano a seguir, na ordem apresentada. Ao concluir cada item, atualize o plano:',
    '',
    ...lines,
  ].join('\n');
}

async function implementPlan(deps: FeatureDeps): Promise<void> {
  const session = deps.agents.session;
  if (!session) {
    void vscode.window.showWarningMessage(tr('Sem sessão ativa. Inicie uma conversa para implementar o plano.'));
    return;
  }
  const entries = session.snapshot.plan ?? [];
  if (entries.every((e) => e.status === 'completed')) {
    void vscode.window.showInformationMessage(tr('O plano não tem tarefas pendentes.'));
    return;
  }

  try { await vscode.commands.executeCommand('hermes.chat.focus'); } catch { /* view pode não existir ainda */ }
  void session.prompt(buildImplementationPrompt(entries));

  // Em `default` a edição pede aprovação a cada passo: sugerir (não impor) `accept_edits`.
  if (session.snapshot.currentMode === 'default') {
    const trocar = tr('Trocar para "Aceitar edições"');
    const pick = await vscode.window.showInformationMessage(tr('Plano enviado. O modo atual ("Default") pede aprovação de edição a cada alteração.'),
      trocar, tr('Manter "Default"'),
    );
    if (pick === trocar) await session.setMode('accept_edits');
  }
}

function register(ctx: vscode.ExtensionContext, deps: FeatureDeps, id: string, fn: (...args: unknown[]) => unknown): void {
  try {
    ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));
  } catch (e) {
    deps.log('warn', `comando ${id} já registrado (${String(e)}); remova o no-op em src/extension.ts.`);
  }
}
