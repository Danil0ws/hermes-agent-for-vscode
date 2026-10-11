/**
 * Webview do chat (M1: transcript + streaming + thinking + tools + aprovação + composer).
 * Só UI: nenhuma chamada de rede, todo estado vem do extension host pelo contrato.
 */
import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { batch, computed } from '@preact/signals';
import { onMessage, ready, send } from '../shared/bridge';
import {
  changed, chips, commands, draft, lastStop, models, modes, notice, permission, plan,
  queue, state, tools, turns, usage,
} from './store';
import type { HostToWebview } from '../../src/core/types';
import './styles.css';

/* ─────────── roteador de mensagens do host ─────────── */

function applyHost(m: HostToWebview): void {
  switch (m.type) {
    case 'init':
      batch(() => { state.value = m.state; chips.value = m.state.chips; queue.value = m.state.queue; plan.value = m.state.plan; changed.value = m.state.workingSet; modes.value = m.state.modes; models.value = m.state.models; commands.value = m.state.commands; usage.value = m.state.usage; });
      break;
    case 'hydrate':
      turns.value = [];
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
        turns.value = [...list.slice(0, -1), { ...last, text: last.text + m.text }];
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
        turns.value = [...list.slice(0, -1), { ...last, thought: (last.thought ?? '') + m.text }];
      } else {
        turns.value = [...list, { id: `t${Date.now()}`, role: 'agent', text: '', thought: m.text, streaming: true, startedAt: Date.now() }];
      }
      break;
    }
    case 'turn/end':
      lastStop.value = m.stopReason;
      turns.value = turns.value.map((t) => ({ ...t, streaming: false }));
      break;
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

/* ─────────── componentes ─────────── */

const pct = computed(() => {
  const u = usage.value;
  if (!u || u.size <= 0) return null;
  return Math.round((u.used / u.size) * 100);
});

const meterClass = computed(() => {
  const p = pct.value;
  if (p === null) return 'ok';
  if (p > 90) return 'critical';
  if (p >= 70) return 'warn';
  return 'ok';
});

function Meter() {
  const p = pct.value;
  const u = usage.value;
  const title = u && u.size > 0
    ? `${u.used.toLocaleString('pt-BR')} de ${u.size.toLocaleString('pt-BR')} tokens (${p}%) — reportado pelo agente`
    : 'O agente ainda não reportou a janela de contexto';
  return (
    <span class={`meter ${meterClass.value}`} tabindex={0} role="meter" aria-label="Uso do contexto"
      aria-valuenow={p ?? undefined} aria-valuemin={0} aria-valuemax={100} title={title}>
      <span class="ring" aria-hidden="true" />
      {p === null ? '—' : `${p}%`}
    </span>
  );
}

function Status({ value }: { value: string }) {
  const map: Record<string, string> = { completed: '✓', failed: '✕', in_progress: '◐', pending: '○', cancelled: '⊘' };
  return <span class={`status ${value}`}>{map[value] ?? value}</span>;
}

function Transcript() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [turns.value.length, tools.value.length]);
  return (
    <div class="transcript" ref={ref}>
      {turns.value.length === 0 && tools.value.length === 0 && <Empty />}
      {turns.value.map((t) => (
        <div class="turn" key={t.id}>
          <div class="turn-role">{t.role === 'user' ? 'você' : state.value.agent || 'hermes'}</div>
          {t.thought && state.value.showReasoning !== 'hidden' && (
            <details class="thought" open={state.value.showReasoning === 'always'}>
              <summary>Raciocínio</summary>
              <pre>{t.thought}</pre>
            </details>
          )}
          {t.text && <div class={`bubble ${t.role}`}>{t.text}</div>}
          {t.chips && t.chips.length > 0 && (
            <div class="chips">{t.chips.map((c) => <span class="chip" key={c.id}>{c.label}</span>)}</div>
          )}
        </div>
      ))}
      {tools.value.map((tool) => (
        <details class="tool" key={tool.id}>
          <summary>
            <span class="kind" aria-hidden="true">{tool.kind}</span>
            <span>{tool.title}</span>
            <Status value={tool.status} />
            {tool.endedAt && <span class="kind">{((tool.endedAt - tool.startedAt) / 1000).toFixed(1)}s</span>}
          </summary>
          {tool.input && <pre>{tool.input}</pre>}
          {tool.output && <pre>{tool.output}</pre>}
          {tool.diffs?.length ? (
            <div class="row" style="padding:4px 6px">
              {tool.diffs.map((d) => (
                <button class="secondary" key={d.path} onClick={() => send({ type: 'openDiff', path: d.path })}>
                  diff {d.path.split('/').pop()}
                </button>
              ))}
            </div>
          ) : null}
        </details>
      ))}
      {plan.value.length > 0 && <Plan />}
      {changed.value.length > 0 && <WorkingSet />}
      {permission.value && <Permission />}
    </div>
  );
}

function Plan() {
  const total = plan.value.length;
  const done = plan.value.filter((p) => p.status === 'completed').length;
  return (
    <div class="section" aria-label="Plano">
      <header><span>Plano</span><span>{done}/{total}</span></header>
      {plan.value.map((p, i) => (
        <div class="plan-row" key={i}>
          <span class={`status ${p.status}`} aria-hidden="true">{p.status === 'completed' ? '✓' : p.status === 'in_progress' ? '◐' : '○'}</span>
          <span>{p.content}</span>
        </div>
      ))}
    </div>
  );
}

function WorkingSet() {
  const added = changed.value.reduce((a, f) => a + f.added, 0);
  const removed = changed.value.reduce((a, f) => a + f.removed, 0);
  return (
    <div class="section" aria-label="Arquivos alterados">
      <header><span>Arquivos alterados</span><span>{changed.value.length} · +{added} −{removed}</span></header>
      {changed.value.map((f) => (
        <div class="plan-row" key={f.path}>
          <span class="kind">{f.status}</span>
          <span>{f.path.split('/').pop()}</span>
          <span class="kind">+{f.added} −{f.removed}</span>
          <span class="spacer" />
          <button class="secondary" onClick={() => send({ type: 'openDiff', path: f.path })}>diff</button>
        </div>
      ))}
      <div class="row" style="margin-top:4px">
        <button class="secondary" onClick={() => send({ type: 'openDiff', path: changed.value[0]?.path ?? '' })} disabled>Manter tudo</button>
        <button class="secondary" onClick={() => send({ type: 'undoFile', path: changed.value[0]?.path ?? '' })}>Desfazer tudo (M7)</button>
      </div>
    </div>
  );
}

function Permission() {
  const req = permission.value!;
  return (
    <div class="permission" role="alertdialog" aria-label="Aprovação necessária">
      <strong>{req.title}</strong>
      {req.detail && <div class="detail">{req.detail}</div>}
      {req.cwd && <div class="notice info">{req.cwd}</div>}
      <div class="row">
        {req.options.map((o) => (
          <button key={o.optionId} onClick={() => send({ type: 'permission/answer', id: req.id, optionId: o.optionId })}>
            {o.name}
          </button>
        ))}
        <button class="secondary" onClick={() => send({ type: 'permission/answer', id: req.id, optionId: req.options.find((o) => o.kind.startsWith('reject'))?.optionId ?? '' })}>Negar</button>
      </div>
    </div>
  );
}

function Empty() {
  const actions = [
    ['Explicar este projeto', 'Explique a arquitetura deste projeto e por onde eu começo.'],
    ['Encontrar problemas', 'Encontre problemas no código deste workspace e priorize os riscos.'],
    ['Escrever testes', 'Escreva testes para o que ainda não tem cobertura.'],
    ['Planejar uma mudança', 'Planeje, passo a passo, a mudança que eu descrever.'],
  ] as const;
  return (
    <div class="empty">
      <p>O Hermes roda na sua máquina, com as suas skills, memória e ferramentas.</p>
      <ul>
        {actions.map(([label, text]) => (
          <li key={label}><button class="secondary" onClick={() => send({ type: 'prompt', text, chips: chips.value, action: 'send' })}>{label}</button></li>
        ))}
      </ul>
      <button class="secondary" onClick={() => send({ type: 'openManage' })}>Gerenciar modelos, skills e MCP…</button>
    </div>
  );
}

function Queue() {
  if (!state.value.queueEnabled || queue.value.length === 0) return null;
  return (
    <div class="section" aria-label="Fila de prompts">
      <header><span>{queue.value.length} na fila</span><span class="spacer" /><button class="secondary" onClick={() => send({ type: 'queue/clear' })}>Limpar</button></header>
      {queue.value.map((q) => (
        <div class="plan-row" key={q.id}>
          <span>{q.text.length > 60 ? `${q.text.slice(0, 60)}…` : q.text}</span>
          <span class="spacer" />
          <button class="secondary" onClick={() => send({ type: 'queue/sendNow', id: q.id })}>▶ agora</button>
          <button class="secondary" onClick={() => send({ type: 'queue/move', id: q.id, delta: -1 })} aria-label="Subir">↑</button>
          <button class="secondary" onClick={() => send({ type: 'queue/move', id: q.id, delta: 1 })} aria-label="Descer">↓</button>
          <button class="secondary" onClick={() => send({ type: 'queue/remove', id: q.id })} aria-label="Remover">×</button>
        </div>
      ))}
    </div>
  );
}

function Composer() {
  const box = useRef<HTMLTextAreaElement>(null);
  const busy = state.value.busy;

  const submit = (action: 'send' | 'queue' | 'steer' | 'interrupt') => {
    const text = draft.value;
    if (!text.trim() && chips.value.length === 0) return;
    draft.value = '';
    if (box.current) box.current.style.height = 'auto';
    send({ type: 'prompt', text, chips: chips.value, action });
  };

  return (
    <div class="composer">
      <Queue />
      {chips.value.length > 0 && (
        <div class="chips">
          {chips.value.map((c) => (
            <span class={`chip ${c.implicit ? 'implicit' : ''}`} key={c.id} title={`${c.ref} · ~${c.tokensEstimate} tokens (estimado)`}>
              {c.label}
              <button aria-label={`Remover ${c.label}`} onClick={() => send({ type: 'removeChip', id: c.id })}>×</button>
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={box}
        class="input"
        value={draft.value}
        placeholder={busy
          ? 'Enfileirar, dar direção ou interromper o turno em andamento'
          : 'Pergunte ao Hermes, # para contexto, / para comandos'}
        aria-label="Mensagem para o Hermes"
        onInput={(e) => draft.value = (e.target as HTMLTextAreaElement).value}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(busy ? state.value.queueDefaultAction === 'steer' ? 'steer' : 'queue' : 'send'); }
          if (e.key === 'Escape' && busy) { e.preventDefault(); send({ type: 'cancel' }); }
        }}
      />
      <div class="toolbar">
        <button class="secondary" title="Adicionar contexto" aria-label="Adicionar contexto" onClick={() => send({ type: 'addContext' })}>+</button>
        <select
          title="Modo / permissões"
          aria-label="Modo"
          value={state.value.currentMode ?? ''}
          onChange={(e) => send({ type: 'setMode', modeId: (e.target as HTMLSelectElement).value })}
        >
          {modes.value.length === 0 && <option value="">(sem modos anunciados)</option>}
          {modes.value.map((m) => <option key={m.id} value={m.id} title={m.description}>{m.name}</option>)}
        </select>
        <select
          title="Modelo"
          aria-label="Modelo"
          value={state.value.currentModel ?? ''}
          onChange={(e) => send({ type: 'setModel', modelId: (e.target as HTMLSelectElement).value })}
        >
          {models.value.length === 0 && <option value="">(sem catálogo do agente)</option>}
          {models.value.map((m) => <option key={m.modelId} value={m.modelId} title={m.description}>{m.name}</option>)}
        </select>
        <button class="secondary" title="Configurar ferramentas (Gerenciar)" aria-label="Ferramentas" onClick={() => send({ type: 'openManage', tab: 'tools' })}>tools</button>
        <span class="spacer" />
        <Meter />
        {busy ? (
          <>
            <button onClick={() => send({ type: 'cancel' })} title="Parar (Esc)">■ Parar</button>
            <select aria-label="Ação de envio" value="" onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) submit(v as 'queue' | 'steer' | 'interrupt'); (e.target as HTMLSelectElement).value = ''; }}>
              <option value="">▾</option>
              <option value="queue">Adicionar à fila</option>
              <option value="steer">Direcionar turno</option>
              <option value="interrupt">Enviar agora (interromper)</option>
            </select>
          </>
        ) : (
          <button onClick={() => submit('send')} title="Enviar (Enter)">Enviar</button>
        )}
      </div>
    </div>
  );
}

function App() {
  useEffect(() => {
    onMessage(applyHost);
    ready();
  }, []);
  const n = notice.value;
  return (
    <div class="app">
      {lastStop.value === 'cancelled' && <div class="notice info">Turno cancelado.</div>}
      {n && <div class={`notice ${n.level}`} role="status">{n.text}</div>}
      <Transcript />
      <Composer />
    </div>
  );
}

render(<App />, document.getElementById('root')!);
