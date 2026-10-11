/**
 * Testes da lógica pura do diff nativo (src/ui/DiffProvider.ts).
 *
 * Roda fora do Extension Host: o DiffProvider.ts não importa o runtime do VS Code em
 * tempo de execução (a API entra por injeção), então este bundle não referencia `vscode`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliedContent, composeApplied, diffTitle, kindOf, normalizeDiffPath } from '../ui/DiffProvider.ts';

test('appliedContent: alteração devolve o newText; remoção devolve vazio; criação idem', () => {
  assert.equal(appliedContent('a\nb', 'a\nc'), 'a\nc');
  assert.equal(appliedContent('a\nb', undefined), '', 'remoção => conteúdo vazio');
  assert.equal(appliedContent(undefined, 'novo'), 'novo', 'criação => newText');
  assert.equal(appliedContent(undefined, undefined), '');
});

test('composeApplied: vários blocos do mesmo arquivo => o último resultado é o aplicado', () => {
  const diffs = [
    { path: 'x.ts', oldText: 'v1', newText: 'v2' },
    { path: 'x.ts', oldText: 'v2', newText: 'v3' },
  ];
  assert.equal(composeApplied(diffs), 'v3');
  assert.equal(composeApplied([{ oldText: 'só antes' }]), '', 'bloco de remoção => vazio');
  assert.equal(composeApplied([]), '');
});

test('kindOf: novo / removido / alterado', () => {
  assert.equal(kindOf([{ newText: 'a' }]), 'novo');
  assert.equal(kindOf([{ oldText: 'a', newText: 'b' }]), 'alterado');
  assert.equal(kindOf([{ oldText: 'a' }]), 'removido');
  assert.equal(kindOf([]), 'alterado');
});

test('normalizeDiffPath: prefixo a//b/, barra invertida, ./ e resolução contra a raiz', () => {
  assert.equal(normalizeDiffPath('a/src/app.ts'), 'src/app.ts');
  assert.equal(normalizeDiffPath('b/src/app.ts'), 'src/app.ts');
  assert.equal(normalizeDiffPath('./src/app.ts'), 'src/app.ts');
  assert.equal(normalizeDiffPath('src\\app.ts'), 'src/app.ts');
  assert.equal(normalizeDiffPath('src/app.ts', '/w/root/'), '/w/root/src/app.ts');
  assert.equal(normalizeDiffPath('/abs/app.ts', '/w/root'), '/abs/app.ts', 'absoluto não é reancorado');
});

test('diffTitle: legível, pt-BR, sem emoji', () => {
  assert.equal(diffTitle('app.ts', 'alterado'), 'Hermes: app.ts — alterado');
  assert.equal(diffTitle('novo.ts', 'novo'), 'Hermes: novo.ts — novo');
  assert.equal(diffTitle('velho.ts', 'removido'), 'Hermes: velho.ts — removido');
});
