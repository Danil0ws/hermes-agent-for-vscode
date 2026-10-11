/**
 * Idioma da webview. O host escreve `vscode.env.language` no `<html lang>` do HTML, então a
 * detecção acontece uma vez, no boot, sem passar pelo contrato nem exigir re-render reativo
 * (trocar o idioma do VS Code já pede reload da janela).
 *
 * O idioma é escolhido UMA vez e o `S`/`t` de cada webview é um Proxy que lê o bundle corrente —
 * assim nenhum componente precisa saber que existe mais de um idioma.
 */
export const LOCALES = ['en', 'pt-br', 'ru', 'zh-cn'] as const;
export type Locale = (typeof LOCALES)[number];

let currentLocale: Locale = 'en';

/** `pt-BR` → `pt-br`; `zh-Hans`/`zh-CN` → `zh-cn`; `ru-RU` → `ru`; desconhecido → `en`. */
export function normalizeLocale(tag: string | undefined): Locale {
  const t = (tag ?? '').toLowerCase();
  if (t.startsWith('pt')) return 'pt-br';
  if (t.startsWith('ru')) return 'ru';
  if (t.startsWith('zh')) return 'zh-cn';
  return 'en';
}

/** Proxies vivos: trocar o idioma tem de alcançar todos (bundle + formatação de número). */
const liveProxies: ((l: Locale) => void)[] = [];

/** Troca o idioma em execução. Também é o que os testes usam: fora do navegador não há `<html lang>`. */
export function setLocale(l: Locale): void {
  currentLocale = l;
  for (const set of liveProxies) set(l);
}

/** Alias histórico: a formatação de número sempre andou junto com o bundle. */
export const setCurrentLocale = setLocale;

export function detectLocale(): Locale {
  const l = normalizeLocale(typeof document !== 'undefined' ? document.documentElement.lang : undefined);
  setLocale(l);
  return l;
}

export function currentLocaleTag(): Locale { return currentLocale; }

/** Proxy de leitura sobre o bundle do idioma corrente. */
export function localeProxy<T extends object>(bundles: Record<Locale, T>, initial: Locale): T {
  let current: T = bundles[initial] ?? bundles.en;
  liveProxies.push((l) => { current = bundles[l] ?? bundles.en; });
  return new Proxy({} as T, {
    get: (_t: T, prop: string | symbol) => (current as Record<string | symbol, unknown>)[prop],
    has: (_t: T, prop: string | symbol) => prop in (current as object),
    ownKeys: () => Reflect.ownKeys(current as object),
    getOwnPropertyDescriptor: (_t: T, prop: string | symbol) => ({ enumerable: true, configurable: true, value: (current as never)[prop as never] }),
    set: () => false,
  } as never);
}

/** Formata número pelo idioma corrente (pt-BR usa 1.218; en/zh usam 1,218). */
export function num(n: number): string {
  const tag = { en: 'en', 'pt-br': 'pt-BR', ru: 'ru', 'zh-cn': 'zh-CN' }[currentLocale];
  return n.toLocaleString(tag);
}
