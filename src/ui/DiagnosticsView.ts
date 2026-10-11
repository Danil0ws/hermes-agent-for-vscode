/**
 * Aba informativa do diagnóstico de ambiente — usa o OutputChannel NATIVO do VS Code
 * em vez de recriar um painel na webview.
 */
import * as vscode from 'vscode';

export class DiagnosticsView implements vscode.Disposable {
  private readonly out = vscode.window.createOutputChannel('Hermes Diagnóstico');

  set(report: string): void {
    this.out.clear();
    this.out.append(report);
  }

  append(line: string): void { this.out.appendLine(line); }

  show(): void { this.out.show(true); }

  dispose(): void { this.out.dispose(); }
}
