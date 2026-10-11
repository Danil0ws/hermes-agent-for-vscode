/**
 * Ícone Codicon (`@vscode/codicons`), o conjunto oficial do VS Code — nada de pacote próprio
 * nem de glifo tipográfico (que pode renderizar como emoji em alguns sistemas).
 *
 * O CSS do codicon é ligado no HTML da webview (codicon.css + a fonte), por isso aqui só
 * emitimos a classe. `name` é o nome sem o prefixo `codicon-` (ex.: <Icon name="gear" />).
 */
export function Icon({ name, spin, label, cls }: {
  name: string;
  spin?: boolean;
  /** rótulo acessível; sem ele o ícone é decorativo e fica aria-hidden */
  label?: string;
  cls?: string;
}) {
  const classes = ['codicon', `codicon-${name}`, spin ? 'codicon-modifier-spin' : '', cls ?? '']
    .filter(Boolean).join(' ');
  return <i class={classes} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
