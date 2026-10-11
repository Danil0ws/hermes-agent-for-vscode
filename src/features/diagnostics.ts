/** Feature "diagnostics" — stub. Implementação chega no marco correspondente (ver docs/ARCHITECTURE.md §10). */
import type * as vscode from 'vscode';
import type { Feature, FeatureDeps } from './registry';

export const feature: Feature = {
  id: 'diagnostics',
  register(ctx: vscode.ExtensionContext, deps: FeatureDeps): void {
    void ctx; void deps; // implementado no marco
  },
};
