/**
 * Testes de abas (uma conversa por aba): roteamento por `tab` do contrato HostToWebview.
 *
 * Rodar isolado:
 *   npx esbuild src/test/tabs.test.ts --bundle --format=esm --platform=node \
 *     --external:vscode --outfile=/tmp/tabs.test.mjs && node --test /tmp/tabs.test.mjs
 *
 * A guarda que importa: uma mensagem de aba em BACKGROUND (com `tab` selado ≠ ativa) não pode
 * aparecer na aba ativa. Sem o roteamento por `tab` (código errado) o teste FALHA.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyHost } from '../../webview/chat/router.ts';
import { state, turns, permission, usage } from '../../webview/chat/store.ts';
import { S } from '../../webview/chat/i18n.ts';
import type { TabInfo } from '../core/types.ts';

const tab = (id: string): TabInfo => ({
  id, title: id, sessionId: null, cwd: '/repo', agent: 'hermes', busy: false,
});

/** Aba ativa = `active`, com abas `tabs`. Ids únicos por teste (o mapa de snapshots é do módulo). */
function reset(active: string, ...ids: string[]): void {
  state.value = {
    ...state.value, tabs: ids.map(tab), activeTab: active,
    sessionId: null, agent: 'hermes', busy: false,
  };
  turns.value = [];
}

const texts = (): string[] => turns.value.map((t) => t.text);

test('abas: chaves de i18n das abas e do bloco Iniciar existem', () => {
  assert.ok(S.tabs.new && S.tabs.newTip && S.tabs.newWorktree && S.tabs.newWorktreeTip);
  assert.ok(S.tabs.close && S.tabs.closeTip && S.tabs.rename);
  assert.ok(S.tabs.noSession && S.tabs.busy && S.tabs.waiting);
  assert.equal(typeof S.tabs.laneTip, 'function');
  assert.ok(S.empty.startTitle && S.empty.startBody && S.empty.startHint && S.empty.starting);
  assert.ok(S.composer.start);
});

test('abas: mensagem com tab de FUNDO não aparece na aba ativa e fica no transcript dela', () => {
  reset('t1a', 't1a', 't1b');
  applyHost({ type: 'user/message', text: 'oi A', chips: [] });
  // chunk da aba B, que está em background
  applyHost({ type: 'agent/chunk', tab: 't1b', messageId: 'mB', text: 'resposta B' });

  assert.deepEqual(texts(), ['oi A'], 'a aba ativa não pode receber a mensagem de fundo');

  // ativar B mostra o transcript da B (acumulado em background)
  applyHost({ type: 'tabs', tabs: [tab('t1a'), tab('t1b')], active: 't1b' });
  assert.equal(state.value.activeTab, 't1b');
  assert.deepEqual(texts(), ['resposta B']);

  // e voltar para A preserva o transcript da A
  applyHost({ type: 'tabs', tabs: [tab('t1a'), tab('t1b')], active: 't1a' });
  assert.deepEqual(texts(), ['oi A']);
});

test('abas: `init` com activeTab diferente troca a aba e restaura o transcript', () => {
  reset('t2a', 't2a', 't2b');
  applyHost({ type: 'user/message', text: 'oi A', chips: [] });
  applyHost({ type: 'agent/chunk', tab: 't2b', messageId: 'mB', text: 'B' });

  applyHost({ type: 'init', state: { ...state.value, tabs: [tab('t2a'), tab('t2b')], activeTab: 't2b', sessionId: 'sess-b' } });
  assert.equal(state.value.activeTab, 't2b');
  assert.equal(state.value.sessionId, 'sess-b');
  assert.deepEqual(texts(), ['B']);
});

test('abas: aprovação (permission) é por aba — não vaza para a aba ativa', () => {
  reset('t4a', 't4a', 't4b');
  // aba B está ativa; a pergunta chega da aba A (fundo)
  state.value = { ...state.value, activeTab: 't4b' };
  applyHost({ type: 'permission/ask', tab: 't4a', req: { id: 'p1', title: 'x', options: [] } });
  const shown = permission.value;
  assert.equal(shown, null, 'a aprovação da aba de fundo não pode aparecer na ativa');

  applyHost({ type: 'tabs', tabs: [tab('t4a'), tab('t4b')], active: 't4a' });
  assert.equal(permission.value?.id, 'p1', 'ao ativar a aba A, a aprovação dela reaparece');
});

test('abas: com UMA aba, mensagens com e sem `tab` caem no mesmo transcript (não regride)', () => {
  reset('t3', 't3');
  applyHost({ type: 'user/message', text: 'um', chips: [] });
  applyHost({ type: 'agent/chunk', tab: 't3', messageId: 'm', text: 'dois' });
  applyHost({ type: 'agent/chunk', messageId: 'm', text: ' e três' });
  assert.deepEqual(turns.value.map((t) => t.text), ['um', 'dois e três']);
});

test('abas: o `init` do host aplica estado, abas e usage (é o primeiro estado que chega)', () => {
  reset('', 'i1');
  applyHost({
    type: 'init',
    state: {
      ...state.value, sessionId: 's9', tabs: [tab('i1'), tab('i2')], activeTab: 'i1',
      usage: { size: 100, used: 40 },
    },
  });
  assert.equal(state.value.sessionId, 's9', 'o init tem de aplicar o estado da aba ativa');
  assert.equal(state.value.activeTab, 'i1');
  assert.deepEqual(state.value.tabs.map((t) => t.id), ['i1', 'i2']);
  assert.equal(usage.value?.used, 40, 'o medidor vem no init — escrever dentro de batch() o perdia');
});

/**
 * Guarda de FONTE, não de comportamento: o `init` não pode voltar a escrever dentro de `batch()`.
 *
 * Medido no harness (bundle empacotado, navegador real): com `batch()` no `applyInit`, o `init` do
 * host era **inteiramente ignorado** — zero abas, `sessionId` nulo, medidor parado — e sem erro no
 * console. O teste de comportamento acima passa nos dois casos (no node o `batch` funciona), então
 * só esta guarda pega a regressão.
 */
test('abas: applyInit não pode escrever dentro de batch() (medido: no bundle as escritas se perdiam)', () => {
  const src = readFileSync(join(process.cwd(), 'webview', 'chat', 'router.ts'), 'utf8');
  const body = src.slice(src.indexOf('function applyInit'), src.indexOf('export function applyHost'));
  // fora de comentários: o motivo fica escrito no próprio código, e o comentário cita `batch()`
  const code = body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /\bbatch\s*\(/,
    'applyInit com batch(): no bundle o init inteiro se perde (medido no harness)');
});
