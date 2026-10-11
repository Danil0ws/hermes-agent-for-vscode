/**
 * WorkingSet — arquivos alterados pelo agente, derivados dos diffs dos tool_calls.
 *
 * Fonte: `HermesSession.changedFiles` e `HermesSession.diffsFor(path)` (blocos `diff` de
 * `patch`/`write_file`/`skill_manage` + diff unificado em bloco de texto).
 *
 * IMPORTANTE: o Hermes escreve no disco com as PRÓPRIAS tools; o cliente não intercepta a
 * escrita. "Manter" não faz nada (o arquivo já está no disco) — é só o gesto de dispensar a
 * linha. "Desfazer" aplica o diff INVERSO via `WorkspaceEdit` do VS Code sobre o conteúdo
 * ATUAL do arquivo. Os diffs brutos ficam guardados exatamente para isso.
 *
 * O módulo não importa o runtime do `vscode`: leitura/escrita/edição são injetadas.
 */
import type { ChangedFile, FileDiff } from './types';

export interface WorkingSetDeps {
  /** arquivos alterados acumulados na sessão (HermesSession.changedFiles). */
  changed(): ChangedFile[];
  /** diffs brutos de um caminho (HermesSession.diffsFor). */
  diffsFor(path: string): FileDiff[];
  /** conteúdo atual do arquivo no disco. */
  readFile(path: string): Promise<string>;
  /** grava `content` como conteúdo inteiro do arquivo (WorkspaceEdit + save na feature). */
  applyEdit(path: string, content: string): Promise<void>;
  /** confirmação para ações destrutivas ("Desfazer tudo"). */
  confirm(message: string): Promise<boolean>;
  notify(message: string): void;
  log(level: 'info' | 'warn' | 'error', text: string): void;
}

/** detalhe por arquivo: números do agente + diffs brutos para o inverso. */
export interface FileChange extends ChangedFile {
  diffs: FileDiff[];
}

/* ── lógica pura (testável sem o VS Code) ── */

/** conta +/− de um diff unificado (ignora os cabeçalhos `---`/`+++`). */
export function countChanges(diffText: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added++;
    else if (line.startsWith('-')) removed++;
  }
  return { added, removed };
}

/**
 * Aplica (ou desfaz) um `FileDiff` sobre um texto.
 *  - forward: troca `oldText` por `newText`;
 *  - reverse: troca `newText` por `oldText` (o "desfazer").
 * Devolve o texto INALTERADO quando o lado de origem não aparece (nada de inventar conteúdo).
 */
export function applyFileDiff(text: string, diff: FileDiff, reverse = false): string {
  const from = reverse ? diff.newText : diff.oldText;
  const to = reverse ? diff.oldText : diff.newText;
  if (from === undefined && to === undefined) return text;
  const src = from ?? '';
  const dst = to ?? '';
  if (src === '') return dst; // arquivo criado (forward) / recriado (reverse)
  const idx = text.indexOf(src);
  if (idx < 0) return text; // diff não se aplica ao texto atual
  return text.slice(0, idx) + dst + text.slice(idx + src.length);
}

/** Desfaz uma sequência de diffs (aplicados em ordem) sobre o texto atual. */
export function reverseApply(text: string, diffs: FileDiff[]): string {
  let out = text;
  for (let i = diffs.length - 1; i >= 0; i--) out = applyFileDiff(out, diffs[i]!, true);
  return out;
}

export class WorkingSet {
  constructor(private readonly deps: WorkingSetDeps) {}

  /** arquivos alterados com +/− e os diffs brutos por arquivo. */
  details(): FileChange[] {
    return this.deps.changed().map((f) => ({ ...f, diffs: this.deps.diffsFor(f.path) }));
  }

  /** +/− por arquivo (números do agente). */
  countFor(path: string): { added: number; removed: number } {
    const f = this.deps.changed().find((x) => x.path === path);
    return { added: f?.added ?? 0, removed: f?.removed ?? 0 };
  }

  /**
   * "Manter" = no-op documentado: o arquivo JÁ está no disco (o agente escreveu com as
   * próprias tools). Só afirmamos isso explicitamente ao usuário.
   */
  keep(path: string): void {
    this.deps.notify(`"${path}" mantido (o Hermes já gravou no disco).`);
  }

  keepAll(): void {
    this.deps.notify('Alterações mantidas (o Hermes já gravou no disco).');
  }

  /** "Desfazer" = aplica o diff inverso sobre o conteúdo atual do arquivo. */
  async undo(path: string): Promise<void> {
    const diffs = this.deps.diffsFor(path);
    if (!diffs.length) {
      this.deps.notify(`Sem diff guardado para "${path}" — não há como desfazer.`);
      return;
    }
    const current = await this.deps.readFile(path);
    const restored = reverseApply(current, diffs);
    if (restored === current) {
      this.deps.notify(`Nenhuma alteração reversível em "${path}".`);
      return;
    }
    await this.deps.applyEdit(path, restored);
    this.deps.notify(`Diff inverso aplicado a "${path}". O arquivo já estava no disco; isto o reverte.`);
  }

  async undoAll(): Promise<void> {
    const files = this.deps.changed();
    if (!files.length) return;
    if (!(await this.deps.confirm(`Desfazer as alterações de ${files.length} arquivo(s)?`))) return;
    for (const f of files) {
      try {
        await this.undo(f.path);
      } catch (err) {
        this.deps.log('error', `desfazer ${f.path} falhou: ${String(err)}`);
      }
    }
  }
}
