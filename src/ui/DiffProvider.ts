/**
 * Diff no editor NATIVO do VS Code (`vscode.diff`).
 *
 * O Hermes edita server-side (ARCHITECTURE §3.7): o que chega do agente é o diff
 * (oldText/newText por arquivo). Este módulo só monta o conteúdo resultante e entrega
 * as duas pontas ao diff editor:
 *  - à ESQUERDA, o arquivo real em disco;
 *  - à DIREITA, um documento virtual do scheme `hermes-diff:` com o conteúdo aplicado.
 * Nada de diff é reconstruído na webview.
 *
 * As funções puras (aplicar o diff, normalizar caminho, montar o título) vivem aqui SEM
 * import de runtime do VS Code — a classe recebe a API por injeção — para serem testáveis
 * fora do Extension Host (ver src/test/diff.test.ts).
 */
import type * as vscode from 'vscode';

export type DiffKind = 'novo' | 'removido' | 'alterado';

export interface FileDiffLike {
  path?: string;
  oldText?: string;
  newText?: string;
}

/** Conteúdo final de UM bloco de diff (os blocos do ACP são o arquivo inteiro, não hunks). */
export function appliedContent(oldText?: string, newText?: string): string {
  if (newText !== undefined) return newText;
  if (oldText !== undefined) return ''; // remoção: o resultado é vazio
  return '';
}

/** Vários blocos do mesmo arquivo em sequência: o último resultado é o estado aplicado. */
export function composeApplied(diffs: FileDiffLike[]): string {
  let content = '';
  for (const d of diffs) content = appliedContent(d.oldText, d.newText);
  return content;
}

/** 'novo' se não havia oldText; 'removido' se o último bloco não tem newText; senão 'alterado'. */
export function kindOf(diffs: FileDiffLike[]): DiffKind {
  if (diffs.length === 0) return 'alterado';
  if (diffs[0].oldText === undefined) return 'novo';
  if (diffs[diffs.length - 1].newText === undefined) return 'removido';
  return 'alterado';
}

/**
 * Normaliza um caminho vindo de diff: barras escuras -> '/', remove os prefixos `a/`/`b/`
 * do diff unificado e o `./`; se continuar relativo, resolve contra a raiz informada.
 */
export function normalizeDiffPath(p: string, root?: string): string {
  let s = p.trim().replace(/\\/g, '/');
  s = s.replace(/^[ab]\//, '').replace(/^\.\//, '');
  const abs = s.startsWith('/') || /^[A-Za-z]:\//.test(s);
  if (!abs && root) s = `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${s}`;
  return s;
}

/** Título legível do diff, em pt-BR, sem emoji. */
export function diffTitle(label: string, kind: DiffKind): string {
  return `Hermes: ${label} — ${kind}`;
}

export class DiffProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'hermes-diff';

  private readonly contents = new Map<string, string>();
  private readonly order: string[] = [];
  private readonly emitter: vscode.EventEmitter<vscode.Uri>;
  readonly onDidChange: vscode.Event<vscode.Uri>;
  private seq = 0;

  constructor(private readonly api: typeof import('vscode')) {
    this.emitter = new this.api.EventEmitter<vscode.Uri>();
    this.onDidChange = this.emitter.event;
  }

  /** Registra o conteúdo aplicado e devolve a Uri virtual que o representa. */
  put(content: string, label: string): vscode.Uri {
    const uri = this.api.Uri.from({ scheme: DiffProvider.scheme, path: `/${label}`, query: `${++this.seq}` });
    const key = uri.toString();
    this.contents.set(key, content);
    this.order.push(key);
    // ponytail: mantém os últimos 20 diffs; são one-shot, não vale um cache com política.
    while (this.order.length > 20) this.contents.delete(this.order.shift()!);
    return uri;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  dispose(): void {
    this.emitter.dispose();
    this.contents.clear();
    this.order.length = 0;
  }
}
