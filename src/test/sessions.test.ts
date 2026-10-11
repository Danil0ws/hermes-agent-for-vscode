/**
 * Lógica pura do tree de sessões (agrupamento por período, tempo relativo e contagem de
 * pendências). Não importa o runtime do VS Code.
 *
 * Rodar isolado:
 *   npx esbuild src/test/sessions.test.ts --bundle --format=esm --platform=node \
 *     --external:vscode --outfile=/tmp/sessions.test.mjs && node --test /tmp/sessions.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATE_ICON, STATE_LABEL, describeRow, formatPending, groupSessions, periodOf, relativeTime, rowLabel,
  type SessionRow, type SessionState,
} from '../ui/SessionTreeProvider.ts';

// Fixo e em horário LOCAL: os testes ficam determinísticos.
const NOW = new Date('2026-10-11T15:00:00');

function row(p: Partial<SessionRow> & { sessionId: string }): SessionRow {
  return { state: 'idle', pending: 0, ...p };
}

test('periodOf: hoje, ontem, anteriores e data ausente/inválida', () => {
  assert.equal(periodOf('2026-10-11T09:00:00', NOW), 'today');
  assert.equal(periodOf('2026-10-11T15:00:00', NOW), 'today');
  assert.equal(periodOf('2026-10-10T23:59:00', NOW), 'yesterday');
  assert.equal(periodOf('2026-10-09T12:00:00', NOW), 'earlier');
  assert.equal(periodOf(undefined, NOW), 'earlier');
  assert.equal(periodOf('não é data', NOW), 'earlier');
});

test('relativeTime: agora, minutos, horas, dias e data', () => {
  assert.equal(relativeTime('2026-10-11T14:59:30', NOW), 'agora');
  assert.equal(relativeTime('2026-10-11T14:58:00', NOW), 'há 2 min');
  assert.equal(relativeTime('2026-10-11T12:00:00', NOW), 'há 3 h');
  assert.equal(relativeTime('2026-10-09T15:00:00', NOW), 'há 2 d');
  assert.equal(relativeTime('2026-10-01T15:00:00', NOW), '01/10');
  assert.equal(relativeTime(undefined, NOW), '—');
});

test('formatPending: zero, singular e plural', () => {
  assert.equal(formatPending(0), '');
  assert.equal(formatPending(1), '1 pendência');
  assert.equal(formatPending(3), '3 pendências');
});

test('describeRow: modelo · tempo · pendências, omitindo o que não se sabe', () => {
  const comModelo = row({ sessionId: 'abcdef1234', updatedAt: '2026-10-11T14:58:00', model: 'deepseek-v4.1-flash', pending: 2 });
  assert.equal(describeRow(comModelo, NOW), 'deepseek-v4.1-flash · há 2 min · 2 pendências');
  const semModelo = row({ sessionId: 'abcdef1234', updatedAt: '2026-10-11T14:58:00' });
  assert.equal(describeRow(semModelo, NOW), 'há 2 min');
});

test('rowLabel: usa o título ou deriva do ID (nunca vazio)', () => {
  assert.equal(rowLabel(row({ sessionId: 'abcdef1234', title: 'Refatorar fila' })), 'Refatorar fila');
  assert.equal(rowLabel(row({ sessionId: 'abcdef1234', title: '   ' })), 'Sessão abcdef12');
  assert.equal(rowLabel(row({ sessionId: 'abcdef1234' })), 'Sessão abcdef12');
});

test('groupSessions: agrupa Hoje/Ontem/Anteriores e ordena o mais recente primeiro', () => {
  const rows = [
    row({ sessionId: 'a', updatedAt: '2026-10-11T09:00:00' }),
    row({ sessionId: 'b', updatedAt: '2026-10-11T14:00:00' }),
    row({ sessionId: 'c', updatedAt: '2026-10-10T10:00:00' }),
    row({ sessionId: 'd', updatedAt: '2026-10-01T10:00:00' }),
  ];
  const groups = groupSessions(rows, NOW);
  assert.deepEqual(groups.map((g) => g.label), ['Hoje', 'Ontem', 'Anteriores']);
  assert.deepEqual(groups[0].rows.map((r) => r.sessionId), ['b', 'a']);
  assert.deepEqual(groups[1].rows.map((r) => r.sessionId), ['c']);
  assert.deepEqual(groups[2].rows.map((r) => r.sessionId), ['d']);
});

test('groupSessions: lista vazia não cria grupo', () => {
  assert.deepEqual(groupSessions([], NOW), []);
});

test('estados: cada um tem rótulo e ícone Codicon (sem emoji)', () => {
  const states: SessionState[] = ['idle', 'running', 'waiting', 'error', 'done'];
  for (const st of states) {
    assert.ok(STATE_LABEL[st].length > 0, `rótulo de ${st}`);
    assert.match(STATE_ICON[st], /^[a-z0-9~-]+$/, `ícone Codicon de ${st}`);
  }
  assert.equal(STATE_ICON.running, 'sync~spin');
  assert.equal(STATE_LABEL.waiting, 'aguardando aprovação');
});
