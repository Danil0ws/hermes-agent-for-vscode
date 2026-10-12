/**
 * Guarda da leitura única de "o que está rodando" (`webview/chat/status.ts`) e do vínculo
 * tool ↔ turno (`webview/chat/items.ts`).
 *
 * O defeito relatado, em duas asserções: (1) a tela anunciava mais de uma coisa rodando ao mesmo
 * tempo quando não rodava nada diferente; (2) um tool cancelado ficava "rodando" para sempre. Aqui
 * fixamos a PRECEDÊNCIA das fases e o patch que fecha o que ficou preso.
 *
 *   npx esbuild src/test/runstatus.test.ts --bundle --format=esm --platform=node \
 *     --external:vscode --outfile=/tmp/runstatus.test.mjs && node --test /tmp/runstatus.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STALL_MS, closingPatch, isOpenTool, openTools, runStatus, type RunInput, type TurnLike,
} from '../../webview/chat/status.ts';
import { ownerTurnId, toolsOfTurn, type ToolEntry } from '../../webview/chat/items.ts';
import type { PermissionRequest, ToolView } from '../core/types.ts';

const NOW = 1_700_000_000_000;

function tool(id: string, status: ToolView['status'], startedAt = NOW, kind = 'execute', title = 'git status'): ToolView {
  return { id, kind, title, status, startedAt };
}

const turn = (id: string, streaming = false, over: Partial<TurnLike> = {}): TurnLike => ({
  id, role: 'agent', text: '', streaming, startedAt: NOW, ...over,
});

const base: RunInput = { busy: false, permission: null, tools: [], turns: [], now: NOW };
const st = (over: Partial<RunInput> = {}) => runStatus({ ...base, ...over });

/* ─────────── precedência: uma fase por vez ─────────── */

test('status: uma coisa rodando = uma fase (tool > streaming > busy)', () => {
  // pausado vence tudo: por definição não roda nada
  assert.equal(st({ paused: true, busy: true, tools: [tool('a', 'in_progress')] }).phase, 'paused');
  // mão na roda: permissão é ESPERA, não execução (era aqui que a tela mentia)
  const perm = { id: 'p1', title: 'Aprovar comando', options: [] } as unknown as PermissionRequest;
  assert.equal(st({ busy: true, permission: perm, tools: [tool('a', 'in_progress')] }).phase, 'waiting');
  // com tool aberta, é a tool que manda — mesmo com o turno em streaming
  const s = st({ busy: true, tools: [tool('a', 'in_progress')], turns: [turn('t1', true)] });
  assert.equal(s.phase, 'tool');
  assert.equal(s.tool?.id, 'a');
  // sem tool: raciocínio vs resposta é decidido pelo que já chegou
  assert.equal(st({ busy: true, turns: [turn('t1', true)] }).phase, 'thinking');
  assert.equal(st({ busy: true, turns: [turn('t1', true, { text: 'ok' })] }).phase, 'writing');
  // turno aberto sem nada anunciado ainda
  assert.equal(st({ busy: true }).phase, 'working');
  // o handshake do Iniciar tem a própria fase (o estado vazio é quem mostra o spinner dele)
  assert.equal(st({ starting: true, busy: true }).phase, 'starting');
  assert.equal(st().phase, 'idle');
});

test('status: contagens e o fim do turno não deixam nada "rodando"', () => {
  const tools = [tool('a', 'completed'), tool('b', 'failed'), tool('c', 'cancelled')];
  const s = st({ tools, turns: [turn('t1')] });
  assert.equal(s.phase, 'idle', 'tool fechada não é execução');
  assert.equal(s.open, 0);
  assert.equal(s.done, 3);
});

test('status: fase longa é VISÍVEL (o travamento não fica silencioso)', () => {
  const t = tool('a', 'in_progress', NOW - STALL_MS - 1);
  const s = runStatus({ ...base, tools: [t] });
  assert.equal(s.phase, 'tool');
  assert.equal(s.since, NOW - STALL_MS - 1);
  assert.equal(s.slow, true, 'acima do teto de sinal a barra precisa avisar');
  assert.equal(st({ tools: [tool('a', 'in_progress', NOW - 1000)] }).slow, false);
});

test('status: mais de uma tool aberta é reportada, não escondida', () => {
  const s = st({ tools: [tool('a', 'in_progress'), tool('b', 'pending')] });
  assert.equal(s.open, 2);
  assert.equal(s.tool?.id, 'b', 'a barra mostra a última que abriu');
});

/* ─────────── fechar o que ficou preso ─────────── */

test('status: o patch de fechamento tira o tool do estado "rodando"', () => {
  const t = tool('a', 'in_progress');
  assert.equal(isOpenTool(t), true);
  assert.deepEqual(openTools([t, tool('b', 'completed')]).map((x) => x.id), ['a']);
  const closed = { ...t, ...closingPatch(NOW + 5000) };
  assert.equal(closed.status, 'cancelled');
  assert.equal(closed.endedAt, NOW + 5000);
  assert.equal(isOpenTool(closed), false, 'depois do patch ninguém mais considera rodando');
});

/* ─────────── tool ↔ turno ─────────── */

test('items: o tool é do turno do agente em que nasceu', () => {
  const turns: TurnLike[] = [{ id: 'u1', role: 'user', text: 'oi', startedAt: NOW }, turn('a1')];
  assert.equal(ownerTurnId(turns), 'a1');
  // sem turno do agente ainda, o dono é o prompt do usuário
  assert.equal(ownerTurnId([{ id: 'u1', role: 'user', text: 'oi', startedAt: NOW }]), 'u1');
  assert.equal(ownerTurnId([]), undefined);

  const tools: ToolEntry[] = [{ ...tool('x', 'completed'), turnId: 'a1' }, { ...tool('y', 'completed'), turnId: 'a2' }];
  assert.deepEqual(toolsOfTurn(tools, 'a1', false).map((t) => t.id), ['x']);
  assert.deepEqual(toolsOfTurn(tools, 'a2', true).map((t) => t.id), ['y']);
  // tool sem dono cai no último turno (visível no lugar aproximado) e em nenhum outro
  const orphan: ToolEntry[] = [tool('z', 'completed')];
  assert.deepEqual(toolsOfTurn(orphan, 'a2', true).map((t) => t.id), ['z']);
  assert.deepEqual(toolsOfTurn(orphan, 'a1', false), []);
});
