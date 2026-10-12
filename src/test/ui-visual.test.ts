/**
 * Guardas VISUAIS da apresentação do transcript (lane 3): menos bordas, UMA animação por vez, barra
 * de execução no rodapé e tools sob o turno. Lê os arquivos com `readFileSync` — sem DOM, sem runtime
 * do `vscode` (mesmo padrão de `transcript.test.ts`/`composer.test.ts`).
 *
 * Rodar isolado:
 *   npx esbuild src/test/ui-visual.test.ts --bundle --format=esm --platform=node \
 *     --external:vscode --outfile=/tmp/lane3.test.mjs && node --test /tmp/lane3.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

const css = read('webview/chat/styles.css');
const transcript = read('webview/chat/transcript.tsx');
const runbar = read('webview/chat/runbar.tsx');

/** Bloco `sel { … }` de uma regra simples (não casa `.tool > summary`, `.bubble.user`, etc.). */
function rule(sel: string): string {
  const esc = sel.replace(/\./g, '\\.');
  const m = css.match(new RegExp('(?:^|[\\s,}])' + esc + '\\s*\\{[^}]*\\}'));
  assert.ok(m, `regra ${sel} não encontrada em styles.css`);
  return m[0];
}

/* ─────────── (a) sem borda de caixa ─────────── */

test('ui-visual: .bubble/.tool/.section sem borda de caixa nem canto arredondado', () => {
  for (const sel of ['.bubble', '.tool', '.section']) {
    const r = rule(sel);
    assert.doesNotMatch(r, /\bborder\s*:/, `${sel} ainda tem borda de caixa (borda fica só em entrada + aprovação)`);
    assert.doesNotMatch(r, /border-radius\s*:/, `${sel} ainda tem canto arredondado`);
  }
});

/* ─────────── (b) uma animação por vez ─────────── */

test('ui-visual: o transcript não anima nada e a barra é a única animação', () => {
  assert.doesNotMatch(transcript, /spin/, 'transcript.tsx ainda gira um ícone — a barra é a única animação');
  const n = (runbar.match(/spin/g) ?? []).length;
  assert.equal(n, 1, `runbar.tsx deve ter EXATAMENTE um uso de spin (achei ${n})`);
});

/* ─────────── (c) a barra fica no rodapé, fora da rolagem ─────────── */

test('ui-visual: .runbar declarada com flex: 0 0 auto (fora da rolagem do transcript)', () => {
  assert.match(rule('.runbar'), /flex:\s*0 0 auto/, 'a barra precisa de flex: 0 0 auto');
});

/* ─────────── (d) chaves novas da barra nos 4 bundles ─────────── */

function runbarBlock(src: string, file: string): string {
  const i = src.indexOf('runbar:');
  assert.ok(i > -1, `${file}: bloco runbar ausente`);
  const j = src.indexOf('},', i);
  assert.ok(j > i, `${file}: bloco runbar sem fechamento`);
  return src.slice(i, j);
}

test('ui-visual: as chaves da barra existem nos 4 bundles de idioma', () => {
  const keys = ['a11y', 'thinking', 'writing', 'working', 'paused', 'waitingApproval', 'multiple', 'slow', 'elapsed'];
  for (const file of ['i18n.pt-br.ts', 'i18n.en.ts', 'i18n.ru.ts', 'i18n.zh-cn.ts']) {
    const block = runbarBlock(read('webview/chat/' + file), file);
    for (const k of keys) {
      assert.match(block, new RegExp('\\b' + k + '\\s*:'), `${file}: runbar.${k} faltando`);
    }
  }
});

/* ─────────── (e) a barra não tem botão ─────────── */

test('ui-visual: a barra de execução não tem botões (parar/pausar só no composer)', () => {
  assert.doesNotMatch(runbar, /<button/, 'a barra não pode ter botão — dois caminhos para a mesma ação já foram defeito');
});

/* ─────────── (4) tools sob o turno ─────────── */

test('ui-visual: tools ficam sob o turno (toolsOfTurn), sem bloco no fim da conversa', () => {
  assert.match(transcript, /toolsOfTurn\(/, 'o transcript precisa vincular cada tool ao turno dela');
  assert.doesNotMatch(transcript, /tools\.value\.map\(\(tool/, 'sobrou o bloco de tools depois de todos os turnos');
});
