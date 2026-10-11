/**
 * Estado da webview "Gerenciar" + ponte tipada.
 *
 * O `send`/`onMessage` de `webview/shared/bridge.ts` é tipado pelo contrato do CHAT; este
 * painel tem o seu próprio conjunto de mensagens (`./protocol`). O cast é explícito e fica
 * isolado aqui — o resto da webview trabalha só com os tipos deste painel.
 */
import { signal } from '@preact/signals';
import { onMessage, send } from '../shared/bridge';
import type { HostToWebview, WebviewToHost } from '../../src/core/types';
import { emptyState, type HostToManage, type ManageState, type ManageToHost } from './protocol';

export const manageState = signal<ManageState>(emptyState());

export function sendManage(msg: ManageToHost): void {
  send(msg as unknown as WebviewToHost);
}

export function onManage(fn: (m: HostToManage) => void): void {
  onMessage((m: HostToWebview) => fn(m as unknown as HostToManage));
}
