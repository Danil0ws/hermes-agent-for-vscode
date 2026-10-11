/**
 * Feature "manage" — painel "Gerenciar" (M6).
 *
 * Dona do ManageViewProvider, dos três catálogos (modelos/skills/ferramentas) e dos comandos
 * que o package.json já declara. O painel lê a config real do Hermes; nada de estado paralelo.
 */
import * as vscode from 'vscode';
import { join } from 'node:path';
import { activeAgent, settings, workingDirectory } from '../config/Settings';
import { ModelCatalog } from '../core/ModelCatalog';
import { SkillCatalog, hermesHome } from '../core/SkillCatalog';
import { ToolCatalog, makeCliExec } from '../core/ToolCatalog';
import { ManageViewProvider } from '../ui/ManageViewProvider';
import type { Feature, FeatureDeps } from './registry';

export const feature: Feature = {
  id: 'manage',
  register(ctx: vscode.ExtensionContext, deps: FeatureDeps): void {
    const s = settings();
    const ws = workingDirectory(s);
    const capture = makeCliExec(activeAgent(s).cfg.command, ws);

    const catalogs = {
      models: new ModelCatalog(join(ctx.globalStorageUri.fsPath, 'manage', 'model-favorites.json')),
      skills: new SkillCatalog({ home: hermesHome(), workspace: ws }),
      tools: new ToolCatalog(capture),
    };

    const provider = new ManageViewProvider(ctx, deps.agents, catalogs, capture, deps.log, deps.openCli);

    const open = (tab?: string) => provider.open(tab);
    const openAnd = (tab: string, args: string[]) => async () => {
      provider.open(tab);
      await deps.openCli({ args });
    };

    ctx.subscriptions.push(
      provider,
      vscode.commands.registerCommand('hermes.manage', open),
      vscode.commands.registerCommand('hermes.agents.test', openAnd('agents', ['acp', '--check'])),
      vscode.commands.registerCommand('hermes.mcp.add', openAnd('tools', ['mcp', 'add'])),
      vscode.commands.registerCommand('hermes.skill.open', () => provider.open('skills')),
      vscode.commands.registerCommand('hermes.instructions.open', () => provider.open('instructions')),
      vscode.commands.registerCommand('hermes.approvals.open', () => provider.open('approvals')),
    );
  },
};
