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

/**
 * UMA animação por vez, e ela é a barra — com UMA exceção: o bloco "Iniciar" do estado vazio gira
 * enquanto a barra está escondida (fases `starting`). A guarda é por REGIÃO, não pela string no
 * arquivo: proibir `spin` no arquivo inteiro empurrava a lane para uma `@keyframes` própria — que
 * anima no compositor e não pode ser verificada — só para satisfazer o grep. O que importa é que
 * nada dos TURNOS/tools anime.
 */
test('ui-visual: só o bloco "Iniciar" gira no transcript; turnos e tools não', () => {
  const i = transcript.indexOf('function Empty(');
  assert.ok(i > 0, 'não achei o bloco vazio (Empty) no transcript');
  const antes = transcript.slice(0, i);
  const depois = transcript.slice(i);
  assert.doesNotMatch(antes, /spin/, 'turno/raciocínio/tool girando — a barra é a única animação da conversa');
  assert.equal((depois.match(/spin/g) ?? []).length, 1, 'o bloco "Iniciar" precisa do próprio giro (padrão do Codicon)');
  const n = (runbar.match(/spin/g) ?? []).length;
  assert.equal(n, 1, `runbar.tsx deve ter EXATAMENTE um uso de spin (achei ${n})`);
});

/* ─────────── (c) a barra fica no rodapé, fora da rolagem ─────────── */

test('ui-visual: .runbar declarada com flex: 0 0 auto (fora da rolagem do transcript)', () => {
  assert.match(rule('.runbar'), /flex:\s*0 0 auto/, 'a barra precisa de flex: 0 0 auto');
});

/**
 * A barra é UMA linha em qualquer largura. Com `flex-wrap: wrap` no container, um título de
 * ferramenta longo empurrava o ícone e o tempo para outras linhas e a barra virava um bloco de 3
 * linhas (medido em 200px: 63px contra 23px) — e o texto ainda ficava cortado. O encolhimento tem de
 * acontecer DENTRO da linha: texto com `min-width: 0` + reticências.
 */
test('ui-visual: a barra é uma linha (sem flex-wrap) e o texto encolhe com reticências', () => {
  assert.doesNotMatch(rule('.runbar'), /flex-wrap/, 'com flex-wrap a barra vira 3 linhas em painel estreito');
  const text = rule('.runbar-text');
  assert.match(text, /min-width:\s*0/, 'sem min-width:0 o texto não encolhe e a barra quebra linha');
  assert.match(text, /text-overflow:\s*ellipsis/, 'o que não couber precisa terminar em reticências');
  assert.match(text, /flex:\s*1 1 auto/, 'o texto da fase é quem absorve (e cede) a sobra da linha');
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
  // Truncar não pode APAGAR informação: a frase inteira (fase · contagem · tempo · aviso) viaja no
  // `title` do container.
  assert.match(runbar, /title=\{full\}/, 'a barra precisa carregar a frase inteira no title');
});

/* ─────────── (4) tools sob o turno ─────────── */

test('ui-visual: tools ficam sob o turno (toolsOfTurn), sem bloco no fim da conversa', () => {
  assert.match(transcript, /toolsOfTurn\(/, 'o transcript precisa vincular cada tool ao turno dela');
  assert.doesNotMatch(transcript, /tools\.value\.map\(\(tool/, 'sobrou o bloco de tools depois de todos os turnos');
});
