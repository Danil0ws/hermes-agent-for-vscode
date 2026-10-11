/**
 * Catálogo de modelos — cache do que o agente anuncia em `session/new`
 * (`models.availableModels`, cada item `{modelId, name, description}`).
 *
 * O que o ACP NÃO dá: janela de contexto por modelo, capacidades (visão/raciocínio) nem custo.
 * Só o modelo ATIVO tem janela conhecida — e só depois de um `usage_update.size`. Aqui nunca
 * inventamos: os demais ficam "desconhecida".
 *
 * Favoritos e "usados recentemente" são a única coisa que persistimos, num arquivo JSON sob
 * `globalStorageUri` — nunca em settings (o painel não guarda estado paralelo à config real).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ModelInfo } from './types';

export interface ModelGroup { provider: string; label: string; models: ModelInfo[] }

export interface ModelSnapshot {
  groups: ModelGroup[];
  total: number;
  current?: string;
  favorites: string[];
  recent: string[];
  /** janela do modelo ATIVO, só quando o agente reportou (`usage_update.size`) */
  activeWindow?: { size: number; used: number; modelId?: string };
}

export const MAX_RECENT = 8;

/** `provider:modelo` -> `provider`; `custom:nome:modelo` -> `custom:nome`. */
export function providerOf(modelId: string): string {
  const i = modelId.indexOf(':');
  if (i < 0) return 'outros';
  const head = modelId.slice(0, i);
  if (head !== 'custom') return head;
  const j = modelId.indexOf(':', i + 1);
  return j < 0 ? 'custom' : modelId.slice(0, j);
}

/** Nome de exibição do provider: usa `description: "Provider: X"` quando existir. */
export function providerLabel(models: ModelInfo[], fallback: string): string {
  const d = models.find((m) => m.description)?.description ?? '';
  const m = /Provider:\s*(.+)/.exec(d);
  return m ? m[1].trim() : fallback;
}

export function groupByProvider(models: ModelInfo[]): ModelGroup[] {
  const map = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const p = providerOf(m.modelId);
    const list = map.get(p);
    if (list) list.push(m); else map.set(p, [m]);
  }
  return [...map.entries()]
    .map(([provider, list]) => ({ provider, label: providerLabel(list, provider), models: list }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

export function filterModels(models: ModelInfo[], query: string): ModelInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter((m) =>
    m.modelId.toLowerCase().includes(q) ||
    m.name.toLowerCase().includes(q) ||
    (m.description ?? '').toLowerCase().includes(q));
}

/** União estável: mantém a ordem de `a` e acrescenta só o que existe em `b`. */
export function mergeFavorites(a: string[], b: string[]): string[] {
  const out = [...a];
  for (const id of b) if (!out.includes(id)) out.push(id);
  return out;
}

export interface FavoritesFile { favorites: string[]; recent: string[] }

/** Leitura tolerante: arquivo ausente/corrompido = vazio (nunca lança). */
export function readFavorites(file: string): FavoritesFile {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<FavoritesFile>;
    const str = (x: unknown): x is string => typeof x === 'string';
    return { favorites: (raw.favorites ?? []).filter(str), recent: (raw.recent ?? []).filter(str) };
  } catch {
    return { favorites: [], recent: [] };
  }
}

export function writeFavorites(file: string, data: FavoritesFile): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ favorites: data.favorites, recent: data.recent }, null, 2), 'utf8');
  } catch {
    /* disco indisponível: favoritos vivem na memória desta sessão — nunca quebra a UI */
  }
}

export class ModelCatalog {
  private models: ModelInfo[] = [];
  private current?: string;
  private window?: { size: number; used: number; modelId?: string };
  private fav: FavoritesFile;

  constructor(private readonly storeFile: string) {
    this.fav = readFavorites(storeFile);
  }

  /** cache vindo de `HermesSession.snapshot.models`; trocar o ativo invalida a janela. */
  setModels(models: ModelInfo[], current?: string): void {
    if (current && current !== this.current) {
      this.window = undefined;
      this.markUsed(current);
    }
    this.models = models;
    this.current = current;
  }

  /** invalida o catálogo (nova sessão / desconexão): o agente remonta os modelos por sessão. */
  invalidate(): void {
    this.models = [];
    this.current = undefined;
    this.window = undefined;
  }

  get cached(): boolean { return this.models.length > 0; }
  get active(): string | undefined { return this.current; }

  /** só o modelo ATIVO tem janela, e só quando o agente reportou (`usage_update.size`). */
  setUsage(size: number, used: number): void {
    this.window = size > 0 ? { size, used, modelId: this.current } : undefined;
  }

  markUsed(modelId: string): void {
    this.current = modelId;
    this.fav.recent = [modelId, ...this.fav.recent.filter((x) => x !== modelId)].slice(0, MAX_RECENT);
    writeFavorites(this.storeFile, this.fav);
  }

  setFavorite(modelId: string, on: boolean): void {
    this.fav.favorites = on
      ? mergeFavorites(this.fav.favorites, [modelId])
      : this.fav.favorites.filter((x) => x !== modelId);
    writeFavorites(this.storeFile, this.fav);
  }

  snapshot(): ModelSnapshot {
    return {
      groups: groupByProvider(this.models),
      total: this.models.length,
      current: this.current,
      favorites: this.fav.favorites,
      recent: this.fav.recent,
      activeWindow: this.window,
    };
  }
}
