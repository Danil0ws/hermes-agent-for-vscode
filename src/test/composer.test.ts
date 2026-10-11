/**
 * Guardas da lane B: o botão de enviar/fila DENTRO do campo (CSS sem pintura, ancorado à direita)
 * com a engrenagem fora do composer, e a lógica pura do worktree (caminho e nome de branch).
 *
 * Roda fora do Extension Host: só lê o CSS/fonte e importa o módulo puro — nada aqui referencia o
 * runtime do `vscode` (um `import * as vscode` derrubaria a suíte com MODULE_NOT_FOUND).
 *   npx esbuild src/test/composer.test.ts --bundle --format=esm --platform=node \
 *     --external:vscode --outfile=/tmp/cc.test.mjs && node --test /tmp/cc.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  laneBranches, nextLaneName, validBranchName, worktreePath, worktreeRoot,
} from '../features/worktree-logic.ts';

const root = process.cwd();
const css = readFileSync(join(root, 'webview', 'chat', 'styles.css'), 'utf8');
const composer = readFileSync(join(root, 'webview', 'chat', 'composer.tsx'), 'utf8');

function rule(sel: string): string {
  // escapa só o ponto do seletor e exige começo de linha/lista: `textarea.input` não pode casar
  // `textarea.input:focus`, e o `\` do helper antigo virava `\t` em seletor sem ponto.
  const esc = sel.replace(/\./g, '\\.');
  const m = css.match(new RegExp('(?:^|[\\s,}])' + esc + '\\s*\\{[^}]*\\}'));
  assert.ok(m, `regra ${sel} não encontrada em styles.css`);
  return m[0];
}
function decl(text: string, prop: string): string | null {
  const m = text.match(new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*([^;}]+)'));
  return m ? m[1].trim() : null;
}

/* ─────────── o enviar/fila DENTRO do campo ─────────── */

test('css: o enviar/fila fica ancorado no canto inferior direito e SEM pintura', () => {
  const r = rule('.input-send');
  assert.equal(decl(r, 'position'), 'absolute', 'botão dentro do campo precisa sair do fluxo do texto');
  assert.ok(/(px|em|rem|%)/.test(decl(r, 'right') ?? ''), 'sem ancoragem à direita');
  // o `button` global pinta fundo e desenha contorno: o fantasma precisa zerar os dois.
  assert.equal(decl(r, 'background'), 'none', 'botão-fantasma pintando fundo');
  assert.equal(decl(r, 'border'), 'none', 'botão-fantasma desenhando borda');
  assert.match(css, /\.input-send:focus-visible[^{]*\{[^}]*--vscode-foreground/, 'sem realce de foco');
});

test('css: o textarea abre espaço à direita para o texto não passar sob o botão', () => {
  const pad = decl(rule('textarea.input'), 'padding');
  assert.ok(pad, 'textarea sem padding explícito');
  const parts = pad!.split(/\s+/).map((v) => parseFloat(v));
  const right = parts.length >= 4 ? parts[1] : parts.length >= 2 ? parts[1] : parts[0];
  assert.ok(right >= 24, `padding à direita do textarea (${right}px) não reserva o botão`);
});

test('composer: a engrenagem saiu (config no título da view) e o envio inline entrou', () => {
  assert.doesNotMatch(composer, /S\.composer\.toolsTip|name="gear"/, 'engrenagem (handler/ícone) ainda no composer');
  assert.match(composer, /class="input-send"/, 'botão de enviar/fila dentro do campo não renderizado');
  assert.match(composer, /SendInline/, 'componente do envio inline ausente');
});

/* ─────────── worktree (lógica pura) ─────────── */

test('worktree: root = configuração, senão pasta irmã <repo>-worktrees', () => {
  assert.equal(worktreeRoot('', '/a/b/proj'), '/a/b/proj-worktrees');
  assert.equal(worktreeRoot('   ', '/a/b/proj'), '/a/b/proj-worktrees');
  assert.equal(worktreeRoot('/wt/here', '/a/b/proj'), '/wt/here');
});

test('worktree: o worktree fica em <root>/<branch> (a branch com barra vira subpasta)', () => {
  assert.equal(worktreePath('/wt', 'lane/2'), '/wt/lane/2');
});

test('worktree: nome de branch segue o git-check-ref-format', () => {
  for (const ok of ['lane/1', 'feat/x', 'a-b_c.d', 'lane/12']) {
    assert.ok(validBranchName(ok), `deveria aceitar ${ok}`);
  }
  const bad = ['', ' ', 'lane 1', 'a..b', 'lane/', 'x.lock', '/x', 'x/', 'a//b', 'a@{b}',
    'x~y', 'x^y', 'x:y', 'x?y', 'x*y', 'x[y', 'x\\y', '.hidden', 'x.lock/y', 'x/.y', '-x', 'x.', '@'];
  for (const b of bad) assert.ok(!validBranchName(b), `deveria rejeitar ${JSON.stringify(b)}`);
});

test('worktree: próximo lane/<n> livre e leitura dos worktrees existentes', () => {
  assert.equal(nextLaneName([]), 'lane/1');
  assert.equal(nextLaneName(['lane/1', 'lane/2']), 'lane/3');
  assert.equal(nextLaneName(['lane/1', 'lane/3']), 'lane/2');
  const list = [
    '/repo                         abc1234 [main]',
    '/repo-worktrees/lane/1        def5678 [lane/1]',
    '/repo-worktrees/feat/x        1111111 [feat/x]',
  ].join('\n');
  assert.deepEqual(laneBranches(list), ['lane/1']);
});

/* ─────────── sem sessão: UM caminho só (o "Iniciar" do bloco central) ─────────── */

test('sem sessão: um só "Iniciar", campo desabilitado e toolbar inexistente', () => {
  const transcript = readFileSync(join(root, 'webview', 'chat', 'transcript.tsx'), 'utf8');
  const tabbar = readFileSync(join(root, 'webview', 'chat', 'tabbar.tsx'), 'utf8');
  const tabsCss = readFileSync(join(root, 'webview', 'chat', 'tabs.css'), 'utf8');

  // o primário da toolbar duplicava o botão do bloco central (visto na tela: dois "Iniciar")
  assert.doesNotMatch(composer, /function StartButton/,
    'o "Iniciar" da toolbar voltou: duplica o do bloco central');
  assert.match(composer, /\{started && \(\s*<div class="toolbar">/,
    'a toolbar (+, selects, medidor) tem de existir só COM sessão');

  // nada de interação antes de iniciar
  assert.match(composer, /disabled=\{!started\}/, 'o campo tem de ficar desabilitado sem sessão');
  assert.match(composer, /!started \? S\.composer\.locked/, 'sem sessão o placeholder tem de mandar iniciar');
  assert.match(tabbar, /disabled=\{locked\}/, 'abrir aba/worktree tem de ficar inerte sem sessão');
  assert.match(tabsCss, /\.tab-add:disabled/, 'falta o estilo do botão de aba desabilitado');
  assert.match(css, /textarea\.input:disabled/, 'falta o estilo do campo desabilitado');

  // o bloco central sem sessão: título + descrição + botão, e mais nada clicável
  const ini = transcript.indexOf('state.value.sessionId === null');
  const bloco = transcript.slice(ini, transcript.indexOf('S.empty.greeting', ini));
  assert.ok(ini > 0 && bloco.length > 0, 'não achei o ramo sem sessão do estado vazio');
  assert.doesNotMatch(bloco, /start-actions|S\.empty\.startHint/,
    'sem sessão só o botão de iniciar pode estar ativo (nem sugestões, nem dica)');
  assert.match(bloco, /send\(\{ type: 'start' \}\)/, 'o bloco central tem de continuar mandando `start`');
});
