/**
 * Barra de abas do chat. Uma aba = uma conversa (uma sessão do ACP); a aba ativa é a que o
 * transcript renderiza, e as demais continuam acumulando em background (lane ativa).
 *
 * STUB da coordenação: existe só para fixar o contrato entre as lanes. A lane A substitui o corpo.
 */
import type { TabInfo } from '../../src/core/types';

export interface TabBarProps {
  tabs: TabInfo[];
  active: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNew: () => void;
  onNewWorktree: () => void;
}

export function TabBar(_props: TabBarProps) {
  return null; // STUB(lane A)
}
