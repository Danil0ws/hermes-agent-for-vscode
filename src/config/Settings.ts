/** Settings tipadas (fonte única: package.json `contributes.configuration`). */
import * as vscode from 'vscode';
import type { AgentConfig } from '../core/Connection';

const SECTION = 'hermes';

export interface Settings {
  cliPath: string;
  agents: Record<string, AgentConfig>;
  defaultAgent: string;
  defaultWorkingDirectory: string;
  skipConfiguredMcp: boolean;
  permissions: 'ask' | 'allowSession' | 'allowAll';
  showReasoning: 'always' | 'collapsed' | 'hidden';
  queueEnabled: boolean;
  queueDefaultAction: 'queue' | 'steer';
  contextWarnAt: number;
  notifications: 'off' | 'windowNotFocused' | 'always';
  logTraffic: boolean;
}

export function settings(): Settings {
  const c = vscode.workspace.getConfiguration(SECTION);
  const agents = (c.get<Record<string, AgentConfig>>('agents') ?? {});
  const cliPath = c.get<string>('cliPath', 'hermes');
  const normalized: Record<string, AgentConfig> = {};
  for (const [name, a] of Object.entries(agents)) {
    normalized[name] = {
      command: a.command?.trim() || cliPath,
      args: a.args?.length ? a.args : ['acp'],
      profile: a.profile,
      cwd: a.cwd,
      env: a.env,
      model: a.model,
    };
  }
  if (Object.keys(normalized).length === 0) normalized.Hermes = { command: cliPath, args: ['acp'] };
  return {
    cliPath,
    agents: normalized,
    defaultAgent: c.get<string>('defaultAgent', 'Hermes'),
    defaultWorkingDirectory: c.get<string>('defaultWorkingDirectory', ''),
    skipConfiguredMcp: c.get<boolean>('skipConfiguredMcp', true),
    permissions: c.get<'ask' | 'allowSession' | 'allowAll'>('permissions', 'ask'),
    showReasoning: c.get<'always' | 'collapsed' | 'hidden'>('showReasoning', 'collapsed'),
    queueEnabled: c.get<boolean>('queue.enabled', true),
    queueDefaultAction: c.get<'queue' | 'steer'>('queue.defaultAction', 'queue'),
    contextWarnAt: c.get<number>('context.warnAt', 80),
    notifications: c.get<'off' | 'windowNotFocused' | 'always'>('notifications', 'windowNotFocused'),
    logTraffic: c.get<boolean>('logTraffic', false),
  };
}

export function activeAgent(s: Settings): { name: string; cfg: AgentConfig } {
  const name = s.agents[s.defaultAgent] ? s.defaultAgent : Object.keys(s.agents)[0];
  return { name, cfg: s.agents[name] };
}

/** cwd das sessões: setting > pasta do workspace > home. */
export function workingDirectory(s: Settings): string {
  if (s.defaultWorkingDirectory.trim()) return s.defaultWorkingDirectory.trim();
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
}

export function onSettingsChanged(fn: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) fn();
  });
}
