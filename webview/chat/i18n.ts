/**
 * Seletor de idioma da webview do chat: escolhe o bundle pelo `<html lang>` que o host escreve
 * a partir de `vscode.env.language`.
 *
 * `S` é um Proxy sobre o bundle corrente, então os componentes continuam escrevendo `S.chave` e
 * não sabem que existe mais de um idioma.
 */
import { detectLocale, localeProxy, type Locale } from '../shared/l10n';
import { ptBR, num, type Strings } from './i18n.pt-br';
import { en } from './i18n.en';
import { ru } from './i18n.ru';
import { zhCN } from './i18n.zh-cn';

export { num } from '../shared/l10n';
export type { Strings };

const bundles: Record<Locale, Strings> = { en, 'pt-br': ptBR, ru, 'zh-cn': zhCN };

export const S: Strings = localeProxy(bundles, detectLocale());
