/**
 * Superfície comum das features. Cada lane é dona do SEU arquivo em src/features/
 * e nunca edita extension.ts, package.json, tsconfig.json, vite.config.ts nem o
 * núcleo (types/Connection/AgentManager/HermesSession/ChatViewProvider).
 *
 * Regra: um módulo por feature, registro idempotente, `dispose` no `ctx.subscriptions`.
 */
import type * as vscode from 'vscode';
import type { AgentManager } from '../core/AgentManager';
import type { ChatViewProvider } from '../ui/ChatViewProvider';

export interface FeatureDeps {
  agents: AgentManager;
  provider: ChatViewProvider;
  log: (level: 'info' | 'warn' | 'error', text: string) => void;
  /** grava uma linha no OutputChannel "Hermes Traffic" (respeitando hermes.logTraffic) */
  traffic: (direction: 'in' | 'out', message: unknown) => void;
  /** abre a CLI num terminal integrado */
  openCli: (opts?: { command?: string; args?: string[]; sessionId?: string }) => Promise<void>;
}

export interface Feature {
  readonly id: string;
  register(ctx: vscode.ExtensionContext, deps: FeatureDeps): void | Promise<void>;
}
