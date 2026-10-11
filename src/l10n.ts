/**
 * Tradução do extension host.
 *
 * Chave = o próprio texto pt-BR (idioma de origem), não um identificador inventado: uma string
 * nova continua legível enquanto não há tradução, e o dicionário de cada idioma é só um mapa
 * texto→texto.
 *
 * Este módulo NÃO importa o runtime do `vscode`: módulos puros são testáveis sem o editor, e
 * `src/l10n.ts` é importado por features e catálogos que os testes carregam direto (um
 * `import * as vscode` aqui derruba a suíte inteira com MODULE_NOT_FOUND). O idioma entra por
 * `setLanguage(vscode.env.language)` na ativação — que reflete os language packs do VS Code.
 *
 * Sem tradução cadastrada, `tr()` devolve o texto pt-BR original: nunca quebra a UI.
 */
import { en } from './l10n.en';
import { ru } from './l10n.ru';
import { zhCN } from './l10n.zh-cn';

/** Idioma corrente do host (BCP-47 vindo de `vscode.env.language`). */
let language = 'pt-br';

export function setLanguage(tag: string): void { language = (tag || 'pt-br').toLowerCase(); }
export function language$(): string { return language; }

function dict(): Record<string, string> {
  if (language.startsWith('ru')) return ru;
  if (language.startsWith('zh')) return zhCN;
  if (language.startsWith('pt')) return {};   // pt-BR é a origem: nada a traduzir
  return en;
}

/** Traduz uma string de origem pt-BR para o idioma corrente. */
export function tr(source: string): string {
  return dict()[source] ?? source;
}
