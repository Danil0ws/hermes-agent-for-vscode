/**
 * Composer: chips de contexto, fila, campo de texto (auto-resize, histórico, popovers `/` e `#`),
 * barra inferior (+, Modo, Modelo, Ferramentas, medidor, Enviar ▾) e a barra de aprovação inline.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { send } from '../shared/bridge';
import { S, num } from './i18n';
import { breakdown, filterCommands, historyNavigate, moveDeltas, replaceToken, triggerToken } from './logic';
import type { TriggerToken } from './logic';
import {
  chips, commands, draft, focusComposer, models, modes, permission, queue, state, tools,
  turns, usage, userHistory,
} from './store';
import type { ContextChip, QueueItem } from '../../src/core/types';
import { Icon } from '../shared/icon';

/** Fontes de contexto do popover `#` — as mesmas do QuickPick do host (§4.2). */
const HASH_SOURCES = ['file', 'folder', 'symbol', 'selection', 'diagnostic', 'terminal', 'git', 'url', 'image'] as const;

function glyph(kind: string): string { return S.icon[kind] ?? S.icon.other; }

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
  const [open, setOpen] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const u = usage.value;
  const b = breakdown({
    used: u?.used, size: u?.size, chips: chips.value, historyChars: historyChars(),
    thoughtTokens: u?.turn?.thoughtTokens,
  });
  const level = b.pct === null ? 'ok' : b.pct > 90 ? 'critical' : b.pct >= 70 ? 'warn' : 'ok';
  const show = open || focusWithin;
  const t = u?.turn;
  const segTotal = b.used > 0 ? b.used : b.attributed + b.unassigned;

  return (
    <div class="meter-wrap"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocusIn={() => setFocusWithin(true)} onFocusOut={() => setFocusWithin(false)}>
      <button class={`meter ${level}`} aria-label={S.meter.label} aria-expanded={show}
        aria-haspopup="dialog"
        title={b.pct === null ? S.meter.noWindow : S.meter.reported(num(b.used), num(b.size), String(b.pct))}
        onClick={() => setOpen((v) => !v)}>
        <span class="ring" aria-hidden="true" />
        <span class="meter-pct">{b.pct === null ? '—' : `${b.pct}%`}</span>
        <span class="sr-only" role="meter" aria-valuenow={b.pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
          {b.pct === null ? S.meter.noWindow : `${b.used} / ${b.size}`}
        </span>
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
              onClick={() => send({ type: 'openManage', tab: 'context' })}>{S.meter.details}</button>
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
      send({ type: 'openManage', tab: 'context' });
    }
  };
  return (
    <div class="chips" role="list" aria-label={S.a11y.context}>
      {list.map((c) => (
        <span class={`chip ${c.implicit ? 'implicit' : ''}`} role="listitem" key={c.id} title={chipTip(c)}>
          <button class="chip-main" onClick={() => activate(c)}
            aria-label={c.implicit ? S.composer.toggleChip(c.label) : c.label}>
            <ChipIcon kind={c.kind} />
            <span class="chip-label">{c.label}</span>
            <span class="chip-tok">{S.composer.chipTokens(num(c.tokensEstimate))}</span>
          </button>
          <button class="chip-x" aria-label={S.composer.removeChip(c.label)} title={S.composer.removeChip(c.label)}
            onClick={() => send({ type: 'removeChip', id: c.id })}>×</button>
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

/* ─────────── menu de envio ─────────── */

function SendButton({ onSubmit }: { onSubmit: (a: 'send' | 'queue' | 'steer' | 'interrupt') => void }) {
  const busy = state.value.busy;
  const starting = state.value.starting;
  const started = state.value.sessionId !== null;
  const qEnabled = state.value.queueEnabled;
  const [open, setOpen] = useState(false);
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

  // Sem sessão o botão primário é "Iniciar": é esse clique que faz o handshake ANUNCIAR modos,
  // modelos e comandos. Antes dele os dois seletores ficam vazios ("sem modos"/"sem modelos"), que
  // é o que fazia o painel parecer carregado pela metade. Depois de iniciada, volta a ser Enviar.
  if (!started) {
    return (
      <span class="send">
        <button class="primary" disabled={starting} title={S.composer.startTip}
          onClick={() => send({ type: 'start' })}>
          <Icon name={starting ? 'loading' : 'play'} spin={starting} cls="btn-ic" />
          {starting ? S.composer.starting : S.composer.start}
        </button>
      </span>
    );
  }

  return (
    <span class="send">
      <button class="primary" title={busy ? S.send.stopTip : S.send.sendTip}
        onClick={() => (busy ? send({ type: 'cancel' }) : onSubmit('send'))}>
        {busy ? `■ ${S.send.stop}` : S.send.send}
      </button>
      {qEnabled && (
        <div class="send-menu-wrap">
          <button class="primary caret" aria-haspopup="menu" aria-expanded={open}
            aria-label={S.send.menuLabel} onClick={() => setOpen((v) => !v)}>▾</button>
          {open && (
            <div class="popover menu" role="menu" aria-label={S.send.menuLabel} ref={menuRef} onKeyDown={onKey}>
              {items.map((a) => (
                <button key={a} class="opt" role="menuitem"
                  onClick={() => { setOpen(false); onSubmit(a); }}>{label(a)}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/* ─────────── composer ─────────── */

export function Composer() {
  const box = useRef<HTMLTextAreaElement>(null);
  const busy = state.value.busy;
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

  // foco pedido de fora (editar/reenviar)
  useEffect(() => { box.current?.focus(); }, [focusComposer.value]);

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
      draft.value = next; setMenu(null);
      queueMicrotask(() => { el?.focus(); el?.setSelectionRange(next.length, next.length); });
    } else {
      const source = it.key;
      const next = replaceToken(txt, menu.tok, '');
      draft.value = next; setMenu(null);
      send({ type: 'addContext', source });
      queueMicrotask(() => { el?.focus(); el?.setSelectionRange(next.length, next.length); });
    }
  };

  const submit = (action: 'send' | 'queue' | 'steer' | 'interrupt') => {
    const text = draft.value;
    if (!text.trim() && chips.value.length === 0) return;
    if (text.trim()) userHistory.value = [...userHistory.value, text].slice(-100);
    draft.value = '';
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

  const placeholder = busy ? S.composer.placeholderBusy
    : chips.value.length > 0 ? S.composer.placeholderChips(chips.value.length)
      : S.composer.placeholderIdle;

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
          placeholder={placeholder}
          aria-label={S.composer.inputLabel}
          role={menu ? 'combobox' : undefined}
          aria-expanded={menu ? true : undefined}
          aria-controls={menu ? 'composer-pop' : undefined}
          aria-activedescendant={menu ? `composer-pop-${active}` : undefined}
          aria-autocomplete={menu ? 'list' : undefined}
          onInput={(e) => { const el = e.target as HTMLTextAreaElement; draft.value = el.value; syncMenu(el.value, el.selectionStart); }}
          onClick={(e) => { const el = e.target as HTMLTextAreaElement; syncMenu(el.value, el.selectionStart); }}
          onKeyDown={onKey}
        />
        {menu && (
          <Listbox id="composer-pop" label={menu.tok.type === 'slash' ? S.slash.title : S.hash.title}
            items={menu.items} active={active} onPick={pick} />
        )}
      </div>
      {/* Duas METADES: os controles de contexto (linha própria, que encolhe) e as ações (medidor +
          primário, alinhadas à direita). A quebra acontece entre os grupos, nunca entre os botões:
          em painel estreito os selects ganham uma linha inteira em vez de colapsarem a ~30px, e o
          primário continua no mesmo canto. */}
      <div class="toolbar">
        <div class="toolbar-line">
          <button class="icon-btn" title={S.composer.addContextTip} aria-label={S.composer.addContext}
            onClick={() => send({ type: 'addContext' })}>+</button>
          <label class="sel">
            <span class="sr-only">{S.composer.mode}</span>
            <select title={S.composer.modeTip} aria-label={S.composer.mode}
              value={state.value.currentMode ?? ''}
              onChange={(e) => send({ type: 'setMode', modeId: (e.target as HTMLSelectElement).value })}>
              {modes.value.length === 0 && <option value="">{state.value.starting ? S.composer.loading : S.composer.noModes}</option>}
              {modes.value.map((m) => <option key={m.id} value={m.id} title={m.description}>{m.name}</option>)}
            </select>
          </label>
          <label class="sel sel-model">
            <span class="sr-only">{S.composer.model}</span>
            <select title={S.composer.modelTip} aria-label={S.composer.model}
              value={state.value.currentModel ?? ''}
              onChange={(e) => send({ type: 'setModel', modelId: (e.target as HTMLSelectElement).value })}>
              {models.value.length === 0 && <option value="">{state.value.starting ? S.composer.loading : S.composer.noModels}</option>}
              {models.value.map((m) => <option key={m.modelId} value={m.modelId} title={m.description}>{m.name}</option>)}
            </select>
          </label>
          <button class="icon-btn" title={S.composer.toolsTip} aria-label={S.composer.tools}
            onClick={() => send({ type: 'openManage', tab: 'tools' })}><Icon name="gear" /></button>
        </div>
        <div class="toolbar-actions">
          <Meter />
          <SendButton onSubmit={submit} />
        </div>
      </div>
    </div>
  );
}
