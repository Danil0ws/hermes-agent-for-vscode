/**
 * Item de barra de status nativo: `$(sparkle) Hermes · <modelo> · <estado>`.
 * Alinhado à direita; clique abre o quick pick de sessões (`hermes.sessions.pick`).
 * A cor de erro vem só de token de tema (`ThemeColor`), nunca de um literal.
 */
import * as vscode from 'vscode';
import { STATE_LABEL, type SessionState } from './SessionTreeProvider';

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor(command = 'hermes.sessions.pick') {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = command;
    this.item.name = 'Hermes';
    this.update({});
    this.item.show();
  }

  update(opts: { model?: string; state?: SessionState }): void {
    const model = opts.model?.trim() || '—'; // modelo só é conhecido na sessão viva; nunca inventado
    const state = opts.state ?? 'idle';
    const label = STATE_LABEL[state];
    this.item.text = `$(sparkle) Hermes · ${model} · ${label}`;
    this.item.color = state === 'error' ? new vscode.ThemeColor('statusBarItem.errorForeground') : undefined;
    this.item.tooltip = `Hermes · ${model} · ${label}\nClique para abrir o histórico de sessões.`;
    this.item.accessibilityInformation = { label: `Hermes, modelo ${model}, ${label}` };
  }

  dispose(): void { this.item.dispose(); }
}
