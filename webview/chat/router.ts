/**
 * Roteador do contrato `HostToWebview` da webview do chat.
 *
 * Regra de abas: mensagens com `tab` selado que NÃO é a aba ativa mexem apenas no snapshot daquela
 * aba (lane em background); o resto cai na aba ativa. `tabs`/`init` trocam a aba ativa e restauram
 * o transcript dela.
 *
 * Vive fora do `main.tsx` para ser testável sem DOM (o `main` faz o `render`).
 */
import type { ChatState, HostToWebview, TabInfo } from '../../src/core/types';
import { coerceTurns } from './logic';
import {
  changed, chips, commands, lastStop, models, modes, notice, permission, plan, queue, state,
  tools, turns, usage,
} from './store';
import { captureActive, restoreTranscript, routeBackground, snapshotOf } from './store';

/** Aplica uma mensagem de sessão na aba ativa (o estado vivo nos signals). */
function reduce(m: HostToWebview): void {
  switch (m.type) {
    case 'hydrate':
      turns.value = coerceTurns(m.turns).map((t) => ({ ...t, streaming: false }));
      break;
    case 'session':
      state.value = { ...state.value, sessionId: m.sessionId };
      break;
    case 'busy':
      state.value = { ...state.value, busy: m.value };
      break;
    case 'user/message':
      turns.value = [...turns.value, { id: `u${Date.now()}`, role: 'user', text: m.text, chips: m.chips, startedAt: Date.now() }];
      break;
    case 'agent/chunk': {
      const list = turns.value;
      const last = list[list.length - 1];
      if (last && last.role === 'agent' && last.id === m.messageId) {
        turns.value = [...list.slice(0, -1), { ...last, text: last.text + m.text, streaming: true }];
      } else {
        turns.value = [...list, { id: m.messageId, role: 'agent', text: m.text, streaming: true, startedAt: Date.now() }];
      }
      break;
    }
    case 'agent/message':
      turns.value = [...turns.value, { id: m.messageId, role: 'agent', text: m.text, startedAt: Date.now() }];
      break;
    case 'thought/chunk': {
      const list = turns.value;
      const last = list[list.length - 1];
      if (last && last.role === 'agent') {
        turns.value = [...list.slice(0, -1), {
          ...last, thought: (last.thought ?? '') + m.text, streaming: true,
          thoughtStartedAt: last.thoughtStartedAt ?? Date.now(),
        }];
      } else {
        // O turno nasce com o `messageId` do chunk: o `agent_message_chunk` seguinte, com o mesmo
        // id, aterrissa DENTRO dele — raciocínio e resposta ficam no mesmo balão (um só rótulo).
        turns.value = [...list, {
          id: m.messageId, role: 'agent', text: '', thought: m.text, streaming: true,
          startedAt: Date.now(), thoughtStartedAt: Date.now(),
        }];
      }
      break;
    }
    case 'turn/end': {
      lastStop.value = m.stopReason;
      const now = Date.now();
      turns.value = turns.value.map((t) => ({
        ...t, streaming: false,
        thoughtMs: t.thought && !t.thoughtMs && t.thoughtStartedAt ? now - t.thoughtStartedAt : t.thoughtMs,
      }));
      break;
    }
    case 'tool/start':
      tools.value = [...tools.value, m.tool];
      break;
    case 'tool/update':
      tools.value = tools.value.map((t) => (t.id === m.id ? { ...t, ...m.patch } : t));
      break;
    case 'plan':
      plan.value = m.entries;
      break;
    case 'usage':
      usage.value = { size: m.size, used: m.used, turn: m.turn };
      break;
    case 'permission/ask':
      permission.value = m.req;
      break;
    case 'permission/resolve':
      permission.value = null;
      break;
    case 'commands':
      commands.value = m.commands;
      break;
    case 'modes':
      modes.value = m.modes;
      state.value = { ...state.value, modes: m.modes, currentMode: m.current };
      break;
    case 'models':
      models.value = m.models;
      state.value = { ...state.value, models: m.models, currentModel: m.current };
      break;
    case 'queue':
      queue.value = m.items;
      break;
    case 'chips':
      chips.value = m.chips;
      break;
    case 'workingset':
      changed.value = m.files;
      break;
    case 'notice':
      notice.value = { level: m.level, text: m.text };
      break;
    case 'error':
      notice.value = { level: 'error', text: m.text };
      break;
    case 'init':
    case 'tabs':
      // troca de aba tratada em applyInit/applyTabs
      break;
  }
}

/** `{type:'tabs'}`: as abas mudaram. Se a ativa mudou, guarda a atual e restaura o transcript da nova. */
function applyTabs(tabs: TabInfo[], active: string): void {
  const prev = state.value.activeTab;
  if (prev && active && active !== prev) {
    captureActive();
    state.value = { ...state.value, tabs, activeTab: active };
    restoreTranscript(snapshotOf(active));
  } else {
    state.value = { ...state.value, tabs, activeTab: active };
  }
}

/** `{type:'init'}`: estado da aba ativa (autoritativo do host). Troca de aba restaura o transcript dela. */
function applyInit(s: ChatState): void {
  const prev = state.value.activeTab;
  const swapped = !!prev && !!s.activeTab && s.activeTab !== prev;
  if (swapped) captureActive();
  // Sem `batch()`: no bundle empacotado as escritas feitas dentro dele não chegavam à UI (medido no
  // harness: o `init` do host era inteiramente ignorado — sem abas, sem sessão, e as escritas não
  // faziam efeito apesar de `applyInit` rodar). As escritas soltas abaixo fazem o mesmo e funcionam.
  state.value = s;
  chips.value = s.chips;
  queue.value = s.queue;
  plan.value = s.plan;
  changed.value = s.workingSet;
  modes.value = s.modes;
  models.value = s.models;
  commands.value = s.commands;
  usage.value = s.usage ? { ...s.usage, turn: s.turnUsage } : undefined;
  // o `init` não traz o transcript: restaura o da aba recém-ativada
  if (swapped) restoreTranscript(snapshotOf(s.activeTab));
}

export function applyHost(m: HostToWebview): void {
  if (m.type === 'tabs') { applyTabs(m.tabs, m.active); return; }
  if (m.type === 'init') { applyInit(m.state); return; }
  const tab = (m as { tab?: string }).tab;
  const active = state.value.activeTab;
  if (tab && active && tab !== active) {
    // lane em background: mexe só no snapshot da aba, a aba ativa continua intacta
    routeBackground(tab, () => reduce(m));
    return;
  }
  reduce(m);
}
