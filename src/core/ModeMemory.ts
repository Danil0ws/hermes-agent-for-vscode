/**
 * Memória do modo de edição (a política de aprovação que o agente expõe como modos ACP:
 * `default`, `accept_edits`, `dont_ask`).
 *
 * Por que existe: o agente **persiste** o modo por sessão (verificado: `session/load` devolve
 * `accept_edits` depois de um `session/set_mode`), mas uma sessão NOVA nasce sempre em `default`.
 * Quem quer editar sem aprovação tinha de reescolher o modo a cada conversa — e ainda perdia a
 * escolha visualmente, porque o agente não emite `current_mode_update` ao trocar (ver
 * `HermesSession.setMode`). Aqui fica a última escolha do usuário, por perfil do VS Code.
 *
 * O valor guardado é o **id do modo**, não o índice: o seletor é montado a partir da lista que o
 * agente anuncia, então um id que não exista mais é simplesmente ignorado (`applyTo`).
 */
import type * as vscode from 'vscode';
import type { ModeInfo } from './types';

const KEY = 'hermes.mode';

export class ModeMemory {
  constructor(private readonly store?: vscode.Memento) {}

  get remembered(): string | undefined {
    const v = this.store?.get<string>(KEY);
    return v || undefined;
  }

  async remember(modeId: string): Promise<void> {
    if (!modeId) return;
    await this.store?.update(KEY, modeId);
  }

  /**
   * Modo a aplicar numa sessão recém-criada, ou `undefined` para não mexer em nada.
   *
   * Só devolve um id que o agente REALMENTE anunciou nesta sessão: um modo renomeado/removido numa
   * versão nova do Hermes vira silêncio (a sessão fica no default do agente) em vez de um erro.
   */
  applyTo(modes: ModeInfo[], current?: string): string | undefined {
    const mode = this.remembered;
    if (!mode || mode === current) return undefined;
    return modes.some((m) => m.id === mode) ? mode : undefined;
  }
}
