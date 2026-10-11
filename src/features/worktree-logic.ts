/**
 * Lógica pura da feature `worktree` (sem runtime do VS Code), separada para ser testável fora do
 * Extension Host — mesmo padrão de `src/ui/DiffProvider.ts`. `worktree.ts` só faz a cola
 * (comando, input box, `git`, `newTab`).
 */
import { basename, dirname, join, resolve } from 'node:path';

/**
 * Onde os worktrees são criados: o `hermes.worktreeRoot` quando preenchido (aceita caminho
 * relativo ou absoluto), senão a pasta IRMÃ do repositório — `<repo>-worktrees`.
 */
export function worktreeRoot(configured: string, repoPath: string): string {
  const c = configured.trim();
  if (c) return resolve(c);
  return resolve(join(dirname(repoPath), `${basename(repoPath)}-worktrees`));
}

/** Caminho do worktree de uma branch: `<root>/<branch>` (git cria os diretórios intermediários). */
export function worktreePath(root: string, branch: string): string {
  return join(root, branch);
}

/**
 * Nome de branch aceitável para `git worktree add -b <nome>` — subconjunto fiel do
 * `git check-ref-format` (a validação roda ANTES de qualquer comando git).
 */
export function validBranchName(name: string): boolean {
  if (!name || name !== name.trim()) return false;              // vazio ou espaço nas pontas
  if (/[\s\x00-\x1f\x7f]/.test(name)) return false;             // espaço / controle
  if (/[~^:?*[\]\\]/.test(name)) return false;                  // proibidos pelo git
  if (name.includes('..') || name.includes('@{')) return false; // sequências proibidas
  if (name === '@' || name.startsWith('-')) return false;       // `@` sozinho / vira opção do git
  if (name.startsWith('/') || name.endsWith('/') || name.includes('//')) return false;
  if (name.endsWith('.')) return false;
  for (const part of name.split('/')) {
    if (!part || part.startsWith('.') || part.endsWith('.lock')) return false;
  }
  return true;
}

/** Branches de lane (`lane/<n>`) já presentes na saída de `git worktree list`. */
export function laneBranches(worktreeList: string): string[] {
  return [...worktreeList.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]).filter((b) => b.startsWith('lane/'));
}

/** Próximo `lane/<n>` livre — o default sugerido no input box. */
export function nextLaneName(existing: string[]): string {
  const used = new Set(existing);
  for (let n = 1; ; n++) if (!used.has(`lane/${n}`)) return `lane/${n}`;
}
