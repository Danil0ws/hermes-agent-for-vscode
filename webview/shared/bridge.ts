/** Ponte tipada com o extension host. Sem dependência de framework. */
import type { HostToWebview, WebviewToHost } from '../../src/core/types';

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();
const listeners = new Set<(m: HostToWebview) => void>();

window.addEventListener('message', (e: MessageEvent<HostToWebview>) => {
  for (const fn of listeners) fn(e.data);
});

export function send(msg: WebviewToHost): void { api.postMessage(msg); }
export function onMessage(fn: (m: HostToWebview) => void): void {
  listeners.add(fn);
  return undefined;
}
export function ready(): void { send({ type: 'ready' }); }
