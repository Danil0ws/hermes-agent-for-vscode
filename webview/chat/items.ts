/**
 * Vínculo tool call ↔ turno em que ele nasceu.
 *
 * Sem esse vínculo, o transcript renderizava TODOS os tool calls num bloco depois de todos os turnos:
 * a lista só crescia, e o card de uma execução antiga (o último da lista, que nasce aberto) ficava
 * embaixo da conversa nova, parecendo atividade em andamento. Este é o contrato entre quem ESCREVE o
 * vínculo (o reducer, `router.ts`) e quem RENDERIZA (`transcript.tsx`) — os dois lados importam daqui.
 *
 * Puro: sem DOM, sem sinais, sem `vscode`.
 */
import type { ToolView } from '../../src/core/types';
import type { TurnLike } from './status';

export type ToolEntry = ToolView & { turnId?: string };

/**
 * A qual turno um tool que chegou AGORA pertence: o último turno do agente (o tool roda dentro da
 * resposta dele); sem turno do agente ainda, o último turno qualquer (o prompt do usuário é o dono
 * visível do que veio depois dele). Nada no transcript = sem dono.
 */
export function ownerTurnId(turns: TurnLike[]): string | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i] as TurnLike;
    if (t.role === 'agent') return t.id;
  }
  return turns[turns.length - 1]?.id;
}

/**
 * Tools do turno `turnId`. Um tool que chegou sem dono (antes de qualquer turno existir) cai no
 * ÚLTIMO turno — some da tela seria pior do que aparecer no lugar aproximado.
 */
export function toolsOfTurn(tools: ToolEntry[], turnId: string | undefined, last: boolean): ToolEntry[] {
  return tools.filter((t) => (t.turnId ? t.turnId === turnId : last));
}
