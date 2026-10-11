/**
 * Webview do chat (M1 streaming + M2/M3/M5 do lado visual).
 * Só UI: nenhuma chamada de rede, todo estado vem do extension host pelo contrato (HostToWebview).
 */
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { batch } from '@preact/signals';
import { onMessage, ready } from '../shared/bridge';
import {
  changed, chips, commands, lastStop, models, modes, notice, permission, plan, queue, state,
  tools, turns, usage,
} from './store';
import { coerceTurns } from './logic';
import { S } from './i18n';
import { Transcript } from './transcript';
import { Composer } from './composer';
import type { HostToWebview } from '../../src/core/types';
import '@vscode/codicons/dist/codicon.css';
import './styles.css';

/* ─────────── roteador de mensagens do host ─────────── */

function applyHost(m: HostToWebview): void {
  switch (m.type) {
    case 'init':
      batch(() => {
        state.value = m.state;
        chips.value = m.state.chips;
        queue.value = m.state.queue;
        plan.value = m.state.plan;
        changed.value = m.state.workingSet;
        modes.value = m.state.modes;
        models.value = m.state.models;
        commands.value = m.state.commands;
        usage.value = m.state.usage ? { ...m.state.usage, turn: m.state.turnUsage } : undefined;
      });
      break;
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
  }
}

/* ─────────── app ─────────── */

function App() {
  useEffect(() => {
    onMessage(applyHost);
    ready();
  }, []);
  const n = notice.value;
  const cancelled = lastStop.value === 'cancelled';
  return (
    <div class="app">
      {cancelled && <div class="notice info" role="status">{S.notice.cancelled}</div>}
      {n && <div class={`notice ${n.level}`} role="status">{n.text}</div>}
      <Transcript />
      <Composer />
    </div>
  );
}

render(<App />, document.getElementById('root')!);
