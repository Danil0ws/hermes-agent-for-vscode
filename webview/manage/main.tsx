/**
 * Webview do painel "Gerenciar" (M6, esqueleto navegável).
 *
 * Regra dura: este painel NÃO guarda estado próprio. Ele lê e escreve a configuração
 * real (`~/.hermes/config.yaml`, `~/.hermes/skills`, settings da extensão) ou chama a CLI.
 * Enquanto isso não existe, as abas explicam de onde o dado virá — nada é fingido.
 */
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { onMessage, ready, send } from '../shared/bridge';
import './styles.css';

const TABS = [
  ['models', 'Modelos', 'Catálogo vem de `session/new.models` (id `provider:modelo`). Janela de contexto só do modelo ativo, via `usage_update`.'],
  ['skills', 'Skills', 'Não existe no ACP. Fonte real: `~/.hermes/skills/**/SKILL.md` (+ skills de projeto) e `hermes skills`.'],
  ['tools', 'Ferramentas e MCP', 'Não existe no ACP (`configOptions` volta vazio). Fonte real: `platform_toolsets.acp` e `agent.disabled_toolsets` no config.yaml; `hermes tools` e `hermes mcp`.'],
  ['instructions', 'Instruções', 'AGENTS.md, .hermes.md, CLAUDE.md e SOUL.md detectados no workspace e no perfil.'],
  ['context', 'Contexto e uso', '`usage_update` (usado/total reais) + detalhamento estimado localmente, sempre rotulado.'],
  ['agents', 'Agentes/Perfis', 'Configuração de agente da extensão + `hermes profile`. Botão "Testar conexão" roda `hermes acp --check`.'],
  ['approvals', 'Aprovações', 'Política da extensão + `command_allowlist` do Hermes; `hermes approvals suggest/test`.'],
  ['advanced', 'Avançado', 'Log de tráfego, caminhos (`hermes config path`), versão e `hermes doctor`.'],
] as const;

type Tab = typeof TABS[number][0];

function App() {
  const [tab, setTab] = useState<Tab>('models');
  onMessage((m) => {
    if (m.type === 'init') ready();
  });
  const current = TABS.find(([id]) => id === tab)!;
  return (
    <div class="manage">
      <nav class="tabs" aria-label="Seções de gerenciamento">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            class={id === tab ? 'tab active' : 'tab'}
            aria-current={id === tab}
            onClick={() => setTab(id)}
          >{label}</button>
        ))}
      </nav>
      <section class="panel" aria-label={current[1]}>
        <h2>{current[1]}</h2>
        <p>{current[2]}</p>
        <p class="hint">Esta tela é preenchida no M6 lendo a configuração real do Hermes — sem estado paralelo.</p>
        <div class="row">
          <button class="secondary" onClick={() => send({ type: 'openCli' })}>Abrir a CLI</button>
        </div>
      </section>
    </div>
  );
}

render(<App />, document.getElementById('root')!);
