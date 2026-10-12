/**
 * Guarda do FECHAMENTO do turno (`src/core/HermesSession.ts`).
 *
 * Um turno cancelado (ou morto sem `tool_call_update` terminal) deixava a webview com a ferramenta
 * "rodando" e `busy` para sempre — os sintomas relatados ("aparecia rodando três coisas ao mesmo
 * tempo sem rodar nada diferente" e "não entendi por que eu tinha travado"). Aqui fixamos que TODO
 * caminho terminal fecha o turno num lugar só: toda tool aberta vira `cancelled` (com `endedAt`),
 * sai um `turn/end` e `busy` zera — inclusive no `cancel()`, que liquida NA HORA sem esperar a
 * resposta do agente.
 *
 * O `prompt` falso fica PENDENTE até o teste mandar terminar (`finish`), para o turno existir de
 * fato quando o `cancel()` roda — é assim que o caminho real acontece (usuário cancela um turno
 * em andamento).
 *
 *   npx esbuild src/test/turnend.test.ts --bundle --format=esm --platform=node \
 *     --external:vscode --outfile=/tmp/lane1.test.mjs && node --test /tmp/lane1.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as acp from '@agentclientprotocol/sdk';
import { HermesSession, type SessionDeps } from '../core/HermesSession.ts';
import type { HostToWebview, SessionState } from '../core/types.ts';

/** literal mínimo de `SessionState` (o mesmo do `HermesSession.create`, sem depender do Extension Host) */
function makeState(): SessionState {
  return {
    sessionId: 's1', agent: 'Hermes', busy: false, paused: false,
    modes: [], currentMode: undefined, models: [], currentModel: undefined,
    commands: [], chips: [], queue: [], plan: [], workingSet: [],
    showReasoning: 'collapsed', contextWarnAt: 80, queueEnabled: true, queueDefaultAction: 'queue',
  };
}

const deps: SessionDeps = {
  isPathAllowed: () => true,
  readFile: async () => '',
  writeFile: async () => {},
  askPermission: (_req, resolve) => resolve(null),
  log: () => {},
};

/** conn falsa: `prompt` só resolve quando o teste chama `finish()` — mantém o turno aberto. */
function fakeConn(): { conn: acp.ClientSideConnection; finish: (r?: acp.StopReason) => void } {
  let finish: (stopReason: acp.StopReason) => void = () => {};
  const conn = {
    prompt: () => new Promise<{ stopReason: acp.StopReason }>((resolve) => {
      finish = (stopReason) => resolve({ stopReason });
    }),
    cancel: async () => {},
  };
  return {
    conn: conn as unknown as acp.ClientSideConnection,
    finish: (r: acp.StopReason = 'cancelled') => finish(r),
  };
}

function setup(): { session: HermesSession; events: HostToWebview[]; finish: (r?: acp.StopReason) => void } {
  const events: HostToWebview[] = [];
  const { conn, finish } = fakeConn();
  const session = new HermesSession(conn, 's1', deps, (m) => events.push(m), makeState());
  return { session, events, finish };
}

/** abre a tool `t1` (pending -> in_progress), como o agente faz num turno */
function openTool(session: HermesSession, id = 't1'): void {
  session.handleUpdate({
    sessionUpdate: 'tool_call', toolCallId: id, title: 'git status', kind: 'execute',
    status: 'pending', rawInput: { command: 'git status' },
  } as unknown as acp.SessionUpdate);
  session.handleUpdate({ sessionUpdate: 'tool_call_update', toolCallId: id, status: 'in_progress' } as unknown as acp.SessionUpdate);
}

const toolUpdates = (events: HostToWebview[]) =>
  events.filter((e): e is Extract<HostToWebview, { type: 'tool/update' }> => e.type === 'tool/update');
/** a(s) tool/update de FECHAMENTO (status cancelled) de uma tool — a de in_progress não conta. */
const cancelledOf = (events: HostToWebview[], id: string) =>
  toolUpdates(events).filter((e) => e.id === id && e.patch.status === 'cancelled');
const count = (events: HostToWebview[], type: HostToWebview['type']) => events.filter((e) => e.type === type).length;
const busyFalse = (events: HostToWebview[]) =>
  events.filter((e) => e.type === 'busy' && e.value === false).length;

test('cancel liquida o turno NA HORA: tool aberta vira cancelled, turn/end e busy=false', async () => {
  const { session, events, finish } = setup();
  const p = session.prompt('oi');   // turno aberto (prompt pendente: o agente não respondeu ainda)
  openTool(session);
  assert.equal(session.busy, true, 'o prompt tem de marcar busy');

  await session.cancel();            // o agente pode NUNCA responder ao cancel: liquidar já
  finish();                          // o agente só responde DEPOIS
  await p;

  const closed = cancelledOf(events, 't1');
  assert.equal(closed.length, 1, 'a tool t1 ficou "rodando" para sempre');
  assert.equal(typeof closed[0].patch.endedAt, 'number', 'faltou endedAt no patch');
  assert.equal(count(events, 'turn/end'), 1, 'turn/end não foi emitido');
  assert.equal(busyFalse(events), 1, 'busy não foi zerado');
  assert.equal(session.busy, false);
});

test('prompt que termina (end_turn) com tool aberta: mesma limpeza', async () => {
  const { session, events, finish } = setup();
  const p = session.prompt('oi');
  openTool(session);                 // ficou aberta quando o turno terminou

  finish('end_turn');
  assert.equal(await p, 'end_turn');

  const closed = cancelledOf(events, 't1');
  assert.equal(closed.length, 1, 'turno que terminou não fechou a tool aberta');
  assert.equal(typeof closed[0].patch.endedAt, 'number');
  assert.equal(count(events, 'turn/end'), 1);
  assert.equal(busyFalse(events), 1);
});

test('idempotente: cancel() seguido de novo settle emite UMA vez', async () => {
  const { session, events, finish } = setup();
  const p = session.prompt('oi');
  openTool(session);

  await session.cancel();            // 1ª liquidação
  await session.cancel();            // sem turno aberto: no-op (sentinel `?? 0`)
  finish();
  await p;                           // finally do prompt: no-op também

  assert.equal(cancelledOf(events, 't1').length, 1, 'tool/update duplicado');
  assert.equal(count(events, 'turn/end'), 1, 'turn/end duplicado');
  assert.equal(busyFalse(events), 1, 'busy duplicado');
});
