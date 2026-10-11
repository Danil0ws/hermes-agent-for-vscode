/**
 * Transcript do chat: turnos, raciocínio, tool calls, plano, arquivos alterados e aprovação.
 * Virtualização à mão (janela de renderização) — o transcript do Hermes pode ter milhares de turnos.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { send } from '../shared/bridge';
import { S, num } from './i18n';
import { splitFenced, visibleTurns } from './logic';
import { changed, chips, draft, focusComposer, plan, state, tools, turns } from './store';
import type { Turn } from './store';
import type { PlanEntry, ToolView } from '../../src/core/types';

/** Quantos turnos renderizamos de cada vez (a janela cresce sob demanda). */
const RENDER_LIMIT = 200;

const elapsed = (ms: number) => (ms / 1000).toFixed(1);

function Icon({ kind, label }: { kind: string; label: string }) {
  const g = S.icon[kind] ?? S.icon.other;
  return label
    ? <span class="ic" role="img" aria-label={label}>{g}</span>
    : <span class="ic" aria-hidden="true">{g}</span>;
}

/* ─────────── bloco de código ─────────── */

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="code">
      <div class="code-head">
        <span class="code-lang">{lang || 'texto'}</span>
        <span class="spacer" />
        <button class="secondary" title={S.code.insert} aria-label={S.code.insert}
          onClick={() => send({ type: 'applyToEditor', text: code })}>{S.code.insert}</button>
        <button class="secondary" title={S.code.copy} aria-label={S.code.copy}
          onClick={() => { send({ type: 'copy', text: code }); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
          {copied ? S.response.copied : S.code.copy}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

/** Texto com cercas ``` reconhecidas; o resto vai como texto (sem markdown completo). */
function Body({ text }: { text: string }) {
  const segs = splitFenced(text);
  return (
    <>
      {segs.map((s, i) =>
        s.type === 'code'
          ? <CodeBlock key={i} lang={s.lang} code={s.code} />
          : <span class="seg-text" key={i}>{s.text}</span>,
      )}
    </>
  );
}

/* ─────────── raciocínio ─────────── */

function Thought({ turn }: { turn: Turn }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!turn.streaming || !turn.thoughtStartedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [turn.streaming, turn.thoughtStartedAt]);

  const ms = turn.streaming && turn.thoughtStartedAt
    ? Date.now() - turn.thoughtStartedAt
    : turn.thoughtMs ?? 0;
  const st = turn.streaming ? S.thought.running : S.thought.done;
  return (
    <details class="thought" open={state.value.showReasoning === 'always'}
      aria-label={`${S.thought.summary} · ${st}`}>
      <summary>
        <span aria-hidden="true">{turn.streaming ? '◐' : '✓'}</span>
        <span>{S.thought.summary}</span>
        <span class="muted">· {S.thought.elapsed(elapsed(ms))} · {st}</span>
      </summary>
      <pre>{turn.thought}</pre>
    </details>
  );
}

/* ─────────── tool call ─────────── */

function ToolItem({ tool }: { tool: ToolView }) {
  const kind = tool.kind || 'other';
  const label = S.tool.kind[kind] ?? S.tool.kind.other;
  const dur = tool.endedAt ? S.tool.duration(elapsed(tool.endedAt - tool.startedAt)) : null;
  return (
    <details class="tool">
      <summary aria-label={`${label}: ${tool.title} — ${S.status[tool.status] ?? tool.status}`}>
        <Icon kind={kind} label={label} />
        <span class="tool-title">{tool.title || S.tool.titleFallback}</span>
        <span class={`status ${tool.status}`}>{S.statusGlyph[tool.status] ?? tool.status}</span>
        {dur && <span class="muted">{dur}</span>}
      </summary>
      {tool.input && <><div class="io-label">{S.tool.input}</div><pre>{tool.input}</pre></>}
      {tool.output && <><div class="io-label">{S.tool.output}</div><pre>{tool.output}</pre></>}
      {tool.diffs?.length ? (
        <div class="row">
          {tool.diffs.map((d) => (
            <button class="secondary" key={d.path} onClick={() => send({ type: 'openDiff', path: d.path })}>
              {S.workingSet.diff} {d.path.split('/').pop()}
            </button>
          ))}
        </div>
      ) : null}
    </details>
  );
}

/* ─────────── turno ─────────── */

function TurnView({ turn, prevUser }: { turn: Turn; prevUser?: string }) {
  const isUser = turn.role === 'user';
  const canDiff = changed.value.length > 0;
  return (
    <div class={`turn ${turn.role}`}>
      <div class="turn-role">{isUser ? S.role.user : (state.value.agent || S.role.agentFallback)}</div>
      {!isUser && turn.thought && state.value.showReasoning !== 'hidden' && <Thought turn={turn} />}
      {turn.text && <div class={`bubble ${turn.role}`}><Body text={turn.text} /></div>}
      {isUser && turn.chips && turn.chips.length > 0 && (
        <div class="chips static">{turn.chips.map((c) => (
          <span class="chip" key={c.id}><Icon kind={c.kind} label={c.kind} />{c.label}</span>
        ))}</div>
      )}
      {isUser ? (
        <div class="actions">
          <button class="secondary" title={S.userMsg.edit} aria-label={S.userMsg.edit}
            onClick={() => { draft.value = turn.text; focusComposer.value++; }}>
            {S.userMsg.edit}
          </button>
        </div>
      ) : (
        <div class="actions" role="group" aria-label={S.a11y.responseActions(state.value.agent || S.role.agentFallback)}>
          <button class="secondary" aria-label={S.response.copy} title={S.response.copy}
            onClick={() => send({ type: 'copy', text: turn.text })}>{S.response.copy}</button>
          {prevUser && (
            <button class="secondary" aria-label={S.response.rerun} title={S.response.rerun}
              onClick={() => send({ type: 'prompt', text: prevUser, chips: chips.value, action: 'send' })}>
              {S.response.rerun}
            </button>
          )}
          <button class="secondary" aria-label={S.response.insert} title={S.response.insert}
            onClick={() => send({ type: 'applyToEditor', text: turn.text })}>{S.response.insert}</button>
          {canDiff && (
            <button class="secondary" aria-label={S.response.openDiff} title={S.response.openDiff}
              onClick={() => send({ type: 'openDiff', path: changed.value[0].path })}>{S.response.openDiff}</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────── plano ─────────── */

function Plan({ entries }: { entries: PlanEntry[] }) {
  const done = entries.filter((p) => p.status === 'completed').length;
  return (
    <div class="section" aria-label={S.a11y.plan}>
      <header>
        <span>{S.plan.title}</span>
        <span class="muted">{S.plan.count(done, entries.length)}</span>
        <span class="spacer" />
        <button class="secondary" onClick={() => send({ type: 'openManage', tab: 'context' })}>{S.plan.viewInView}</button>
      </header>
      {entries.map((p, i) => (
        <div class="plan-row" key={i}>
          <span class={`status ${p.status}`} aria-hidden="true">{S.statusGlyph[p.status] ?? '○'}</span>
          <span>{p.content}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────── arquivos alterados ─────────── */

function WorkingSet() {
  const files = changed.value;
  const add = files.reduce((a, f) => a + f.added, 0);
  const rem = files.reduce((a, f) => a + f.removed, 0);
  return (
    <div class="section" aria-label={S.a11y.workingSet}>
      <header><span>{S.workingSet.title}</span><span class="muted">{S.workingSet.summary(files.length, add, rem)}</span></header>
      {files.map((f) => (
        <div class="ws-row" key={f.path}>
          <span class="badge-status">{f.status}</span>
          <span class="path" title={f.path}>{f.path}</span>
          <span class="muted">+{f.added} −{f.removed}</span>
          <span class="spacer" />
          <button class="secondary" onClick={() => send({ type: 'openDiff', path: f.path })}>{S.workingSet.diff}</button>
          <button class="secondary" onClick={() => send({ type: 'keepFile', path: f.path })}>{S.workingSet.keep}</button>
          <button class="secondary" onClick={() => send({ type: 'undoFile', path: f.path })}>{S.workingSet.undo}</button>
        </div>
      ))}
      <div class="row">
        <button class="secondary" onClick={() => files[0] && send({ type: 'undoFile', path: files[0].path })}>{S.workingSet.undoAll}</button>
      </div>
      <p class="hint">{S.workingSet.scopeNote}</p>
    </div>
  );
}

/* ─────────── transcript ─────────── */

export function Transcript() {
  const ref = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(RENDER_LIMIT);
  const all = turns.value;
  const shown = visibleTurns(all, limit);
  const offset = all.length - shown.length;

  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [all.length, tools.value.length]);

  const prevUserFor = (i: number): string | undefined => {
    for (let j = i - 1; j >= 0; j--) if (all[j].role === 'user') return all[j].text;
    return undefined;
  };

  const empty = all.length === 0 && tools.value.length === 0;

  return (
    <div class="transcript" ref={ref} role="log" aria-label={S.a11y.transcript} aria-live="polite">
      {empty && <Empty />}
      {offset > 0 && (
        <button class="secondary show-older"
          onClick={() => setLimit((n) => n + RENDER_LIMIT)}>
          <Icon kind="showOlder" label="" /> {num(offset)}
        </button>
      )}
      {shown.map((t, k) => (
        <TurnView key={t.id} turn={t} prevUser={t.role === 'agent' ? prevUserFor(offset + k) : undefined} />
      ))}
      {tools.value.map((tool) => <ToolItem key={tool.id} tool={tool} />)}
      {plan.value.length > 0 && <Plan entries={plan.value} />}
      {changed.value.length > 0 && <WorkingSet />}
    </div>
  );
}

/* ─────────── estado vazio ─────────── */

function Empty() {
  return (
    <div class="empty">
      <p>{S.empty.greeting}</p>
      <ul>
        {S.empty.actions.map(([label, text]) => (
          <li key={label}>
            <button class="secondary" onClick={() => send({ type: 'prompt', text, chips: chips.value, action: 'send' })}>
              {label}
            </button>
          </li>
        ))}
      </ul>
      <button class="secondary" onClick={() => send({ type: 'openManage' })}>{S.empty.manage}</button>
    </div>
  );
}
