/**
 * Transcript: (1) só o tool call ATIVO abre em detalhe, (2) o fim do turno é anunciado em uma linha
 * e limpa o "pensando", (3) arquivos alterados fecham por padrão e o texto não estoura a caixa.
 *
 * Roda fora do Extension Host (nada aqui importa o runtime do `vscode`):
 *   npx esbuild src/test/transcript.test.ts --bundle --format=esm --platform=node \
 *     --external:vscode --outfile=/tmp/tr.test.mjs && node --test /tmp/tr.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toolDetailOpen } from '../../webview/chat/logic.ts';
import { applyHost } from '../../webview/chat/router.ts';
import { state, tools, turnEnd, turns } from '../../webview/chat/store.ts';
import { toolsOfTurn } from '../../webview/chat/items.ts';
import { S } from '../../webview/chat/i18n.ts';
import type { StopReason, ToolView } from '../core/types.ts';

const root = process.cwd();
const css = readFileSync(join(root, 'webview', 'chat', 'styles.css'), 'utf8');
const transcript = readFileSync(join(root, 'webview', 'chat', 'transcript.tsx'), 'utf8');
const router = readFileSync(join(root, 'webview', 'chat', 'router.ts'), 'utf8');

const rule = (sel: string): string => {
  const esc = sel.replace(/\./g, '\\.');
  const m = css.match(new RegExp('(?:^|[\\s,}])' + esc + '\\s*\\{[^}]*\\}'));
  assert.ok(m, `regra ${sel} não encontrada em styles.css`);
  return m[0];
};

/* ─────────── (1) tool call: só o ativo abre ─────────── */

test('tool: abre o que corre e o último da lista; os anteriores ficam recolhidos', () => {
  // em andamento abre mesmo estando no meio (é o que está acontecendo agora)
  assert.equal(toolDetailOpen(0, 5, 'in_progress'), true);
  assert.equal(toolDetailOpen(3, 5, 'pending'), true);
  // o último abre mesmo terminado (é onde o turno parou)
  assert.equal(toolDetailOpen(4, 5, 'completed'), true);
  // os anteriores fecham: era isto que empurrava o transcript para fora da tela
  assert.equal(toolDetailOpen(0, 5, 'completed'), false);
  assert.equal(toolDetailOpen(2, 5, 'failed'), false);
  // único item: é o último, logo abre
  assert.equal(toolDetailOpen(0, 1, 'completed'), true);
});

/* ─────────── (2) fim de turno: avisa e limpa o "pensando" ─────────── */

/** Estado limpo por teste: sem abas (`activeTab` vazio) as mensagens sem `tab` caem na aba ativa. */
function reset(): void {
  state.value = { ...state.value, activeTab: '', busy: false, sessionId: null };
  turns.value = [];
  tools.value = [];
  turnEnd.value = null;
}

test('turn/end: para o "pensando" e publica o aviso de fim', () => {
  reset();
  applyHost({ type: 'agent/chunk', messageId: 'm1', text: 'Foi concluído.' });
  assert.equal(turns.value.at(-1)?.streaming, true, 'enquanto corre, o turno está "pensando"');

  applyHost({ type: 'turn/end', stopReason: 'end_turn' });
  assert.equal(turns.value.at(-1)?.streaming, false, 'fim do turno tem de limpar o "pensando"');
  assert.equal(turnEnd.value?.stopReason, 'end_turn', 'fim do turno sem aviso: nada diz que acabou');
});

test('turn/end: o aviso do turno anterior some no turno seguinte', () => {
  reset();
  applyHost({ type: 'agent/chunk', messageId: 'm2', text: 'ok' });
  applyHost({ type: 'turn/end', stopReason: 'end_turn' });
  assert.ok(turnEnd.value, 'pré-condição: aviso publicado');

  applyHost({ type: 'user/message', text: 'mais uma', chips: [] });
  assert.equal(turnEnd.value, null, 'aviso velho não pode ficar preso no fim da conversa');

  // e um chunk novo (turno nascido sem eco de `user/message`) também limpa
  applyHost({ type: 'turn/end', stopReason: 'cancelled' });
  applyHost({ type: 'agent/chunk', messageId: 'm3', text: 'de novo' });
  assert.equal(turnEnd.value, null);
});

test('turn/end: turno cancelado também limpa o "pensando" (não só `end_turn`)', () => {
  reset();
  applyHost({ type: 'thought/chunk', messageId: 'm4', text: 'pensando…' });
  assert.equal(turns.value.at(-1)?.streaming, true);
  applyHost({ type: 'turn/end', stopReason: 'cancelled' });
  assert.equal(turns.value.at(-1)?.streaming, false, 'cancelar deixava o spinner girando');
  assert.equal(turnEnd.value?.stopReason, 'cancelled');
});

/* ─────────── (2c) cada tool call nasce no turno dele ─────────── */

const mkTool = (over: Partial<ToolView> = {}): ToolView => ({
  id: 't1', kind: 'execute', title: 'Rodar', status: 'in_progress', startedAt: 1, ...over,
});

test('tool/start: o tool nasce vinculado ao turno certo (e não vaza para o do usuário anterior)', () => {
  reset();
  applyHost({ type: 'user/message', text: 'faça', chips: [] });
  const prevUserId = turns.value.at(-1)!.id; // turno do usuário ANTERIOR (o prompt antes do agente)
  applyHost({ type: 'agent/chunk', messageId: 'a1', text: 'rodando…' });
  applyHost({ type: 'tool/start', tool: mkTool({ id: 't1' }) });

  const tool = tools.value.at(-1)!;
  assert.equal(tool.turnId, 'a1', 'o tool tem de carregar o turno em que nasceu (antes nascia solto)');
  // pertence ao turno certo: sem isto o card sumia da tela
  assert.equal(toolsOfTurn(tools.value, 'a1', false).length, 1, 'some da tela se não pertencer a este turno');
  // e NÃO vaza para o turno do usuário anterior (era o defeito: tudo num bloco depois de todos os turnos)
  assert.equal(toolsOfTurn(tools.value, prevUserId, false).length, 0, 'tool colado a um turno antigo');
});

test('turn/end: fecha defensivamente a tool que ficou aberta e preserva o vínculo do turno', () => {
  reset();
  applyHost({ type: 'user/message', text: 'x', chips: [] });
  applyHost({ type: 'agent/chunk', messageId: 'a2', text: 'rodando…' });
  applyHost({ type: 'tool/start', tool: mkTool({ id: 't-open', status: 'in_progress' }) });
  assert.equal(tools.value.at(-1)!.status, 'in_progress', 'pré-condição: tool aberta');
  assert.equal(turns.value.at(-1)!.streaming, true, 'pré-condição: turno "pensando"');

  applyHost({ type: 'turn/end', stopReason: 'cancelled' });

  const tool = tools.value.at(-1)!;
  assert.equal(tool.status, 'cancelled', 'tool presa ficava "rodando" para sempre: o reducer tem de fechar');
  assert.equal(typeof tool.endedAt, 'number', 'sem `endedAt` o card fica sem duração');
  assert.equal(tool.turnId, 'a2', 'fechar não pode perder o vínculo com o turno');
  // (c) o fim do turno continua zerando o "pensando" e publicando o aviso
  assert.equal(turns.value.at(-1)!.streaming, false, 'fim do turno tem de limpar o "pensando"');
  assert.equal(turnEnd.value?.stopReason, 'cancelled', 'fim do turno sem aviso');
});

test('turn/end: no-op nas tools que o host já fechou (não reescreve quem terminou)', () => {
  reset();
  applyHost({ type: 'user/message', text: 'x', chips: [] });
  applyHost({ type: 'tool/start', tool: mkTool({ id: 'done', status: 'completed', endedAt: 5 }) });
  applyHost({ type: 'turn/end', stopReason: 'end_turn' });
  const tool = tools.value.at(-1)!;
  assert.equal(tool.status, 'completed', 'tool já terminada não pode virar cancelled');
  assert.equal(tool.endedAt, 5, '`endedAt` já reportado pelo host tem de ser preservado');
});

test('router: TODO caminho de erro do host fecha o turno (é o único evento que limpa o streaming)', () => {
  // guarda de fonte: sem o `turn/end` no catch, um prompt que falha deixa a webview "pensando" para sempre
  assert.match(router, /case 'turn\/end'/);
  const host = readFileSync(join(root, 'src', 'core', 'HermesSession.ts'), 'utf8');
  const body = host.slice(host.indexOf('async prompt('), host.indexOf('async cancel('));
  assert.match(body, /catch[\s\S]*?emit\(\{ type: 'turn\/end'/, 'o catch do prompt precisa emitir turn/end');
});

/* ─────────── (2b) rótulos de fim de turno ─────────── */

test('i18n: todo StopReason do ACP tem rótulo, e nenhum é emoji', () => {
  const reasons: StopReason[] = ['end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled'];
  for (const r of reasons) {
    assert.ok(S.stop[r], `rótulo de fim de turno faltando para ${r}`);
    assert.ok((S.stop[r].codePointAt(0) ?? 0) < 0x1f000, `glifo suspeito de emoji: ${S.stop[r]}`);
  }
});

/* ─────────── (3) arquivos alterados + texto que cabe na caixa ─────────── */

test('transcript: arquivos alterados fecham por padrão (a lista inteira ocupava a tela)', () => {
  assert.match(transcript, /<details class="section workingset">/,
    'arquivos alterados têm de ser um <details> (fechado por padrão) e não um cartão sempre aberto');
  // o resumo carrega o que se lê de relance; a lista e os botões ficam dentro
  const i = transcript.indexOf('<details class="section workingset">');
  const bloco = transcript.slice(i, transcript.indexOf('</details>', i));
  assert.match(bloco, /<summary/, 'sem <summary> não há como abrir/fechar');
  assert.match(bloco, /S\.workingSet\.summary\(/, 'o resumo tem de mostrar a contagem');
  assert.match(bloco, /class="ws-row"/, 'as linhas de arquivo saíram do bloco');
  // NOME acessível: `aria-label` no <summary> esconde a contagem de quem usa leitor de tela (o painel
  // anunciava só "Arquivos alterados"), e sem separador os dois spans colam ("alterados2 · +132 −3")
  assert.doesNotMatch(bloco, /<summary[^>]*aria-label/, 'summary com aria-label: a contagem deixa de ser anunciada');
  assert.match(bloco, /\{' '\}/, 'faltou o separador entre o título e a contagem no nome acessível');
});

test('css: a linha de arquivo alterado quebra e o caminho encolhe (sem rolagem horizontal)', () => {
  assert.match(rule('.ws-row'), /flex-wrap:\s*wrap/, 'sem quebra, a linha estoura o painel estreito');
  const path = rule('.ws-row .path');
  assert.match(path, /text-overflow:\s*ellipsis/, 'caminho longo sem reticências');
  assert.doesNotMatch(path, /max-width:\s*\d+%/, 'largura fixa em % volta a estourar o painel estreito');
  assert.match(path, /min-width:\s*0/, 'sem min-width:0 o flex não encolhe além do conteúdo');
});

test('css: o texto do tool/raciocínio quebra dentro da caixa (token comprido não estoura)', () => {
  // `pre-wrap` sozinho não quebra `src/de/um/caminho/muito/longo.rs` nem um JSON numa linha só
  for (const sel of ['.tool pre', 'details.thought pre']) {
    assert.match(rule(sel), /overflow-wrap:\s*anywhere/, `${sel} sem quebra de token comprido`);
    assert.match(rule(sel), /white-space:\s*pre-wrap/, `${sel} sem preservar as quebras do texto`);
  }
});

test('css: o aviso de fim de turno usa token --vscode-* (nada de cor literal)', () => {
  const r = rule('.turn-end');
  assert.match(r, /--vscode-/, 'cor literal no aviso de fim de turno');
  assert.match(rule('.turn-end.ok'), /--vscode-charts-green/);
  assert.match(rule('.turn-end.warn'), /--vscode-editorWarning-foreground/);
});

test('transcript: o tool ativo abre por efeito, não por `open` controlado', () => {
  // com `open={shouldOpen}` controlado, cada re-render (um por chunk) fechava o item que o usuário abriu
  assert.match(transcript, /useEffect\(\(\) => \{ const el = ref\.current; if \(el\) el\.open = shouldOpen; \}, \[shouldOpen\]\)/);
  assert.match(transcript, /open=\{mountedOpen\}/, 'o `open` do mount tem de ser valor de montagem, não o vivo');
  assert.match(transcript, /toolDetailOpen\(index, count, tool\.status\)/);
});
