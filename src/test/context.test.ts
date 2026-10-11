/**
 * Testes da lógica pura da lane de contexto (sem o runtime do VS Code).
 * Rodar isolado:
 *   npx esbuild src/test/context.test.ts --bundle --format=esm --platform=node \
 *     --external:vscode --outfile=/tmp/ctx.test.mjs && node --test /tmp/ctx.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens } from '../utils/Tokens.ts';
import { chipTokens, shouldWarn, warningPercent, sliceLines, headLines } from '../core/ContextManager.ts';
import { applyFileDiff, reverseApply, countChanges } from '../core/WorkingSet.ts';

test('chip: tokens passam pela heurística ÚNICA (chars/4)', () => {
  assert.equal(chipTokens('abcd'), 1);
  assert.equal(chipTokens('a'.repeat(400)), 100);
  assert.equal(chipTokens(''), 0);
  assert.equal(chipTokens(undefined), 0);
  // nunca duplica a heurística: bate exatamente com estimateTokens
  assert.equal(chipTokens('conteúdo qualquer com acentuação'), estimateTokens('conteúdo qualquer com acentuação'));
});

test('aviso de tamanho: percentual e limiar de contextWarnAt', () => {
  assert.equal(warningPercent(10_000, 200_000), 5);
  assert.equal(warningPercent(160_000, 200_000), 80);
  assert.equal(warningPercent(1_000, 0), 0, 'sem janela não há percentual');

  // janela conhecida: limiar em % (padrão 80)
  assert.equal(shouldWarn(100_000, 200_000, 80), false); // 50%
  assert.equal(shouldWarn(160_000, 200_000, 80), true);  // 80%
  assert.equal(shouldWarn(100_000, 200_000, 40), true);  // limiar configurável

  // sem janela reportada: cai no limiar absoluto (não bloqueia nem deixa passar gigante)
  assert.equal(shouldWarn(19_000, 0, 80), false);
  assert.equal(shouldWarn(25_000, 0, 80), true);
});

test('diff inverso: aplicar sobre um texto (desfazer)', () => {
  const diff = { path: 'a.ts', oldText: 'const a = 1;', newText: 'const a = 2;' };
  assert.equal(applyFileDiff('const a = 1;', diff, false), 'const a = 2;', 'forward: old→new');
  assert.equal(applyFileDiff('const a = 2;', diff, true), 'const a = 1;', 'reverse: new→old');
  // não aplicável: devolve inalterado (nada de inventar conteúdo)
  assert.equal(applyFileDiff('outra coisa', diff, true), 'outra coisa');

  // sequência de diffs desfeita na ordem inversa
  const d1 = { path: 'x', oldText: 'v1', newText: 'v2' };
  const d2 = { path: 'x', oldText: 'v2', newText: 'v3' };
  assert.equal(reverseApply('v3', [d1, d2]), 'v1');
  assert.equal(reverseApply('v1', []), 'v1', 'sem diffs não muda nada');
});

test('contagem +/− por arquivo (diff unificado)', () => {
  const diff = [
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -1,3 +1,4 @@',
    ' const keep = 1;',
    '-const old = 2;',
    '+const new = 3;',
    '+const extra = 4;',
  ].join('\n');
  const { added, removed } = countChanges(diff);
  assert.equal(added, 2, 'duas linhas + (o cabeçalho +++ não conta)');
  assert.equal(removed, 1, 'uma linha − (o cabeçalho --- não conta)');
  assert.deepEqual(countChanges(''), { added: 0, removed: 0 });
});

test('trecho: sliceLines e headLines (resumo local)', () => {
  const text = ['l1', 'l2', 'l3', 'l4', 'l5'].join('\n');
  assert.equal(sliceLines(text, 2, 4), ['l2', 'l3', 'l4'].join('\n'));
  assert.equal(sliceLines(text, 4, 2), sliceLines(text, 2, 4), 'intervalo invertido não quebra');
  assert.equal(headLines(text, 3), ['l1', 'l2', 'l3'].join('\n'));
  assert.equal(headLines(text, 99), text, 'menor que o teto não trunca');
});
