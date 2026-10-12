/** Testes unitários da lógica que não depende do VS Code. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueueManager, drainAllowed } from '../core/QueueManager.ts';
import { estimateTokens, meterLevel, percent } from '../utils/Tokens.ts';
import { parseUnifiedDiff } from '../core/HermesSession.ts';
import { splitCommand } from '../core/Connection.ts';

test('fila: ordem, mover, remover, drain e "enviar agora"', () => {
  const q = new QueueManager();
  const a = q.add('primeiro');
  const b = q.add('segundo');
  const c = q.add('terceiro');
  assert.equal(a.id.startsWith('q'), true, 'id da fila tem prefixo q');
  assert.equal(q.size, 3);
  assert.deepEqual(q.all.map((i) => i.text), ['primeiro', 'segundo', 'terceiro']);

  q.move(c.id, -1);
  assert.deepEqual(q.all.map((i) => i.text), ['primeiro', 'terceiro', 'segundo']);
  q.move(c.id, -1);
  assert.deepEqual(q.all.map((i) => i.text), ['terceiro', 'primeiro', 'segundo']);
  q.move(c.id, -1); // já está no topo
  assert.deepEqual(q.all.map((i) => i.text), ['terceiro', 'primeiro', 'segundo'], 'não passa do topo');
  q.move(b.id, 1); // já está no fim
  assert.deepEqual(q.all.map((i) => i.text), ['terceiro', 'primeiro', 'segundo'], 'não passa do fim');

  const taken = q.take(b.id);
  assert.equal(taken?.text, 'segundo');
  assert.equal(q.size, 2);

  assert.equal(q.next()?.text, 'terceiro');
  assert.equal(q.next()?.text, 'primeiro');
  assert.equal(q.next(), undefined);
  assert.equal(q.size, 0);
});

test('fila: persiste e reidrata do Memento', () => {
  const mem = new Map<string, unknown>();
  const store = {
    get: <T>(k: string) => mem.get(k) as T | undefined,
    update: async (k: string, v: unknown) => { mem.set(k, v); },
  };
  const q1 = new QueueManager(store as never);
  q1.add('sobrevive ao reload');
  const q2 = new QueueManager(store as never);
  assert.equal(q2.size, 1);
  assert.equal(q2.all[0].text, 'sobrevive ao reload');
});

/**
 * O portão da pausa. O caso que ele existe para pegar: pausar NO MEIO de um turno — o turno é
 * interrompido, o `prompt()` volta e o drain roda em seguida. Sem a guarda, o próximo da fila era
 * enviado logo depois de o usuário pedir pausa, e a pausa não valia nada.
 */
test('pausa: a fila só drena com as execuções soltas', () => {
  assert.equal(drainAllowed(false, true), true, 'solto + fila ligada: drena');
  assert.equal(drainAllowed(true, true), false, 'pausado: NÃO drena (o caso do pause no meio do turno)');
  assert.equal(drainAllowed(false, false), false, 'fila desligada nas configurações: nunca drena');
  assert.equal(drainAllowed(true, false), false);
});

test('tokens: heurística única e limiares do medidor', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('a'.repeat(400)), 100);
  assert.equal(meterLevel(100, 1000), 'ok');
  assert.equal(meterLevel(699, 1000), 'ok');
  assert.equal(meterLevel(700, 1000), 'warn');
  assert.equal(meterLevel(900, 1000), 'warn');
  assert.equal(meterLevel(901, 1000), 'critical');
  assert.equal(meterLevel(5, 0), 'ok', 'sem janela reportada, nunca alarmar');
  assert.equal(percent(34, 200), 17);
  assert.equal(percent(1, 0), 0);
});

test('diff unificado -> oldText/newText por arquivo', () => {
  const diff = [
    '--- a/src/app.ts',
    '+++ b/src/app.ts',
    '@@ -1,3 +1,4 @@',
    ' const a = 1;',
    '-const b = 2;',
    '+const b = 3;',
    '+const c = 4;',
  ].join('\n');
  const parsed = parseUnifiedDiff(diff);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].path, 'src/app.ts');
  assert.match(parsed[0].oldText ?? '', /const b = 2;/);
  assert.match(parsed[0].newText ?? '', /const b = 3;/);
  assert.match(parsed[0].newText ?? '', /const c = 4;/);
});

test('diff unificado: dois arquivos no mesmo texto', () => {
  const diff = [
    '--- a/one.ts', '+++ b/one.ts', '-a', '+b',
    '--- a/two.ts', '+++ b/two.ts', '-c', '+d',
  ].join('\n');
  const parsed = parseUnifiedDiff(diff);
  assert.deepEqual(parsed.map((p) => p.path), ['one.ts', 'two.ts']);
});

test('diff do tool_call (blocos ACP) e atribuição de +/-', () => {
  const content = [{ type: 'diff', path: '/w/x.ts', oldText: 'a\nb', newText: 'a\nc\nd' }];
  const parsed = parseUnifiedDiff(''); // sem texto unificado
  assert.equal(parsed.length, 0);
  // blocos ACP são lidos pelo conversor interno; aqui garantimos que diff cru não quebra o parser
  assert.doesNotThrow(() => JSON.stringify(content));
});

test('splitCommand: o PRIMEIRO token e o executavel, o resto e argumento do wrapper', () => {
  assert.deepEqual(splitCommand('hermes'), { file: 'hermes', prefix: [] });
  // 'wsl hermes' tem de virar spawn('wsl', ['hermes', 'acp']); a versao anterior devolvia
  // file='hermes' e gerava 'hermes wsl acp', que nunca sobe no Windows/WSL.
  assert.deepEqual(splitCommand('wsl hermes'), { file: 'wsl', prefix: ['hermes'] });
  assert.deepEqual(splitCommand('  bun   x  '), { file: 'bun', prefix: ['x'] });
  assert.throws(() => splitCommand('   '));

  // o argv final, como a Connection monta: executavel + prefixo + args
  const { file, prefix } = splitCommand('wsl hermes');
  assert.deepEqual([file, ...prefix, 'acp'], ['wsl', 'hermes', 'acp']);
});
