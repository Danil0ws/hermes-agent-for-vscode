/**
 * Testes da webview do chat (Marco B): lógica pura e strings — sem DOM.
 * Rodar isolado:
 *   npx esbuild src/test/webview.test.ts --bundle --format=esm --platform=node \
 *     --external:vscode --outfile=/tmp/wv.test.mjs && node --test /tmp/wv.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  breakdown, coerceTurns, estimateTokens, filterCommands, historyNavigate,
  meterLevel, moveDeltas, percent, replaceToken, splitFenced, triggerToken, visibleTurns,
} from '../../webview/chat/logic.ts';
import { S, num } from '../../webview/chat/i18n.ts';
import { setCurrentLocale, setLocale } from '../../webview/shared/l10n.ts';
import type { ContextChip } from '../core/types.ts';

/* ─────────── tokens / limiares ─────────── */

test('tokens: chars/4 e limiares do medidor (70/90)', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('a'.repeat(400)), 100);
  assert.equal(percent(68, 200), 34);
  assert.equal(percent(1, 0), 0);
  assert.equal(meterLevel(100, 1000), 'ok');
  assert.equal(meterLevel(699, 1000), 'ok');
  assert.equal(meterLevel(700, 1000), 'warn');
  assert.equal(meterLevel(900, 1000), 'warn');
  assert.equal(meterLevel(901, 1000), 'critical');
  assert.equal(meterLevel(5, 0), 'ok', 'sem janela reportada nunca alarma');
});

/* ─────────── detalhamento por categoria ─────────── */

const chip = (kind: ContextChip['kind'], tokensEstimate: number): ContextChip =>
  ({ id: `${kind}-1`, kind, label: kind, ref: kind, tokensEstimate });

test('medidor: categorias, selo estimado/medido e "não atribuído"', () => {
  const b = breakdown({
    used: 1000, size: 2000,
    chips: [chip('file', 100), chip('skill', 200)],
    historyChars: 400,      // -> 100 tokens
    thoughtTokens: 50,
  });
  assert.equal(b.pct, 50);
  const by = Object.fromEntries(b.rows.map((r) => [r.id, r.tokens]));
  assert.equal(by.skills, 200);
  assert.equal(by.files, 100);
  assert.equal(by.history, 100);
  assert.equal(by.reasoning, 50, 'raciocínio vem do usage (medido)');
  assert.equal(by.unassigned, 550, 'sobra = used - atribuído');
  assert.equal(b.rows.find((r) => r.id === 'instructions')!.tokens, null, 'não disponível na webview');
  assert.equal(b.rows.find((r) => r.id === 'tools')!.tokens, null);
  assert.equal(b.rows.find((r) => r.id === 'reasoning')!.measured, true);
  assert.equal(b.rows.find((r) => r.id === 'files')!.measured, false);
});

test('medidor: soma maior que o usado nunca gera "não atribuído" negativo', () => {
  const b = breakdown({ used: 10, size: 0, chips: [chip('file', 500)], historyChars: 400 });
  assert.equal(b.pct, null, 'sem janela, sem percentual');
  assert.equal(b.unassigned, 0);
});

/* ─────────── virtualização ─────────── */

test('virtualização: janela retém os últimos N e devolve tudo quando cabe', () => {
  const all = Array.from({ length: 1000 }, (_, i) => i);
  assert.equal(visibleTurns(all, 2000).length, 1000);
  const win = visibleTurns(all, 200);
  assert.equal(win.length, 200);
  assert.equal(win[0], 800);
  assert.equal(win.at(-1), 999);
  assert.equal(visibleTurns([] as number[], 10).length, 0);
});

/* ─────────── markdown mínimo (cercas) ─────────── */

test('splitFenced: texto e blocos de código, cerca aberta não quebra', () => {
  const segs = splitFenced('oi\n```ts\nconst a = 1;\n```\ntchau');
  assert.deepEqual(segs.map((s) => s.type), ['text', 'code', 'text']);
  assert.equal(segs[1].type === 'code' && segs[1].lang, 'ts');
  assert.equal(segs[1].type === 'code' && segs[1].code, 'const a = 1;');
  const open = splitFenced('a\n```js\nx');
  assert.equal(open.length, 2);
  assert.equal(open[1].type, 'code');
});

/* ─────────── popovers `/` e `#` ─────────── */

test('triggerToken: detecta / e # sob o cursor, ignora no meio de palavra', () => {
  assert.deepEqual(triggerToken('oi /mo', 6), { type: 'slash', query: 'mo', start: 3 });
  assert.deepEqual(triggerToken('#arq', 4), { type: 'hash', query: 'arq', start: 0 });
  assert.equal(triggerToken('email a@b', 8), null);
  assert.equal(triggerToken('nada aqui', 9), null);
});

test('filterCommands e replaceToken: filtro e substituição do token', () => {
  const cmds = [{ name: '/model', description: '' }, { name: '/context', description: '' }];
  assert.equal(filterCommands(cmds, 'mod').length, 1);
  assert.equal(filterCommands(cmds, '').length, 2);
  const tok = triggerToken('veja /con agora', 9)!;
  assert.equal(replaceToken('veja /con agora', tok, '/context '), 'veja /context  agora');
});

/* ─────────── fila ─────────── */

test('moveDeltas: sequência ±1 para arrastar na fila', () => {
  assert.deepEqual(moveDeltas(0, 2), [1, 1]);
  assert.deepEqual(moveDeltas(3, 1), [-1, -1]);
  assert.deepEqual(moveDeltas(1, 1), []);
});

test('historyNavigate: ↑ desce no histórico, ↓ volta ao rascunho', () => {
  const h = ['um', 'dois', 'três'];
  assert.deepEqual(historyNavigate(h, -1, -1), { idx: 2, text: 'três' });
  assert.deepEqual(historyNavigate(h, 2, -1), { idx: 1, text: 'dois' });
  assert.deepEqual(historyNavigate(h, 1, 1), { idx: 2, text: 'três' });
  assert.deepEqual(historyNavigate(h, 2, 1), { idx: -1, text: '' });
  assert.deepEqual(historyNavigate([], -1, -1), { idx: -1, text: '' });
});

/* ─────────── reidratação ─────────── */

test('coerceTurns: só o que tem forma de turno sobrevive', () => {
  const out = coerceTurns([null, { text: 1 }, { text: 'oi', role: 'user', id: 'x', startedAt: 5 }] as unknown[]);
  assert.equal(out.length, 1);
  assert.equal(out[0].role, 'user');
  assert.equal(out[0].id, 'x');
});

/* ─────────── i18n ─────────── */

test('i18n: ícones de todas as variantes (kinds) e nenhum emoji', () => {
  const kinds = ['read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other'];
  const chipKinds = ['file', 'folder', 'symbol', 'selection', 'diagnostic', 'terminal', 'git', 'url', 'image', 'skill'];
  for (const k of [...kinds, ...chipKinds]) {
    assert.ok(S.icon[k], `ícone faltando para ${k}`);
    assert.ok(S.tool.kind[k] || chipKinds.includes(k), `rótulo faltando para ${k}`);
  }
  // sem emoji: nenhum glifo entra no bloco Emoji/Símbolos Suplementares (>= U+1F000)
  for (const g of Object.values(S.icon)) {
    assert.ok((g.codePointAt(0) ?? 0) < 0x1f000, `glifo suspeito de emoji: ${g}`);
  }
});

test('i18n: placeholder contextual troca por estado do composer', () => {
  setLocale('pt-br');   // o bundle segue o <html lang>; fora do navegador o padrão é 'en'
  assert.match(S.composer.placeholderIdle, /# para contexto/);
  assert.match(S.composer.placeholderBusy, /direção/);
  assert.equal(S.composer.placeholderChips(1), 'Pergunte sobre o item anexado');
  assert.match(S.composer.placeholderChips(3), /3 itens/);
});

test('num formata pelo idioma corrente (pt-BR usa ponto, en usa vírgula)', () => {
  // o idioma é detectado do `<html lang>` da webview; fora do navegador o padrão é en.
  // Cada caso fixa o idioma: nada aqui depende de qual teste rodou antes.
  setLocale('en');
  assert.equal(num(12400), '12,400');
  setLocale('pt-br');
  assert.equal(num(12400), '12.400');
  setCurrentLocale('zh-cn');
  assert.equal(num(12400), '12,400');
  setCurrentLocale('ru');
  assert.equal(num(12400), '12\u00a0400', 'ru usa espaço estreito como separador de milhar');
  setCurrentLocale('en');
});

test('i18n: rótulos reais de status e opções de aprovação vêm do agente', () => {
  for (const st of ['completed', 'failed', 'in_progress', 'pending', 'cancelled']) {
    assert.ok(S.statusGlyph[st], `glifo faltando para ${st}`);
    assert.ok(S.status[st], `rótulo faltando para ${st}`);
  }
});

/* ─────────── CSS: popovers e pickers dentro do painel ─────────── */

// caminho pelo cwd do runner (o bundle roda a partir da raiz do repo): `import.meta.url` aponta
// para dist-test/ e o `..` sai do projeto
const css = readFileSync(join(process.cwd(), 'webview', 'chat', 'styles.css'), 'utf8');
const rule = (sel: string): string => {
  const m = css.match(new RegExp('\\' + sel + '\\s*\\{[^}]*\\}'));
  assert.ok(m, `regra ${sel} não encontrada em styles.css`);
  return m[0];
};

test('css: popover se clampa ao PAINEL, não à viewport do webview', () => {
  const pop = rule('.popover');
  // o defeito real: min-width:240px + max-width:min(420px,90vw) fazia o menu do envio medir
  // 240px e começar em x=-149 numa sidebar de 310px — crescia para fora e era cortado.
  assert.match(pop, /max-width:\s*100%/, 'popover sem clamp percentual ao painel');
  assert.doesNotMatch(pop, /\dvw/, 'unidade de viewport no popover (resolve contra a janela do webview)');
  assert.match(pop.replace(/\s/g, ''), /min-width:min\(240px,100%\)/, 'min-width precisa de clamp');
});

test('css: menu de envio e popover do medidor não têm largura fixa em px', () => {
  for (const sel of ['.menu', '.meter-pop']) {
    assert.doesNotMatch(rule(sel), /(?:min-)?width:\s*\d+px/,
      `${sel} com largura fixa em px: volta a estourar em sidebar estreita`);
  }
});

test('css: os selects do composer truncam com reticências (indicador visível)', () => {
  assert.match(rule('.sel select'), /text-overflow:\s*ellipsis/);
});

test('css: a barra inferior quebra só ENTRE os grupos, e o primário fica à direita', () => {
  // o defeito medido: `flex-wrap: wrap` solto sobre os botões + `max-width: 42vw` no select. Rótulo
  // de modelo longo (ids reais: "OpenCode Go · deepseek-v4.1-flash") empurrava cada botão para outra
  // linha, e o Enviar aparecia num lugar diferente conforme o modelo escolhido.
  assert.match(rule('.toolbar'), /flex-wrap:\s*wrap/);
  assert.match(rule('.toolbar-line'), /flex:\s*1 1 auto/, 'grupo dos controles sem encolher');
  assert.match(rule('.toolbar-actions'), /justify-content:\s*flex-end/, 'ações fora do canto direito');
  assert.match(rule('.sel-model'), /flex:\s*2 1 0/, 'o select de modelo precisa de mais espaço que o de modo');
  assert.match(rule('.sel select'), /text-overflow:\s*ellipsis/);
  const piso = Number(rule('.sel').match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
  assert.ok(piso >= 60, `piso do select de modo pequeno demais (${piso}px): em sidebar estreita o rótulo some`);
  assert.doesNotMatch(css, /\dvw/, 'unidade de viewport no CSS do chat (resolve contra a janela, não contra o painel)');
  assert.match(rule('.bubble'), /font-family:\s*inherit/, 'prosa do balão fora da fonte da UI (vira bloco de código)');
});
