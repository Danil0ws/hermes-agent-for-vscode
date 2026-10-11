/**
 * Guarda de idioma: literal pt-BR visível ao usuário só entra na UI através de `tr()`.
 *
 * O host tem um dicionário por idioma (`src/l10n.<locale>.ts`) e a regra do projeto é passar TODO
 * texto visível por `tr('texto pt-BR')`. Sem isso, um literal solto aparece em português mesmo com o
 * VS Code em en/ru/zh-cn — foi assim que 48 strings (itens de árvore, títulos, notificações) ficaram
 * presas em pt-BR.
 *
 * Esta guarda varre `src/**\/*.ts` (fora os dicionários `l10n.*.ts` e os testes) e falha em qualquer
 * literal com acento pt-BR que NÃO esteja dentro de `tr(...)` nem seja linha de log (o log não vai à
 * UI). Acusa `arquivo:linha`. Comentários são ignorados.
 *
 * Exceções (lista curta, por CONTEÚDO e não por linha — a linha muda a cada edição): os prompts que a
 * extensão ENVIA ao modelo não são chrome da UI e por isso não passam por `tr()`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ACCENT = /[ãçõáéíóúâêôÃÇÕÁÉÍÓÚ]/;
/** Início de uma chamada "segura": `tr(...)`, `log(...)`, `this.log(...)`, `console.log(...)`. */
const SAFE_CALL = /\b(?:tr|log|console)\s*(?:\.\s*\w+\s*)?\(/y;

/** Conteúdo enviado ao MODELO (não é chrome): isento por texto, para não quebrar a cada edição. */
const MODEL_PROMPTS = [
  'Explique este código: ',        // extension.ts — hermes.explainSelection
  'Pergunta sobre esta seleção: ', // extension.ts — hermes.askAboutSelection
];

// O bundle de teste roda da raiz do repo (`npm test`), então `import.meta.url` não serve: sobe até
// achar o package.json (mesmo padrão de manifest.test.ts).
function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = join(dir, '..');
  }
  throw new Error(`package.json não encontrado a partir de ${start}`);
}
const root = findRoot(process.cwd());

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Linhas com comentários removidos (bloco `/* … *\/` entre linhas e `//`, sem cortar `://`). */
function stripComments(text: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of text.split('\n')) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end < 0) { out.push(''); continue; }
      line = line.slice(end + 2);
      inBlock = false;
    }
    for (;;) {
      const start = line.indexOf('/*');
      if (start < 0) break;
      const end = line.indexOf('*/', start + 2);
      if (end < 0) { line = line.slice(0, start); inBlock = true; break; }
      line = line.slice(0, start) + line.slice(end + 2);
    }
    let cut = -1;
    for (let j = 0; ; ) {
      const k = line.indexOf('//', j);
      if (k < 0) break;
      if (k > 0 && line[k - 1] === ':') { j = k + 2; continue; } // não corta `https://…`
      cut = k; break;
    }
    out.push(cut >= 0 ? line.slice(0, cut) : line);
  }
  return out;
}

/** Linhas (1-based) com literal acentuado fora de `tr()`/log. */
export function violations(path: string): number[] {
  const lines = stripComments(readFileSync(path, 'utf8'));
  const bad: number[] = [];
  let depth = 0; // > 0: dentro de um tr(...)/log(...) ainda aberto (cobre chamadas multi-linha)
  for (let n = 0; n < lines.length; n++) {
    const code = lines[n];
    if (MODEL_PROMPTS.some((s) => code.includes(s))) continue;
    for (let i = 0; i < code.length; i++) {
      if (depth === 0) {
        SAFE_CALL.lastIndex = i;
        const m = SAFE_CALL.exec(code);
        if (m && m.index === i) { depth++; i += m[0].length - 1; continue; }
      }
      const ch = code[i];
      if (ch === '(') { if (depth > 0) depth++; }
      else if (ch === ')') { if (depth > 0) depth--; }
      else if (depth === 0 && ACCENT.test(ch)) { bad.push(n + 1); break; }
    }
  }
  return bad;
}

test('l10n: nenhum literal pt-BR visível fora de tr() (fora logs e prompts do modelo)', () => {
  const found: string[] = [];
  for (const file of sourceFiles(join(root, 'src'))) {
    const rel = file.slice(root.length + 1);
    const base = rel.slice(rel.lastIndexOf('/') + 1);
    if (rel.startsWith('src/test/')) continue;     // testes citam pt-BR em asserções de propósito
    if (base.startsWith('l10n.')) continue;        // dicionários: a CHAVE é o próprio texto pt-BR
    const bad = violations(file);
    if (bad.length) found.push(`${rel}: ${bad.join(', ')}`);
  }
  assert.deepEqual(found, [], `literal pt-BR fora de tr() (passe por tr(...) ou justifique no teste):\n${found.join('\n')}`);
});
