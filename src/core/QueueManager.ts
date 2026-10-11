/**
 * Fila de prompts (client-side).
 *
 * O servidor ACP do Hermes também enfileira (`_claim_turn_or_queue`), mas não expõe
 * listar/remover/reordenar — então a fila visível é nossa e o servidor é só rede de
 * segurança (se um prompt escapar, ele responde "Queued for the next turn. (N queued)").
 */
import type * as vscode from 'vscode';
import type { ContextChip, QueueItem } from './types';

const KEY = 'hermes.queue';

export class QueueManager {
  private items: QueueItem[] = [];
  private seq = 0;

  constructor(private readonly store?: vscode.Memento) {
    this.items = this.store?.get<QueueItem[]>(KEY) ?? [];
    this.seq = this.items.length;
  }

  get all(): QueueItem[] { return [...this.items]; }
  get size(): number { return this.items.length; }

  add(text: string, chips: ContextChip[] = []): QueueItem {
    const item: QueueItem = { id: `q${Date.now()}-${++this.seq}`, text, chips };
    this.items.push(item);
    void this.persist();
    return item;
  }

  remove(id: string): void { this.items = this.items.filter((i) => i.id !== id); void this.persist(); }
  clear(): void { this.items = []; void this.persist(); }

  /** move o item em `delta` posições (arrastar / Alt+↑↓) */
  move(id: string, delta: -1 | 1): void {
    const i = this.items.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.items.length) return;
    const [it] = this.items.splice(i, 1);
    this.items.splice(j, 0, it);
    void this.persist();
  }

  /** pega o próximo e o remove da fila (drain após cada turno) */
  next(): QueueItem | undefined {
    const it = this.items.shift();
    void this.persist();
    return it;
  }

  /** remove do meio para "enviar agora" */
  take(id: string): QueueItem | undefined {
    const it = this.items.find((x) => x.id === id);
    if (it) this.remove(id);
    return it;
  }

  private persist(): Thenable<void> | undefined { return this.store?.update(KEY, this.items); }
}
