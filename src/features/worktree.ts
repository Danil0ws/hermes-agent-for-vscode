/**
 * Feature "worktree" (lane): cria um worktree git e abre a conversa NELE, para cada lane trabalhar
 * num diretório próprio sem pisar nas outras.
 *
 * `hermes.worktree.new` roda `git worktree add <root>/<branch> -b <branch>` e chama
 * `newTab(<caminho>)` — a aba nasce já no diretório da lane. `hermes.worktreeRoot`
 * (vazio = pasta irmã `<repo>-worktrees`) escolhe onde. A lógica pura (caminho e nome de branch)
 * vive em `worktree-logic.ts`, testável fora do Extension Host.
 */
import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { tr } from '../l10n';
import type { Feature, FeatureDeps } from './registry';
import { laneBranches, nextLaneName, validBranchName, worktreePath, worktreeRoot } from './worktree-logic';

/** `git` com cwd fixo. Nunca rejeita: devolve o erro como texto (vira mensagem para o usuário). */
function git(args: string[], cwd: string): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error) resolve({ ok: false, out: stdout ?? '', err: (stderr || error.message || '').trim() });
      else resolve({ ok: true, out: stdout ?? '', err: '' });
    });
  });
}

// ponytail: usa só a PRIMEIRA pasta do workspace (é onde o comando foi invocado); multi-root com a
// lane na segunda pasta precisaria de uma escolha — adicionar quando alguém pedir.
async function newWorktree(deps: FeatureDeps): Promise<void> {
  const repo = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!repo) {
    void vscode.window.showErrorMessage(tr('Sem pasta de workspace — abra a pasta do repositório git para criar uma lane.'));
    return;
  }

  // Um comando resolve os dois pré-requisitos: git instalado E a pasta ser um repositório.
  const top = await git(['rev-parse', '--show-toplevel'], repo);
  if (!top.ok) {
    const noGit = /ENOENT|not found/i.test(`${top.err} ${top.out}`);
    void vscode.window.showErrorMessage(tr(noGit
      ? 'Git não encontrado no PATH — instale o git para criar lanes (worktrees).'
      : 'Esta pasta não é um repositório git — abra a pasta do repositório para criar uma lane.'));
    deps.log('warn', `worktree.new: git rev-parse falhou em ${repo}: ${top.err}`);
    return;
  }
  const repoRoot = top.out.trim() || repo;

  const configured = vscode.workspace.getConfiguration('hermes').get<string>('worktreeRoot', '');
  const root = worktreeRoot(configured, repoRoot);

  const list = await git(['worktree', 'list'], repoRoot);
  const suggested = nextLaneName(list.ok ? laneBranches(list.out) : []);

  const answer = await vscode.window.showInputBox({
    title: tr('Nova lane (worktree)'),
    prompt: tr('Nome da branch: um worktree em pasta separada para esta lane trabalhar sem pisar nas outras.'),
    value: suggested,
    valueSelection: [0, suggested.length],
    validateInput: (v) => (validBranchName(v)
      ? undefined
      : tr('Nome de branch inválido — sem espaços, sem "..", sem terminar em "/" ou ".lock".')),
  });
  if (answer === undefined) return;               // cancelou
  const branch = answer.trim();
  if (!validBranchName(branch)) {                 // fronteira de confiança: revalida antes do git
    void vscode.window.showErrorMessage(tr('Nome de branch inválido — sem espaços, sem "..", sem terminar em "/" ou ".lock".'));
    return;
  }

  const path = worktreePath(root, branch);
  deps.log('info', `worktree.new: git worktree add ${path} -b ${branch} (cwd ${repoRoot})`);
  const add = await git(['worktree', 'add', path, '-b', branch], repoRoot);
  if (!add.ok) {
    // branch/pasta já existente, root não gravável, etc. — o stderr do git é a mensagem útil
    void vscode.window.showErrorMessage(`${tr('Não foi possível criar a lane')}: ${add.err}`);
    deps.log('error', `worktree.new: git worktree add falhou: ${add.err}`);
    return;
  }

  deps.log('info', `worktree.new: lane criada em ${path}`);
  await deps.provider.newTab(path);
}

export const feature: Feature = {
  id: 'worktree',
  register(ctx: vscode.ExtensionContext, deps: FeatureDeps): void {
    ctx.subscriptions.push(
      vscode.commands.registerCommand('hermes.worktree.new', () => newWorktree(deps)),
    );
  },
};
