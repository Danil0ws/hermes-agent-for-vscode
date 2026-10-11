/**
 * Guardas da lane A (host) dos anexos: chips com UMA fonte, corte por teto, referência textual
 * `arquivo:linha`, imagem colada e o roteamento do `publish`.
 *
 * Roda fora do Extension Host: importa os módulos puros (ContextManager, HermesSession) e lê o
 * FONTE de ChatViewProvider/features-context — nada aqui referencia o runtime do `vscode`.
 *   npx esbuild src/test/chips.test.ts --bundle --format=esm --platform=node \
 *     --external:vscode --outfile=/tmp/chips.test.mjs && node --test /tmp/chips.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHIP_MAX_TOKENS, MAX_IMAGE_BYTES, ContextManager, imageExt, isImageMime, refText, truncateChipText,
} from '../core/ContextManager.ts';
import { toContentBlocks } from '../core/HermesSession.ts';
import { estimateTokens } from '../utils/Tokens.ts';
import type { ContextChip } from '../core/types.ts';

const root = process.cwd();
const src = (p: string) => readFileSync(join(root, p), 'utf8');

/** ContextManager com deps mínimas (vs é usado só por pick/attach*, não por add/remove). */
function mgr(published: ContextChip[][]): ContextManager {
  return new ContextManager({
    vs: {} as never,
    publish: (chips) => published.push(chips),
    warnAt: () => 80,
    windowSize: () => undefined,
    log: () => {},
  });
}

/* ─────────── (2) corte por teto ─────────── */

test('corte por teto: guarda o COMEÇO, em fronteira de linha, e marca', () => {
  assert.deepEqual(truncateChipText('curto', CHIP_MAX_TOKENS), { text: 'curto', truncated: false });

  const line = 'linha de teste\n';              // 15 chars
  const text = line.repeat(1000);               // 15000 chars > 8000 (2000*4)
  const cut = truncateChipText(text, CHIP_MAX_TOKENS);
  assert.equal(cut.truncated, true);
  assert.ok(cut.text.length <= CHIP_MAX_TOKENS * 4, 'corte tem de respeitar o teto');
  assert.ok(text.startsWith(cut.text), 'guarda o começo do texto');
  assert.ok(cut.text.split('\n').every((l) => l === 'linha de teste'), 'corte em fronteira de linha');
  assert.ok(estimateTokens(cut.text) <= CHIP_MAX_TOKENS, 'tokens do texto guardado ≤ teto');

  // sem nenhum \n na janela: corta seco (não inventa fronteira)
  const blob = 'x'.repeat(9000);
  assert.deepEqual(truncateChipText(blob, CHIP_MAX_TOKENS), { text: 'x'.repeat(8000), truncated: true });
});

test('ContextManager.add corta o chip e recalcula tokens sobre o TEXTO GUARDADO', () => {
  const pubs: ContextChip[][] = [];
  const m = mgr(pubs);
  const big = 'palavra '.repeat(2000); // 16000 chars
  const chip = m.add({ kind: 'file', label: 'big.ts', ref: '/w/big.ts', text: big });
  assert.equal(chip.truncated, true, 'anexo grande tem de ser marcado como cortado');
  assert.ok(chip.text!.length <= CHIP_MAX_TOKENS * 4);
  assert.ok(big.startsWith(chip.text!), 'o texto guardado é o começo do original');
  assert.equal(chip.tokensEstimate, estimateTokens(chip.text!), 'tokens recalculados sobre o guardado');

  // o que é publicado é o texto cortado (é o que vai ao modelo)
  assert.equal(pubs.at(-1)![0].text, chip.text);

  // imagem (base64) NUNCA é cortada
  const img = 'A'.repeat(9000);
  const imgChip = m.add({ kind: 'image', label: 'x.png', ref: '/tmp/x.png', text: img, imagePath: '/tmp/x.png' });
  assert.equal(imgChip.truncated, undefined, 'imagem não tem `truncated`');
  assert.equal(imgChip.text, img, 'base64 da imagem não pode ser cortado');
});

/* ─────────── (1) UMA fonte de chips ─────────── */

test('remover um chip publica a lista SEM ele (é o que o `init` seguinte espelha)', () => {
  const pubs: ContextChip[][] = [];
  const m = mgr(pubs);
  const a = m.add({ kind: 'file', label: 'a.ts', ref: '/w/a.ts', text: 'x' });
  assert.equal(pubs.at(-1)!.length, 1);
  m.remove(a.id);
  assert.deepEqual(pubs.at(-1), [], 'a lista publicada depois da remoção não traz o chip de volta');
  assert.deepEqual(m.chips, []);
});

test('provider: `setChips` é o ponto de escrita e `send` NÃO grava cópia paralela', () => {
  const provider = src('src/ui/ChatViewProvider.ts');
  assert.match(provider, /setChips\(chips: ContextChip\[\]\): void \{/, 'falta setChips');
  assert.match(provider, /\{ type: 'chips', chips \}/, 'setChips tem de postar `chips` para a webview');
  assert.match(provider, /sessionFor\(\)\?\.setChips\(chips\)/, 'setChips tem de espelhar na sessão ativa');
  assert.match(provider, /chips: this\.chips,/, 'initialState tem de ler a lista única');

  const send = provider.slice(provider.indexOf('private async send('), provider.indexOf('  async start('));
  assert.ok(send.length > 0, 'não achei o corpo do send');
  assert.match(send, /const chips = this\.chips;/, 'send tem de ler a lista única');
  assert.doesNotMatch(send, /this\.chips\s*=/, 'send ainda grava a lista (a cópia paralela do defeito)');
});

test('feature context: `publish` vai para o PROVIDER e chip sem sessão não é descartado', () => {
  const ctx = src('src/features/context.ts');
  assert.match(ctx, /publish: \(chips\) => deps\.provider\.setChips\(chips\)/, 'publish não roteia para o provider');
  assert.doesNotMatch(ctx, /if \(s\) s\.setChips/, 'publish ainda publica direto na sessão');
  assert.doesNotMatch(ctx, /chips sem sessão ativa/, 'chip sem sessão ainda é descartado com um log');
});

/* ─────────── (3) referência textual ao anexar ─────────── */

test('refText: caminho relativo com :linha / :linha-linha, entre crases e com espaço no fim', () => {
  assert.equal(refText('.vscodeignore', [4, 4]), '`.vscodeignore:4` ');
  assert.equal(refText('src/a.ts', [4, 9]), '`src/a.ts:4-9` ');
  assert.equal(refText('src/a.ts'), '`src/a.ts` ');
});

test('provider: anexar arquivo/seleção manda a referência; a colagem tem handler', () => {
  const provider = src('src/ui/ChatViewProvider.ts');
  assert.match(provider, /type: 'draft\/insert'/, 'host não manda draft/insert ao anexar');
  assert.match(provider, /refText\(/, 'anexo não usa refText');
  assert.match(provider, /case 'attachImage':/, 'sem handler de attachImage');
});

/* ─────────── (4) imagem colada ─────────── */

test('imagem colada: mime, extensão do temporário e teto de tamanho', () => {
  assert.equal(isImageMime('image/png'), true);
  assert.equal(isImageMime('image/jpeg'), true);
  assert.equal(isImageMime('text/plain'), false, 'só image/* é aceito');
  assert.equal(imageExt('image/jpeg'), '.jpg');
  assert.equal(imageExt('image/jpg'), '.jpg');
  assert.equal(imageExt('image/gif'), '.gif');
  assert.equal(imageExt('image/webp'), '.webp');
  assert.equal(imageExt('image/png'), '.png');
  assert.equal(MAX_IMAGE_BYTES, 10 * 1024 * 1024);
});

test('o chip de imagem vira BLOCO de imagem no prompt (toContentBlocks)', () => {
  const chip: ContextChip = {
    id: 'i1', kind: 'image', label: 'colada.png', ref: '/tmp/colada.png',
    text: 'QUJD', tokensEstimate: 1, imagePath: '/tmp/colada.png',
  };
  const blocks = toContentBlocks('veja', [chip]) as unknown as { type: string; data?: string }[];
  const img = blocks.find((b) => b.type === 'image');
  assert.ok(img, 'chip kind:image não virou bloco de imagem');
  assert.equal(img!.data, 'QUJD', 'o base64 do chip tem de chegar no bloco de imagem');
});
