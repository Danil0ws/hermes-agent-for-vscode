/**
 * Transcript do chat: turnos, raciocínio, tool calls, plano, arquivos alterados e aprovação.
 * Virtualização à mão (janela de renderização) — o transcript do Hermes pode ter milhares de turnos.
 *
 * NENHUM ícone daqui anima: a ÚNICA animação do painel é a barra de execução (`runbar.tsx`). O
 * raciocínio e as linhas de tool usam glifos estáticos. Cada tool call fica SOB o turno em que
 * nasceu (`toolsOfTurn`) — antes eles se acumulavam num bloco depois de todos os turnos e uma
 * execução antiga parecia atividade nova.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { send } from '../shared/bridge';
import { S, num } from './i18n';
import { splitFenced, toolDetailOpen, visibleTurns } from './logic';
import { toolsOfTurn } from './items';
import { changed, chips, draft, focusComposer, plan, state, tools, turnEnd, turns } from './store';
import type { Turn } from './store';
import type { PlanEntry, ToolView } from '../../src/core/types';
import { Icon } from '../shared/icon';

/** Quantos turnos renderizamos de cada vez (a janela cresce sob demanda). */
const RENDER_LIMIT = 200;

const elapsed = (ms: number) => (ms / 1000).toFixed(1);

/** Ícone do tool call: traduz o `kind` do ACP para o nome do Codicon. */
function KindIcon({ kind, label }: { kind: string; label?: string }) {
  return <Icon name={S.icon[kind] ?? S.icon.other} label={label} cls="ic" />;
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
        {/* glifo ESTÁTICO: quem anima é a barra de execução, não o raciocínio */}
        <Icon name={turn.streaming ? 'circle-filled' : 'check'} />
        <span>{S.thought.summary}</span>
        <span class="muted">· {S.thought.elapsed(elapsed(ms))} · {st}</span>
      </summary>
      <pre>{turn.thought}</pre>
    </details>
  );
}

/* ─────────── tool call ─────────── */

function ToolItem({ tool, index, count }: { tool: ToolView; index: number; count: number }) {
  const kind = tool.kind || 'other';
  const label = S.tool.kind[kind] ?? S.tool.kind.other;
  const dur = tool.endedAt ? S.tool.duration(elapsed(tool.endedAt - tool.startedAt)) : null;
  // O ABERTO é do <details>, escrito por efeito — e não pelo atributo `open={...}`. Com `open`
  // controlado, cada re-render (chega um a cada chunk) desfazia a abertura manual do usuário num
  // item antigo. O `open` inicial só vale no mount; daí em diante quem manda é `shouldOpen`.
  const shouldOpen = toolDetailOpen(index, count, tool.status);
  const ref = useRef<HTMLDetailsElement>(null);
  const [mountedOpen] = useState(() => shouldOpen);
  useEffect(() => { const el = ref.current; if (el) el.open = shouldOpen; }, [shouldOpen]);
  return (
    <details class="tool" ref={ref} open={mountedOpen}>
      <summary aria-label={`${label}: ${tool.title} — ${S.status[tool.status] ?? tool.status}`}>
        <KindIcon kind={kind} label={label} />
        <span class="tool-title">{tool.title || S.tool.titleFallback}</span>
        <Icon name={S.statusGlyph[tool.status] ?? 'circle-outline'} cls={`status ${tool.status}`} />
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

function TurnView({ turn, prevUser, last }: { turn: Turn; prevUser?: string; last: boolean }) {
  const isUser = turn.role === 'user';
  const canDiff = changed.value.length > 0;
  // Tools SOB o turno em que nasceram; um tool sem dono cai no ÚLTIMO turno (some seria pior).
  const myTools = toolsOfTurn(tools.value, turn.id, last);
  return (
    <div class={`turn ${turn.role}`}>
      <div class="turn-role">{isUser ? S.role.user : (state.value.agent || S.role.agentFallback)}</div>
      {!isUser && turn.thought && state.value.showReasoning !== 'hidden' && <Thought turn={turn} />}
      {turn.text && <div class={`bubble ${turn.role}`}><Body text={turn.text} /></div>}
      {myTools.map((tool) => (
        <ToolItem key={tool.id} tool={tool} index={tools.value.indexOf(tool)} count={tools.value.length} />
      ))}
      {isUser && turn.chips && turn.chips.length > 0 && (
        <div class="chips static">{turn.chips.map((c) => (
          <span class="chip" key={c.id}><KindIcon kind={c.kind} label={c.kind} />{c.label}</span>
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
        <button class="secondary" onClick={() => send({ type: 'openManage', manageTab: 'context' })}>{S.plan.viewInView}</button>
      </header>
      {entries.map((p, i) => (
        <div class="plan-row" key={i}>
          <Icon name={S.statusGlyph[p.status] ?? 'circle-outline'} cls={`status ${p.status}`} />
          <span>{p.content}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────── arquivos alterados ─────────── */

/**
 * FECHADO por padrão. Antes esta lista era sempre aberta: com N arquivos, eram N linhas + 3 botões
 * cada + o aviso de escopo — a tela toda, e a conversa saía de vista. O `<summary>` já carrega o que
 * se precisa saber de relance (quantos arquivos, +linhas/−linhas); abrir é para quem vai agir.
 */
function WorkingSet() {
  const files = changed.value;
  const add = files.reduce((a, f) => a + f.added, 0);
  const rem = files.reduce((a, f) => a + f.removed, 0);
  return (
    <details class="section workingset">
      <summary>
        <span>{S.workingSet.title}</span>
        {/* O ` ` entre os spans é o separador do NOME acessível: em flex um nó de texto só com espaço
            não vira item (layout intacto), mas o `<summary>` deixa de anunciar "alterados2". */}
        {' '}
        <span class="muted">{S.workingSet.summary(files.length, add, rem)}</span>
      </summary>
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
    </details>
  );
}

/* ─────────── fim de turno ─────────── */

/** Uma linha dizendo que o turno acabou (o que o agente fez e o "pensando" pareciam a mesma coisa). */
function TurnEnd() {
  const end = turnEnd.value;
  if (!end || state.value.busy) return null;
  const ok = end.stopReason === 'end_turn';
  return (
    <p class={`turn-end ${ok ? 'ok' : 'warn'}`} role="status">
      <Icon name={ok ? 'check' : 'circle-slash'} cls="ic" />
      <span>{S.stop[end.stopReason] ?? S.stop.end_turn}</span>
    </p>
  );
}

/* ─────────── transcript ─────────── */

export function Transcript() {
  const ref = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(RENDER_LIMIT);
  const all = turns.value;
  const shown = visibleTurns(all, limit);
  const offset = all.length - shown.length;
  const lastId = all[all.length - 1]?.id;

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
          <KindIcon kind="showOlder" label="" /> {num(offset)}
        </button>
      )}
      {shown.map((t, k) => (
        <TurnView key={t.id} turn={t} last={t.id === lastId}
          prevUser={t.role === 'agent' ? prevUserFor(offset + k) : undefined} />
      ))}
      <TurnEnd />
      {plan.value.length > 0 && <Plan entries={plan.value} />}
      {changed.value.length > 0 && <WorkingSet />}
    </div>
  );
}

/* ─────────── estado vazio ─────────── */

function Empty() {
  // Enquanto o handshake do "Iniciar" corre, o estado vazio mostra o progresso em vez das
  // sugestões: clicar numa sugestão antes disso iniciaria a sessão por outro caminho.
  if (state.value.starting) {
    return (
      <div class="empty">
        <p class="starting"><Icon name="loading" spin cls="ic" /> {S.empty.starting}</p>
      </div>
    );
  }
  // SEM sessão: bloco centrado com título + descrição + primário. É o ÚNICO caminho de interação —
  // o resto do painel fica inerte (o composer sem toolbar e com o campo desabilitado), então as
  // sugestões não aparecem aqui: elas só existem depois de iniciar.
  if (state.value.sessionId === null) {
    return (
      <div class="empty start-block">
        <h2 class="start-title">{S.empty.startTitle}</h2>
        <p class="start-body">{S.empty.startBody}</p>
        <button class="primary" title={S.composer.startTip} onClick={() => send({ type: 'start' })}>
          <Icon name="play" cls="btn-ic" /> {S.composer.start}
        </button>
      </div>
    );
  }
  return (
    <div class="empty">
      <p>{S.empty.greeting}</p>
      <p class="hint">{S.empty.startHint}</p>
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
