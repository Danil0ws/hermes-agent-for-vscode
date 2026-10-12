/**
 * Composer: chips de contexto, fila, campo de texto (auto-resize, histórico, popovers `/` e `#`) com o
 * enviar/fila DENTRO dele, barra inferior (+, Modo, Modelo, medidor) e a barra de aprovação inline.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { send } from '../shared/bridge';
import { S, num } from './i18n';
import { breakdown, filterCommands, historyNavigate, moveDeltas, replaceToken, triggerToken } from './logic';
import type { TriggerToken } from './logic';
import {
  caret, chips, commands, draft, focusComposer, models, modes, notice, openPopover, permission,
  queue, state, tools, turns, usage, userHistory,
} from './store';
import type { ContextChip, QueueItem } from '../../src/core/types';
import { Icon } from '../shared/icon';

/** Fontes de contexto do popover `#` — as mesmas do QuickPick do host (§4.2). */
const HASH_SOURCES = ['file', 'folder', 'symbol', 'selection', 'diagnostic', 'terminal', 'git', 'url', 'image'] as const;

function glyph(kind: string): string { return S.icon[kind] ?? S.icon.other; }

/** Nome legível do modo atual (o id é o que circula; o rótulo é o que o agente anunciou). */
function modeName(current?: string): string {
  return modes.value.find((m) => m.id === current)?.name ?? '';
}

function ChipIcon({ kind }: { kind: string }) {
  return <Icon name={glyph(kind)} cls="ic" />;
}

/* ─────────── aprovação inline (§5.3) ─────────── */

function Permission() {
  const req = permission.value;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!req?.expiresAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [req?.id, req?.expiresAt]);
  if (!req) return null;
  const remaining = req.expiresAt ? Math.max(0, Math.round((req.expiresAt - Date.now()) / 1000)) : null;
  const firstAllow = req.options.find((o) => !o.kind.startsWith('reject'))?.optionId;
  return (
    <div class="permission" role="alertdialog" aria-label={req.title || S.permission.label}>
      <strong>{req.title || S.permission.label}</strong>
      {req.detail && <pre class="detail">{req.detail}</pre>}
      {req.cwd && <div class="muted">{S.permission.cwdPrefix} {req.cwd}</div>}
      {remaining !== null && <div class="muted">{S.permission.remaining(remaining)}</div>}
      {/* As opções são EXATAMENTE as que o agente mandou — nada inventado. O que a UI decide é
          o PESO: a primeira opção de permissão (allow_once) é a primária; conceder mais amplo
          (sessão/sempre) e negar ficam secundárias. Tornar `allow_always` o botão azul mais
          chamativo empurraria o usuário para a concessão permanente sem ele perceber. */}
      <div class="row">
        {req.options.map((o) => (
          <button
            key={o.optionId}
            class={o.optionId === firstAllow ? '' : 'secondary'}
            title={S.permissionHint[o.kind] ?? undefined}
            onClick={() => send({ type: 'permission/answer', id: req.id, optionId: o.optionId })}
          >
            {o.name}
          </button>
        ))}
      </div>
      {req.options.some((o) => o.kind === 'allow_always') && (
        <div class="muted">{S.allowAlwaysNote}</div>
      )}
    </div>
  );
}

/* ─────────── medidor de contexto (§5.2) ─────────── */

function historyChars(): number {
  let n = 0;
  for (const t of turns.value) n += t.text.length + (t.thought?.length ?? 0);
  for (const tl of tools.value) n += (tl.input?.length ?? 0) + (tl.output?.length ?? 0);
  return n;
}

function Meter() {
  const [focusWithin, setFocusWithin] = useState(false);
  const u = usage.value;
  const b = breakdown({
    used: u?.used, size: u?.size, chips: chips.value, historyChars: historyChars(),
    thoughtTokens: u?.turn?.thoughtTokens,
  });
  const level = b.pct === null ? 'ok' : b.pct > 90 ? 'critical' : b.pct >= 70 ? 'warn' : 'ok';
  const show = openPopover.value === 'meter' || focusWithin;
  const closeMeter = () => { if (openPopover.value === 'meter') openPopover.value = null; };
  const t = u?.turn;
  const segTotal = b.used > 0 ? b.used : b.attributed + b.unassigned;

  return (
    <div class="meter-wrap"
      onMouseEnter={() => { openPopover.value = 'meter'; }} onMouseLeave={closeMeter}
      onFocusIn={() => setFocusWithin(true)} onFocusOut={() => setFocusWithin(false)}>
      <button class={`meter ${level}`} aria-label={b.pct === null ? S.meter.noWindow : S.meter.label}
        aria-expanded={show} aria-haspopup="dialog"
        title={b.pct === null ? S.meter.noWindow : S.meter.reported(num(b.used), num(b.size), String(b.pct))}
        onClick={() => { openPopover.value = show ? null : 'meter'; }}>
        <span class="ring" aria-hidden="true" />
        <span class="meter-pct">{b.pct === null ? '—' : `${b.pct}%`}</span>
        {/* Sem usage reportado o corpo é SÓ o placeholder ('—'): o texto longo fica no `title` e no
            `aria-label`. Antes ele ia num `.sr-only` DENTRO do botão de ~39px — que no harness do
            usuário vazou como texto picado ("—O agente ainda não…"). O valor usado/janela continua
            no `.sr-only` quando há janela (aí o `role=meter` tem o que anunciar). */}
        {b.pct !== null && (
          <span class="sr-only" role="meter" aria-valuenow={b.pct} aria-valuemin={0} aria-valuemax={100}>
            {`${b.used} / ${b.size}`}
          </span>
        )}
      </button>

      {show && (
        <div class="popover meter-pop" role="dialog" aria-label={S.meter.popoverTitle}>
          <div class="pop-head">
            <strong>{S.meter.popoverTitle}</strong>
            <span class="spacer" />
            <span class="muted">{S.meter.fromAgent}</span>
          </div>
          {b.pct === null ? (
            <p class="hint">{S.meter.noWindow}</p>
          ) : (
            <p>{S.meter.usedOf(num(b.used), num(b.size), String(b.pct))}</p>
          )}

          {segTotal > 0 && (
            <div class="segbar" aria-hidden="true">
              {b.rows.filter((r) => (r.tokens ?? 0) > 0).map((r) => (
                <span key={r.id} class={`seg cat-${r.id}`} style={{ flexGrow: r.tokens ?? 0 }} />
              ))}
            </div>
          )}

          <dl class="cats">
            {b.rows.map((r) => (
              <div class="cat" key={r.id}>
                <dt>{S.meter.categories[r.id]}</dt>
                <dd>
                  {r.tokens === null
                    ? <span class="muted" title={S.meter.notAvailableTip}>{S.meter.notAvailable}</span>
                    : <span>{num(r.tokens)} <span class="seal">{r.measured ? S.meter.measured : S.meter.estimated}</span></span>}
                </dd>
              </div>
            ))}
          </dl>

          {t && (
            <p class="muted last-turn">
              {S.meter.lastTurn}: {S.meter.lastTurnLine(num(t.inputTokens ?? 0), num(t.outputTokens ?? 0), num(t.thoughtTokens ?? 0), num(t.cachedReadTokens ?? 0))}
            </p>
          )}
          <p class="muted">{S.meter.costUnknown}</p>

          <div class="row">
            <button class="secondary" disabled={state.value.busy}
              title={state.value.busy ? S.meter.compactBusyTip : S.meter.compactTip}
              onClick={() => send({ type: 'compact' })}>{S.meter.compact}</button>
            <button class="secondary" title={S.meter.newWithSummaryTip}
              onClick={() => send({ type: 'newConversation' })}>{S.meter.newWithSummary}</button>
            <button class="secondary" title={S.meter.detailsTip}
              onClick={() => send({ type: 'openManage', manageTab: 'context' })}>{S.meter.details}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── chips ─────────── */

function chipTip(c: ContextChip): string {
  const what = c.lines ? `linhas ${c.lines[0]}–${c.lines[1]}` : c.kind === 'skill' ? c.label : 'arquivo inteiro';
  return `${c.ref} — ${what} · ~${num(c.tokensEstimate)} tokens (${S.meter.estimated}) · ${S.composer.chipTooltipSent}`;
}

function Chips() {
  const list = chips.value;
  if (list.length === 0) return null;
  const activate = (c: ContextChip) => {
    if (c.implicit) { send({ type: 'removeChip', id: c.id }); return; }
    if (c.kind === 'file' || c.kind === 'folder' || c.kind === 'selection' || c.kind === 'symbol') {
      send({ type: 'openFile', path: c.ref, line: c.lines?.[0] });
    } else {
      send({ type: 'openManage', manageTab: 'context' });
    }
  };
  return (
    <div class="chips" role="list" aria-label={S.a11y.context}>
      {list.map((c) => (
        <span class={`chip ${c.implicit ? 'implicit' : ''}`} role="listitem" key={c.id}
          title={c.truncated ? S.composer.chipTruncatedTip(c.ref) : chipTip(c)}>
          <button class="chip-main" onClick={() => activate(c)}
            aria-label={c.implicit ? S.composer.toggleChip(c.label) : c.label}>
            <ChipIcon kind={c.kind} />
            <span class="chip-label">{c.label}</span>
            {c.truncated && <span class="chip-trunc">{S.composer.chipTruncated}</span>}
            <span class="chip-tok">{S.composer.chipTokens(num(c.tokensEstimate))}</span>
          </button>
          {/* O `×` é um botão IRMÃO do `chip-main`: parar a propagação garante que o clique não
              alcance o `activate` do chip (abrir arquivo / alternar implícito). A remoção em si não
              mexe em estado local — quem manda na lista é o host (`{type:'chips'}`/`init`). */}
          <button class="chip-x" aria-label={S.composer.removeChip(c.label)} title={S.composer.removeChip(c.label)}
            onClick={(e) => { e.stopPropagation(); send({ type: 'removeChip', id: c.id }); }}>×</button>
        </span>
      ))}
    </div>
  );
}

/* ─────────── fila (§5.1) ─────────── */

function Queue() {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const items = queue.value;
  if (!state.value.queueEnabled || items.length === 0) return null;

  const finishDrop = (to: number) => {
    if (dragFrom === null) return;
    for (const d of moveDeltas(dragFrom, to)) send({ type: 'queue/move', id: items[dragFrom].id, delta: d < 0 ? -1 : 1 });
    setDragFrom(null);
    setDragOver(null);
  };

  const keyNav = (e: KeyboardEvent) => {
    if (!e.altKey) return;
    const target = (e.target as HTMLElement).closest('[data-qid]') as HTMLElement | null;
    if (!target) return;
    const id = target.dataset.qid!;
    if (e.key === 'ArrowUp') { e.preventDefault(); send({ type: 'queue/move', id, delta: -1 }); }
    if (e.key === 'ArrowDown') { e.preventDefault(); send({ type: 'queue/move', id, delta: 1 }); }
  };

  return (
    <div class="section queue" aria-label={S.a11y.queue} onKeyDown={keyNav}>
      <header>
        <span>{S.queue.title(items.length)}</span>
        <span class="spacer" />
        <button class="secondary" onClick={() => send({ type: 'queue/clear' })}>{S.queue.clear}</button>
      </header>
      {items.map((q: QueueItem, i: number) => (
        <div class={`queue-row ${dragOver === i ? 'drop-here' : ''}`} key={q.id} data-qid={q.id}
          draggable
          onDragStart={(e) => { setDragFrom(i); e.dataTransfer?.setData('application/x-hermes-queue', String(i)); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(e) => { if (dragFrom === null) return; e.preventDefault(); setDragOver(i); }}
          onDrop={(e) => { if (dragFrom === null) return; e.preventDefault(); finishDrop(i); }}
          onDragEnd={() => { setDragFrom(null); setDragOver(null); }}>
          <span class="drag-handle" aria-hidden="true" title={S.queue.drag}>⠿</span>
          <span class="queue-text">{q.text.length > 80 ? `${q.text.slice(0, 80)}…` : q.text}</span>
          <span class="spacer" />
          <span class="queue-actions">
            <button class="secondary" aria-label={S.queue.nowTip} title={S.queue.nowTip}
              onClick={() => send({ type: 'queue/sendNow', id: q.id })}>▶ {S.queue.now}</button>
            <button class="secondary" aria-label={S.queue.edit} title={S.queue.editTip}
              onClick={() => { draft.value = q.text; focusComposer.value++; send({ type: 'queue/remove', id: q.id }); }}><Icon name="edit" /></button>
            <button class="secondary" aria-label={S.queue.remove} title={S.queue.remove}
              onClick={() => send({ type: 'queue/remove', id: q.id })}>×</button>
            <span class="kb">
              <button class="secondary" aria-label={S.queue.up} tabindex={0}
                onClick={() => send({ type: 'queue/move', id: q.id, delta: -1 })}><Icon name="arrow-up" /></button>
              <button class="secondary" aria-label={S.queue.down}
                onClick={() => send({ type: 'queue/move', id: q.id, delta: 1 })}><Icon name="arrow-down" /></button>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────── popover genérico (listbox) ─────────── */

interface Item { key: string; primary: string; secondary?: string; hint?: string }

function Listbox({ id, label, items, active, onPick, listRef }: {
  id: string; label: string; items: Item[]; active: number;
  onPick: (i: number) => void; listRef?: (el: HTMLDivElement | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div class="popover listbox" id={id} role="listbox" aria-label={label} ref={listRef}>
      {items.map((it, i) => (
        <div key={it.key} id={`${id}-${i}`} role="option" aria-selected={i === active}
          class={`opt ${i === active ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(i)}>
          <span class="opt-primary">{it.primary}</span>
          {it.secondary && <span class="opt-secondary">{it.secondary}</span>}
          {it.hint && <span class="opt-hint">{it.hint}</span>}
        </div>
      ))}
    </div>
  );
}

/* ─────────── enviar/fila DENTRO do campo ─────────── */

/**
 * Botão-fantasma no canto inferior direito do `textarea` (sem fundo nem borda). O clique abre o
 * MESMO menu do envio (enviar / pôr na fila / dirigir / interromper) — nenhuma ação some; o Enter do
 * campo continua enviando direto. Sem fila habilitada o menu não faria sentido: o clique envia.
 */
function SendInline({ onSubmit }: { onSubmit: (a: 'send' | 'queue' | 'steer' | 'interrupt') => void }) {
  const busy = state.value.busy;
  const qEnabled = state.value.queueEnabled;
  // exclusivo do composer: abrir o menu do envio fecha o do medidor (os dois ancoram no canto direito)
  const open = openPopover.value === 'send';
  const setOpen = (v: boolean) => { openPopover.value = v ? 'send' : null; };
  const menuRef = useRef<HTMLDivElement>(null);

  const items: ('send' | 'queue' | 'steer' | 'interrupt')[] = busy
    ? ['interrupt', 'queue', 'steer']
    : ['send', 'queue', 'steer', 'interrupt'];
  const label = (a: string) => (S.send as Record<string, string>)[a];

  useEffect(() => {
    if (open) (menuRef.current?.querySelector('.opt') as HTMLElement | null)?.focus();
  }, [open]);

  const onKey = (e: KeyboardEvent) => {
    const opts = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('.opt') ?? []);
    const i = opts.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); opts[(i + 1) % opts.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); opts[(i - 1 + opts.length) % opts.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    // Enter/Espaço: o próprio <button> ativa — sem handler manual (evita duplo disparo).
  };

  if (!qEnabled) {
    return (
      <button class="input-send" title={busy ? S.send.stopTip : S.send.sendTip}
        aria-label={busy ? S.send.stop : S.send.send}
        onClick={() => (busy ? send({ type: 'cancel' }) : onSubmit('send'))}>➤</button>
    );
  }

  return (
    <>
      <button class="input-send" aria-haspopup="menu" aria-expanded={open}
        aria-label={S.send.menuLabel} title={S.send.menuLabel}
        onClick={() => setOpen(!open)}>➤</button>
      {open && (
        <div class="popover menu" role="menu" aria-label={S.send.menuLabel} ref={menuRef} onKeyDown={onKey}>
          {items.map((a) => (
            <button key={a} class="opt" role="menuitem"
              onClick={() => { setOpen(false); onSubmit(a); }}>{label(a)}</button>
          ))}
        </div>
      )}
    </>
  );
}

/* ─────────── controles de execução (parar / pausar / retomar) ─────────── */

/**
 * Grupo de controle do turno, ao lado do medidor.
 *
 *  - **Parar** (`⏹`, só durante um turno) = `session/cancel`: interrompe o que está rodando; o que
 *    estiver na fila continua lá e o próximo envio volta ao normal.
 *  - **Pausar/Retomar** (`⏸`/`▶`) = portão: pausar interrompe o turno E segura a fila (nada novo vai
 *    ao agente até retomar). O ACP não tem pausa — quem implementa o "segurar" é o host.
 */
function RunControls() {
  const busy = state.value.busy;
  const paused = state.value.paused;
  const label = paused ? S.run.resume : S.run.pause;
  return (
    <div class="run-controls" role="group" aria-label={S.run.label}>
      {busy && (
        <button class="icon-btn" title={S.run.stopTip} aria-label={S.run.stop}
          onClick={() => send({ type: 'cancel' })}><Icon name="debug-stop" /></button>
      )}
      <button class={`icon-btn ${paused ? 'paused' : ''}`} title={paused ? S.run.resumeTip : S.run.pauseTip}
        aria-label={label} onClick={() => send({ type: paused ? 'resume' : 'pause' })}>
        <Icon name={paused ? 'debug-continue' : 'debug-pause'} />
      </button>
    </div>
  );
}

/**
 * Troca de modo/modelo: o estado local recebe o valor ESCOLHIDO antes de o host confirmar.
 *
 * Otimista de propósito. O `select` é controlado por `state.currentMode`/`currentModel`, mas quem
 * escreve neles é a mensagem `modes`/`models` do host — e no modo isso demora de verdade, porque o
 * agente NÃO emite `current_mode_update` (só o nosso `HermesSession.setMode` emite, depois do
 * round-trip). Sem o valor otimista, qualquer re-render nessa janela devolvia o select ao valor
 * velho — o defeito relatado ("seleciono Accept Edits e volta para Default"). O host continua sendo
 * a fonte da verdade: ele emite de novo logo em seguida, com o valor real, e sobrepõe este.
 */
function setMode(modeId: string): void {
  state.value = { ...state.value, currentMode: modeId };
  send({ type: 'setMode', modeId });
}

function setModel(modelId: string): void {
  state.value = { ...state.value, currentModel: modelId };
  send({ type: 'setModel', modelId });
}

/* ─────────── composer ─────────── */

export function Composer() {
  const box = useRef<HTMLTextAreaElement>(null);
  const busy = state.value.busy;
  const paused = state.value.paused;
  const started = state.value.sessionId !== null;
  const [menu, setMenu] = useState<{ tok: TriggerToken; items: Item[] } | null>(null);
  const [active, setActive] = useState(0);
  const [histIdx, setHistIdx] = useState(-1);
  const [dropActive, setDropActive] = useState(false);
  const txt = draft.value;

  // auto-resize
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [txt]);

  // foco pedido de fora (editar/reenviar) — e posiciona o caret quando veio de um `draft/insert`
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus();
    if (caret.value !== null) el.setSelectionRange(caret.value, caret.value);
  }, [focusComposer.value]);

  const syncMenu = (value: string, caret: number) => {
    const tok = triggerToken(value, caret);
    if (!tok) { setMenu(null); return; }
    if (tok.type === 'slash') {
      const items: Item[] = filterCommands(commands.value, tok.query).map((c) => ({
        key: c.name, primary: c.name, secondary: c.description, hint: c.hint,
      }));
      setMenu(items.length ? { tok, items } : null);
    } else {
      const q = tok.query.toLowerCase();
      const items: Item[] = HASH_SOURCES
        .filter((s) => !q || s.includes(q) || S.hash.sources[s].toLowerCase().includes(q))
        .map((s) => ({ key: s, primary: `#${s}`, secondary: S.hash.sources[s], hint: S.hash.sourceHint }));
      setMenu(items.length ? { tok, items } : null);
    }
    setActive(0);
  };

  const pick = (i: number) => {
    if (!menu) return;
    const el = box.current;
    const it = menu.items[i];
    if (!it) return;
    if (menu.tok.type === 'slash') {
      const next = replaceToken(txt, menu.tok, `${it.primary} `);
      draft.value = next; setMenu(null); caret.value = next.length;
      queueMicrotask(() => { el?.focus(); el?.setSelectionRange(next.length, next.length); });
    } else {
      const source = it.key;
      const next = replaceToken(txt, menu.tok, '');
      draft.value = next; setMenu(null); caret.value = next.length;
      send({ type: 'addContext', source });
      queueMicrotask(() => { el?.focus(); el?.setSelectionRange(next.length, next.length); });
    }
  };

  const submit = (action: 'send' | 'queue' | 'steer' | 'interrupt') => {
    const text = draft.value;
    if (!text.trim() && chips.value.length === 0) return;
    if (text.trim()) userHistory.value = [...userHistory.value, text].slice(-100);
    draft.value = '';
    caret.value = 0;
    setHistIdx(-1);
    setMenu(null);
    send({ type: 'prompt', text, chips: chips.value, action });
  };

  const onKey = (e: KeyboardEvent) => {
    if (menu) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % menu.items.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + menu.items.length) % menu.items.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(active); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMenu(null); return; }
    }
    if (e.key === 'Escape') { if (busy) { e.preventDefault(); send({ type: 'cancel' }); } return; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !txt.includes('\n') && userHistory.value.length > 0) {
      e.preventDefault();
      const nav = historyNavigate(userHistory.value, histIdx, e.key === 'ArrowUp' ? -1 : 1);
      setHistIdx(nav.idx);
      draft.value = nav.text;
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (busy) submit(state.value.queueEnabled ? state.value.queueDefaultAction : 'steer');
      else submit('send');
    }
  };

  const placeholder = !started ? S.composer.locked
    : paused ? S.composer.placeholderPaused
      : busy ? S.composer.placeholderBusy
        : chips.value.length > 0 ? S.composer.placeholderChips(chips.value.length)
          : S.composer.placeholderIdle;

  /**
   * Colar no campo. Três caminhos, nesta ordem:
   *   1. URI(s) `file://` (arquivo/pasta copiados do Finder) → um `addContext` por URI, o MESMO
   *      caminho do drag & drop (`onDrop`).
   *   2. imagem no clipboard (bitmap) → `attachImage` com base64 SEM o prefixo `data:`.
   *   3. texto normal → deixa colar (sem `preventDefault`).
   */
  const onPaste = (e: ClipboardEvent) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const raw = dt.getData('text/uri-list') || dt.getData('text/plain') || '';
    const uris = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('file://'));
    if (uris.length > 0) {
      e.preventDefault();
      for (const u of uris) send({ type: 'addContext', source: decodeURIComponent(u.replace(/^file:\/\//, '')) });
      return;
    }
    const image = Array.from(dt.files).find((f) => f.type.startsWith('image/'));
    if (image) {
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result ?? '').replace(/^data:[^,]*,/, '');
        if (data) send({ type: 'attachImage', name: image.name || 'colada.png', mime: image.type, data });
        else notice.value = { level: 'warning', text: S.composer.pasteImageFailed };
      };
      reader.onerror = () => { notice.value = { level: 'warning', text: S.composer.pasteImageFailed }; };
      reader.readAsDataURL(image);
      return;
    }
    // 3. texto normal: o paste segue sozinho (nada a fazer aqui)
  };

  const onDrop = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('application/x-hermes-queue')) return;
    e.preventDefault();
    setDropActive(false);
    const uri = e.dataTransfer?.getData('application/vnd.code.uri-list') || e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '';
    const first = uri.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#'));
    if (!first) return;
    const path = decodeURIComponent(first.trim().replace(/^file:\/\//, ''));
    // ponytail: variante dedicada `addPath` seria mais limpa; até lá o host recebe o caminho em `source`.
    send({ type: 'addContext', source: path });
  };

  return (
    <div class={`composer ${dropActive ? 'drop-active' : ''}`}
      onDragOver={(e) => { if (!e.dataTransfer?.types.includes('application/x-hermes-queue')) { e.preventDefault(); setDropActive(true); } }}
      onDragLeave={() => setDropActive(false)}
      onDrop={onDrop}>
      {dropActive && <div class="drop-hint" aria-hidden="true">{S.composer.dropHint}</div>}
      <Permission />
      <Queue />
      <Chips />
      <div class="input-wrap">
        <textarea
          ref={box}
          class="input"
          value={txt}
          rows={1}
          // SEM sessão o campo não aceita nada: o único caminho é o "Iniciar" do bloco central.
          disabled={!started}
          placeholder={placeholder}
          aria-label={S.composer.inputLabel}
          role={menu ? 'combobox' : undefined}
          aria-expanded={menu ? true : undefined}
          aria-controls={menu ? 'composer-pop' : undefined}
          aria-activedescendant={menu ? `composer-pop-${active}` : undefined}
          aria-autocomplete={menu ? 'list' : undefined}
          onInput={(e) => { const el = e.target as HTMLTextAreaElement; draft.value = el.value; caret.value = el.selectionStart; syncMenu(el.value, el.selectionStart); }}
          onClick={(e) => { const el = e.target as HTMLTextAreaElement; caret.value = el.selectionStart; syncMenu(el.value, el.selectionStart); }}
          onKeyUp={(e) => { caret.value = (e.target as HTMLTextAreaElement).selectionStart; }}
          onSelect={(e) => { caret.value = (e.target as HTMLTextAreaElement).selectionStart; }}
          // sem foco o `draft/insert` do host vai para o FIM do rascunho (o caret vivo só existe focado)
          onBlur={() => { caret.value = null; }}
          onPaste={onPaste}
          onKeyDown={onKey}
        />
        {started && <SendInline onSubmit={submit} />}
        {menu && (
          <Listbox id="composer-pop" label={menu.tok.type === 'slash' ? S.slash.title : S.hash.title}
            items={menu.items} active={active} onPick={pick} />
        )}
      </div>
      {/* A toolbar inteira só existe COM sessão: sem sessão o painel não oferece interação nenhuma
          além do "Iniciar" do bloco central (o `+`, os selects e o medidor não têm o que fazer, e o
          primário duplicado confundia). Com sessão o enviar/fila vive dentro do campo. */}
      {started && (
        <div class="toolbar">
          <div class="toolbar-line">
            <button class="icon-btn" title={S.composer.addContextTip} aria-label={S.composer.addContext}
              onClick={() => send({ type: 'addContext' })}>+</button>
            <label class="sel">
              <span class="sr-only">{S.composer.mode}</span>
              {/* O `<select>` nativo trunca o rótulo ("Accept Edits" vira "Accept…" numa sidebar de
                  310px, "A…" em 220px — medido no harness). O nome do modo escolhido vai no `title`
                  para o valor não ficar ilegível: é o estado que o usuário pediu para manter. */}
              <select title={`${S.composer.modeTip}: ${modeName(state.value.currentMode)}`}
                aria-label={S.composer.mode}
                value={state.value.currentMode ?? ''}
                onChange={(e) => setMode((e.target as HTMLSelectElement).value)}>
                {modes.value.length === 0 && <option value="">{state.value.starting ? S.composer.loading : S.composer.noModes}</option>}
                {modes.value.map((m) => <option key={m.id} value={m.id} title={m.description}>{m.name}</option>)}
              </select>
            </label>
            <label class="sel sel-model">
              <span class="sr-only">{S.composer.model}</span>
              <select title={`${S.composer.modelTip}: ${models.value.find((m) => m.modelId === state.value.currentModel)?.name ?? ''}`}
                aria-label={S.composer.model}
                value={state.value.currentModel ?? ''}
                onChange={(e) => setModel((e.target as HTMLSelectElement).value)}>
                {models.value.length === 0 && <option value="">{state.value.starting ? S.composer.loading : S.composer.noModels}</option>}
                {models.value.map((m) => <option key={m.modelId} value={m.modelId} title={m.description}>{m.name}</option>)}
              </select>
            </label>
          </div>
          <div class="toolbar-actions">
            <RunControls />
            <Meter />
          </div>
        </div>
      )}
    </div>
  );
}
