/**
 * Seletor de idioma do painel Gerenciar: escolhe o bundle pelo `<html lang>` que o host escreve
 * a partir de `vscode.env.language`.
 *
 * `t` é um Proxy sobre o bundle corrente — main.tsx, tabs.tsx e o host seguem usando `t.chave`.
 */
import { detectLocale, localeProxy, type Locale } from '../shared/l10n';
export { setLocale } from '../shared/l10n';
import { t as ptBR, type Strings } from './i18n.pt-br';
import { en } from './i18n.en';
import { ru } from './i18n.ru';
import { zhCN } from './i18n.zh-cn';

export type { Strings };

const bundles: Record<Locale, Strings> = { en, 'pt-br': ptBR, ru, 'zh-cn': zhCN };

export const t: Strings = localeProxy(bundles, detectLocale());
