/**
 * Shell da webview "Gerenciar": abas verticais com navegação por teclado.
 *
 * Acessibilidade: `role="tablist"`/`role="tab"`/`role="tabpanel"`, `aria-selected`,
 * `aria-current`, roving tabindex e setas ↑/↓/Home/End — como o painel Settings do VS Code.
 */
import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { ready } from '../shared/bridge';
import { manageState, onManage, sendManage } from './store';
import { t } from './i18n';
import {
  AdvancedTab, AgentsTab, ApprovalsTab, ContextTab, InstructionsTab, ModelsTab, SkillsTab, ToolsTab,
} from './tabs';
import type { ManageTab } from './protocol';
import '@vscode/codicons/dist/codicon.css';
import './styles.css';

const TABS: ManageTab[] = ['models', 'skills', 'tools', 'instructions', 'context', 'agents', 'approvals', 'advanced'];

const VIEWS: Record<ManageTab, ComponentType> = {
  models: ModelsTab, skills: SkillsTab, tools: ToolsTab, instructions: InstructionsTab,
  context: ContextTab, agents: AgentsTab, approvals: ApprovalsTab, advanced: AdvancedTab,
};

function App() {
  useEffect(() => {
    onManage((m) => { if (m.type === 'manage/state') manageState.value = m.state; });
    ready();
  }, []);

  const s = manageState.value;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (tab: ManageTab) => { if (tab !== s.tab) sendManage({ type: 'manage/tab', tab }); };

  const onKey = (e: KeyboardEvent, i: number) => {
    const last = TABS.length - 1;
    let j: number | null = null;
    if (e.key === 'ArrowDown') j = i === last ? 0 : i + 1;
    else if (e.key === 'ArrowUp') j = i === 0 ? last : i - 1;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = last;
    if (j === null) return;
    e.preventDefault();
    refs.current[j]?.focus();
    select(TABS[j]);
  };

  const View = VIEWS[s.tab];

  return (
    <div class="manage">
      <nav class="tabs" role="tablist" aria-orientation="vertical" aria-label={t.tabsLabel}>
        {TABS.map((id, i) => (
          <button
            key={id}
            ref={(el) => { refs.current[i] = el; }}
            id={`tab-${id}`}
            role="tab"
            class={id === s.tab ? 'tab active' : 'tab'}
            aria-selected={id === s.tab}
            aria-current={id === s.tab ? 'page' : undefined}
            aria-controls={`panel-${id}`}
            tabindex={id === s.tab ? 0 : -1}
            onClick={() => select(id)}
            onKeyDown={(e) => onKey(e, i)}
          >{t.tabs[id]}</button>
        ))}
      </nav>

      <section class="panel" role="tabpanel" id={`panel-${s.tab}`} aria-labelledby={`tab-${s.tab}`} tabindex={-1}>
        <h2>{t.tabs[s.tab]}</h2>
        {s.restricted && <p class="notice warning" role="status">{t.common.restricted}</p>}
        {s.notice && <p class={`notice ${s.notice.level}`} role="status">{s.notice.text}</p>}
        <View />
      </section>
    </div>
  );
}

render(<App />, document.getElementById('root')!);
