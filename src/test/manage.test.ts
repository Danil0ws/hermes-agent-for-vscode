/**
 * Testes da lógica pura do painel "Gerenciar" (sem VS Code, sem rede):
 * parser do frontmatter de SKILL.md, agrupamento do catálogo de modelos e favoritos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  filterModels, groupByProvider, mergeFavorites, providerOf, readFavorites, writeFavorites, ModelCatalog,
} from '../core/ModelCatalog.ts';
import { parseFrontmatter, parseSkill } from '../core/SkillCatalog.ts';

/* ─────────── frontmatter do SKILL.md ─────────── */

test('frontmatter: name/description/version e tags sob metadata.hermes', () => {
  const md = [
    '---',
    'name: minha-skill',
    'description: faz coisas úteis',
    "version: '1.2'",
    'metadata:',
    '  hermes:',
    '    tags:',
    '      - alpha',
    '      - beta',
    '---',
    '',
    '# minha-skill',
  ].join('\n');
  const fm = parseFrontmatter(md);
  assert.equal(fm.name, 'minha-skill');
  assert.equal(fm.description, 'faz coisas úteis');
  assert.equal(fm.version, '1.2');
  assert.deepEqual(fm.tags, ['alpha', 'beta']);
  assert.equal(fm.hub, false);
});

test('frontmatter: tags inline no topo e caso sem tags (usa o 1º parágrafo)', () => {
  const inline = parseFrontmatter('---\nname: a\ntags: [x, y]\n---\ncorpo\n');
  assert.deepEqual(inline.tags, ['x', 'y']);

  const semTags = parseFrontmatter('---\nname: b\ndescription: d\n---\ncorpo\n');
  assert.deepEqual(semTags.tags, []);
  assert.equal(semTags.name, 'b');

  // sem frontmatter: nome cai na pasta, descrição no primeiro parágrafo do corpo
  const info = parseSkill('# título\n\nresumo do corpo\n', '/tmp/b/SKILL.md', 'user', 'b');
  assert.equal(info.name, 'b');
  assert.equal(info.description, 'resumo do corpo');

  // source: hub declarado pela própria skill -> escopo hub
  const hub = parseSkill('---\nname: h\nmetadata:\n  hermes:\n    source: hub\n---\n', '/x/SKILL.md', 'user', 'x');
  assert.equal(hub.scope, 'hub');
});

/* ─────────── catálogo de modelos ─────────── */

test('modelos: agrupamento por provider (id `provider:modelo`)', () => {
  const models = [
    { modelId: 'nous:anthropic/claude-fable-5.1', name: 'Nous Portal · anthropic/claude-fable-5.1', description: 'Provider: Nous Portal' },
    { modelId: 'nous:openai/gpt-6-astra', name: 'Nous Portal · openai/gpt-6-astra', description: 'Provider: Nous Portal' },
    { modelId: 'opencode-go:deepseek-v4.1-flash', name: 'OpenCode Go · deepseek-v4.1-flash', description: 'Provider: OpenCode Go' },
    { modelId: 'custom:meu-endpoint:llama', name: 'Meu endpoint · llama' },
  ];
  const groups = groupByProvider(models);
  assert.deepEqual(groups.map((g) => g.provider), ['custom:meu-endpoint', 'nous', 'opencode-go']);
  const nous = groups.find((g) => g.provider === 'nous')!;
  assert.equal(nous.models.length, 2);
  assert.equal(nous.label, 'Nous Portal');
  assert.equal(providerOf('sem-provider'), 'outros');
  assert.equal(filterModels(models, 'deepseek').length, 1);
  assert.equal(filterModels(models, '').length, 4);
});

/* ─────────── favoritos (JSON em globalStorage) ─────────── */

test('favoritos: leitura tolerante, merge estável e persistência', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hermes-fav-'));
  const file = join(dir, 'model-favorites.json');
  try {
    assert.deepEqual(readFavorites(file), { favorites: [], recent: [] }, 'arquivo ausente = vazio');

    writeFavorites(file, { favorites: ['a'], recent: ['x'] });
    assert.deepEqual(readFavorites(file), { favorites: ['a'], recent: ['x'] });

    assert.deepEqual(mergeFavorites(['a', 'b'], ['b', 'c']), ['a', 'b', 'c'], 'união sem duplicar, ordem de a');

    const cat = new ModelCatalog(file);
    cat.setModels([{ modelId: 'p:m', name: 'P · m' }], 'p:m');
    cat.setFavorite('p:m', true);
    cat.setFavorite('p:z', true);
    const snap = cat.snapshot();
    assert.deepEqual(snap.favorites, ['a', 'p:m', 'p:z'], 'herda o arquivo e acrescenta');
    assert.equal(snap.current, 'p:m');
    assert.deepEqual(snap.recent, ['p:m', 'x'], 'recém-usado vai para o topo');

    cat.setFavorite('p:m', false);
    assert.deepEqual(cat.snapshot().favorites, ['a', 'p:z']);

    // janela de contexto: só o modelo ATIVO, e só com usage reportado
    assert.equal(cat.snapshot().activeWindow, undefined);
    cat.setUsage(200_000, 1_234);
    assert.deepEqual(cat.snapshot().activeWindow, { size: 200_000, used: 1_234, modelId: 'p:m' });
    cat.setUsage(0, 0);
    assert.equal(cat.snapshot().activeWindow, undefined, 'sem size reportado = desconhecida');

    // invalidar (nova sessão) limpa catálogo e janela, preserva favoritos
    cat.invalidate();
    assert.equal(cat.cached, false);
    assert.deepEqual(cat.snapshot().favorites, ['a', 'p:z']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
