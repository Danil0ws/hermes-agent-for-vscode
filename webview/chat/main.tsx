/**
 * Webview do chat (M1 streaming + M2/M3/M5 do lado visual).
 * Só UI: nenhuma chamada de rede, todo estado vem do extension host pelo contrato (HostToWebview).
 * O roteamento por aba vive em `router.ts` (testável sem DOM).
 */
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { onMessage, ready, send } from '../shared/bridge';
import { lastStop, notice, state } from './store';
import { applyHost } from './router';
import { S } from './i18n';
import { Transcript } from './transcript';
import { Composer } from './composer';
import { TabBar } from './tabbar';
import '@vscode/codicons/dist/codicon.css';
import './styles.css';
import './tabs.css';

/* ─────────── app ─────────── */

function App() {
  useEffect(() => {
    onMessage(applyHost);
    ready();
  }, []);
  const n = notice.value;
  const cancelled = lastStop.value === 'cancelled';
  return (
    <div class="app">
      <TabBar
        tabs={state.value.tabs}
        active={state.value.activeTab}
        onActivate={(id) => send({ type: 'activateTab', tab: id })}
        onClose={(id) => send({ type: 'closeTab', tab: id })}
        onRename={(id, title) => send({ type: 'renameTab', tab: id, title })}
        onNew={() => send({ type: 'newTab' })}
        onNewWorktree={() => send({ type: 'newTab', worktree: {} })}
      />
      {cancelled && <div class="notice info" role="status">{S.notice.cancelled}</div>}
      {n && <div class={`notice ${n.level}`} role="status">{n.text}</div>}
      <Transcript />
      <Composer />
    </div>
  );
}

render(<App />, document.getElementById('root')!);
