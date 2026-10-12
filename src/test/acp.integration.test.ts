/**
 * Integração real: spawna `hermes acp` de verdade e exercita o caminho do M1
 * (initialize -> session/new -> prompt com streaming -> cancel).
 *
 * Requer o Hermes instalado. Sem ele, o teste é marcado como skip — nunca finge passar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as acp from '@agentclientprotocol/sdk';
import { Connection } from '../core/Connection.ts';
import { HermesSession, type SessionDeps } from '../core/HermesSession.ts';
import type { HostToWebview, PermissionRequest } from '../core/types.ts';

function hermesAvailable(): string | undefined {
  try { return execFileSync('command', ['-v', 'hermes'], { shell: true, encoding: 'utf8' }).trim() || undefined; }
  catch { return undefined; }
}

const HERMES = hermesAvailable();
const SKIP = HERMES ? false : 'hermes não está no PATH';

function makeDeps(events: HostToWebview[]): SessionDeps {
  return {
    isPathAllowed: () => true,
    readFile: async () => 'conteúdo',
    writeFile: async () => {},
    askPermission: (_req: PermissionRequest, resolve) => resolve(null), // nega: teste não deve executar nada
    log: () => {},
  };
}

test('ACP real: initialize negocia protocolo 1 e as capabilities do Hermes', { skip: SKIP }, async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hermes-acp-test-'));
  const events: HostToWebview[] = [];
  // o roteador do AgentManager: session/update -> sessão. Sem isto os updates se perdem,
  // que é exatamente a falha que este teste existe para pegar.
  let current: HermesSession | undefined;
  const client: acp.Client = {
    sessionUpdate: async (p: acp.SessionNotification) => { current?.handleUpdate(p.update); },
    requestPermission: async () => ({ outcome: { outcome: 'cancelled' } as acp.RequestPermissionOutcome }),
    readTextFile: async () => ({ content: '' }),
    writeTextFile: async () => ({}),
  };
  const conn = new Connection({ command: 'hermes', args: ['acp'] });
  try {
    const init = await conn.start(cwd, client);
    assert.equal(init.protocolVersion, acp.PROTOCOL_VERSION, 'protocolo negociado tem de ser 1');
    assert.equal(init.agentInfo?.name, 'hermes-agent');
    assert.equal(init.agentCapabilities?.loadSession, true);
    assert.equal(init.agentCapabilities?.promptCapabilities?.image, true);
    assert.ok(init.agentCapabilities?.sessionCapabilities, 'sessionCapabilities anunciadas');

    const session = await HermesSession.create(conn.connection, cwd, makeDeps(events), (m) => events.push(m), 'Hermes');
    current = session;
    assert.ok(session.sessionId.length > 8, `sessionId recebido: ${session.sessionId}`);
    assert.ok(session.snapshot.modes.length >= 3, 'o Hermes anuncia 3 modos (política de edição)');
    assert.deepEqual(session.snapshot.modes.map((m) => m.id), ['default', 'accept_edits', 'dont_ask']);
    assert.ok(session.snapshot.models.length > 0, 'catálogo de modelos vem em session/new');

    // E a sessão tem de ANUNCIAR esse escopo ao nascer. Sem isto, quem cria a sessão sob demanda
    // (o `send()` do composer, quando o usuário manda o primeiro prompt) fica com os seletores de
    // modo/modelo vazios a conversa inteira: os dados existiam no snapshot, mas nenhuma mensagem
    // chegava à webview — o `init` dela foi montado quando ainda não havia sessão.
    const modesMsg = events.find((e) => e.type === 'modes') as { modes: unknown[] } | undefined;
    assert.ok(modesMsg, 'sessão não emitiu `modes` ao ser criada');
    assert.equal(modesMsg.modes.length, session.snapshot.modes.length);
    const modelsMsg = events.find((e) => e.type === 'models') as { models: unknown[] } | undefined;
    assert.ok(modelsMsg, 'sessão não emitiu `models` ao ser criada');
    assert.equal(modelsMsg.models.length, session.snapshot.models.length);

    // Troca de modo: o agente NÃO emite `current_mode_update` (verificado no adaptador: ele grava
    // `state.mode`, salva a sessão e responde `{}`), então quem conta à webview é a NOSSA sessão.
    // Sem este emit o seletor do composer ficava com o modo velho e voltava para "Default" — era o
    // defeito relatado ("seleciono Accept Edits, dou Enter e volta para o default").
    events.length = 0;
    await session.setMode('accept_edits');
    const modeMsg = events.find((e) => e.type === 'modes') as { current?: string } | undefined;
    assert.ok(modeMsg, 'setMode não emitiu `modes`: a webview fica com o modo velho');
    assert.equal(modeMsg.current, 'accept_edits', 'emit de `modes` com o modo errado');
    assert.equal(session.snapshot.currentMode, 'accept_edits');

    // prompt curto: o streaming tem de produzir texto e um stop reason
    const stop = await session.prompt('Responda apenas: ok');
    assert.equal(stop, 'end_turn', `stop_reason inesperado: ${stop}`);
    const text = events.filter((e) => e.type === 'agent/chunk').map((e) => (e as { text: string }).text).join('');
    assert.ok(text.trim().length > 0, `nenhum agent_message_chunk recebido (eventos: ${events.map((e) => e.type).join(',')})`);

    // cancel: dispara um turno e cancela antes de terminar
    const pending = session.prompt('Conte de 1 até 200, um número por linha.');
    await new Promise((r) => setTimeout(r, 1500));
    await session.cancel();
    const cancelled = await pending;
    assert.ok(['cancelled', 'end_turn'].includes(cancelled), `stop_reason após cancel: ${cancelled}`);

    // O modo é PERSISTIDO pelo agente: reabrir a sessão devolve `accept_edits`. É esta metade que
    // faz a escolha sobreviver a reload e a trocar de aba (o `session/load` é o caminho do
    // histórico). Fica por último: o replay do histórico polui `events` de propósito.
    const reloaded = await HermesSession.load(conn.connection, cwd, session.sessionId, makeDeps(events), () => {}, 'Hermes');
    assert.equal(reloaded?.snapshot.currentMode, 'accept_edits', 'session/load não devolveu o modo salvo');
    assert.deepEqual(reloaded?.snapshot.modes.map((m) => m.id), ['default', 'accept_edits', 'dont_ask']);
  } finally {
    conn.stop();
  }
});

test('ACP real: connection.stop não deixa processo órfão', { skip: SKIP }, async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hermes-acp-test-'));
  const client: acp.Client = {
    sessionUpdate: async () => {},
    requestPermission: async () => ({ outcome: { outcome: 'cancelled' } as acp.RequestPermissionOutcome }),
    readTextFile: async () => ({ content: '' }),
    writeTextFile: async () => ({}),
  };
  const conn = new Connection({ command: 'hermes', args: ['acp'] });
  await conn.start(cwd, client);
  assert.equal(conn.alive, true);
  conn.stop();
  await new Promise((r) => setTimeout(r, 3500));
  assert.equal(conn.alive, false, 'processo continuou vivo depois do stop()');
});
