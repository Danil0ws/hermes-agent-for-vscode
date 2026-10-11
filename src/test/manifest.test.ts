/**
 * Invariante do manifesto ↔ registro de comandos.
 *
 * Duas falhas reais já custaram caro aqui, e as duas passam por qualquer teste de unidade comum
 * porque só aparecem no editor:
 *
 * 1. Um id registrado em DOIS lugares (`extension.ts` e a feature dona). O segundo
 *    `registerCommand` LANÇA; se o bloco não tiver try/catch, tudo depois dele no mesmo bloco
 *    nunca registra — e como o lançamento é engolido pelo try/catch do loop de features, a UI
 *    só mostra "command not found" ao clicar, sem nenhum erro visível.
 * 2. Um comando DECLARADO no package.json que ninguém registra: aparece na Command Palette e nos
 *    menus (o VS Code desenha a partir do manifesto), e falha ao ser clicado.
 *
 * Este teste lê o manifesto e o código-fonte e cobra as duas coisas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// O bundle de teste roda a partir da raiz do repo (é de lá que `npm test` chama o runner), então
// `import.meta.url` NÃO serve: ele aponta para `dist-test/` e o `..` sai do projeto. Sobe até
// achar o package.json.
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
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** Ids que o código registra, com o arquivo de cada um. */
function registrations(): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  const add = (id: string, file: string) => byId.set(id, [...(byId.get(id) ?? []), file]);
  for (const file of sourceFiles(join(root, 'src'))) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    // `reg('id', …)` (extension.ts), `registerCommand('id', …)`, `register(ctx, deps, 'id', …)`
    for (const re of [/\breg\(\s*'([^']+)'/g, /registerCommand\(\s*'([^']+)'/g, /register\([^)]*?,\s*'([^']+)'/g]) {
      for (const m of src.matchAll(re)) add(m[1], rel);
    }
  }
  return byId;
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  contributes: {
    commands: { command: string; title: string }[];
    configuration: { properties: Record<string, unknown> };
  };
};
const declared = pkg.contributes.commands.map((c) => c.command);

/**
 * Comandos que o PRÓPRIO VS Code cria a partir do manifesto, e que por isso nunca aparecem num
 * `registerCommand` nosso: `<viewId>.focus` (e `resetViewLocation`) para toda view contribuída.
 */
function platformCommands(): Set<string> {
  const ids = new Set<string>();
  const views = (pkg.contributes as { views?: Record<string, { id: string }[]> }).views ?? {};
  for (const list of Object.values(views)) {
    for (const v of list) {
      ids.add(`${v.id}.focus`);
      ids.add(`${v.id}.resetViewLocation`);
    }
  }
  return ids;
}

test('manifesto: nenhum comando registra duas vezes (o 2º registerCommand lança)', () => {
  const dups = [...registrations().entries()].filter(([, files]) => files.length > 1);
  assert.deepEqual(dups, [], `registrados em mais de um lugar: ${JSON.stringify(dups)}`);
});

test('manifesto: todo comando declarado tem quem registre (senão a palette clica e falha)', () => {
  const regs = registrations();
  const orfaos = declared.filter((id) => !regs.has(id));
  assert.deepEqual(orfaos, [], `declarados sem registro: ${orfaos.join(', ')}`);
});

test('manifesto: os comandos que o código chama por id existem como literal no código', () => {
  // `executeCommand('x')` com id inexistente é o mesmo defeito, um passo adiante
  const regs = registrations();
  const chamados = new Set<string>();
  for (const file of sourceFiles(join(root, 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/executeCommand\(\s*'(hermes\.[^']+)'/g)) chamados.add(m[1]);
  }
  const plataforma = platformCommands();
  const quebrados = [...chamados].filter((id) => !regs.has(id) && !plataforma.has(id));
  assert.deepEqual(quebrados, [], `executeCommand para id não registrado: ${quebrados.join(', ')}`);
});

test('manifesto: títulos usam chaves de tradução (nada de texto solto)', () => {
  const soltos = pkg.contributes.commands.filter((c) => !/^%.+%$/.test(c.title));
  assert.deepEqual(soltos.map((c) => c.command), []);
});

test('manifesto: ícone de view container é STRING (objeto faz o VS Code descartar o container)', () => {
  // Schema real do VS Code (viewsContainers.<local>.items, lido do build 1.141):
  // required: ["id","title","icon"] e icon: { type: "string" }. Com `{light, dark}` o container
  // NÃO registra (o log só diz "a propriedade `icon` é obrigatória e deve ser do tipo `string`") e
  // todas as views dele caem em "Explorer".
  type Container = { id: string; icon?: unknown };
  const containers = (pkg.contributes as { viewsContainers?: Record<string, Container[]> }).viewsContainers ?? {};
  for (const [local, list] of Object.entries(containers)) {
    for (const c of list) {
      assert.equal(typeof c.icon, 'string', `${local}.${c.id}: icon precisa ser string`);
      assert.ok(existsSync(join(root, c.icon as string)), `${local}.${c.id}: arquivo de ícone não existe (${c.icon})`);
    }
  }
});

test('manifesto: toda chave de contributes.views aponta para um container declarado', () => {
  const containers = (pkg.contributes as { viewsContainers?: Record<string, { id: string }[]> }).viewsContainers ?? {};
  const ids = new Set(Object.values(containers).flat().map((c) => c.id));
  const orfas = Object.keys((pkg.contributes as { views?: Record<string, unknown> }).views ?? {}).filter((k) => !ids.has(k));
  assert.deepEqual(orfas, [], `views num container inexistente (vão para o Explorer): ${orfas.join(', ')}`);
});

test('manifesto: README cita só comando e configuração que existem', () => {
  // O README já derivou duas vezes (45→56 testes, 58→60 chaves): ele é a porta de entrada do repo e
  // da loja, então o que ele cita tem de existir no manifesto. Sem isso, o erro só aparece quando
  // alguém cola um comando da tabela na palette e não acontece nada.
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const en = JSON.parse(readFileSync(join(root, 'package.nls.json'), 'utf8')) as Record<string, string>;
  const titulos = new Set(pkg.contributes.commands.map((c) => en[c.title.slice(1, -1)] ?? c.title));
  const citados = [...readme.matchAll(/^\|\s*`Hermes: ([^`]+)`/gm)].map((m) => m[1]);
  assert.ok(citados.length >= 10, `tabela de comandos encolheu demais (${citados.length} linhas)?`);
  assert.deepEqual(citados.filter((t) => !titulos.has(t)), [], 'README cita comando que não existe');

  const cfg = new Set(Object.keys(pkg.contributes.configuration.properties));
  const chaves = [...new Set([...readme.matchAll(/`(hermes\.[\w.]+)`/g)].map((m) => m[1]))];
  assert.ok(chaves.length >= 8, `poucas chaves citadas (${chaves.length})?`);
  assert.deepEqual(chaves.filter((k) => !cfg.has(k)), [], 'README cita configuração que não existe');
});

test('manifesto: arquivos citados no README existem (doc apontando para o vazio)', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const alvos = new Set(
    [...readme.matchAll(/`((?:docs|media|scripts)\/[\w./-]+|CONTRIBUTING\.md|LICENSE|CHANGELOG\.md|package\.json)`/g)].map((m) => m[1]),
  );
  assert.ok(alvos.size >= 4, `poucos caminhos citados no README (${alvos.size})?`);
  assert.deepEqual([...alvos].filter((p) => !existsSync(join(root, p))), [], 'README aponta para arquivo inexistente');
});

test('manifesto: as 4 localidades cobrem as mesmas chaves do nls padrão', () => {
  const base = JSON.parse(readFileSync(join(root, 'package.nls.json'), 'utf8')) as Record<string, string>;
  const keys = Object.keys(base).sort();
  for (const loc of ['pt-br', 'ru', 'zh-cn']) {
    const other = JSON.parse(readFileSync(join(root, `package.nls.${loc}.json`), 'utf8')) as Record<string, string>;
    assert.deepEqual(Object.keys(other).sort(), keys, `package.nls.${loc}.json divergiu do padrão`);
    assert.deepEqual(Object.values(other).filter((v) => !v.trim()), [], `package.nls.${loc}.json tem valor vazio`);
  }
});
