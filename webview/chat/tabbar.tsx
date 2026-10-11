/**
 * Barra de abas do chat. Uma aba = uma conversa (uma sessão do ACP); a aba ativa é a que o
 * transcript renderiza, e as demais continuam acumulando em background (lane ativa).
 *
 * Cada aba anuncia o estado da lane: girando quando `busy`, ponto de aviso quando `waiting`
 * (aprovação pendente), e o `title` traz agente · cwd · branch.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { S } from './i18n';
import { Icon } from '../shared/icon';
import type { TabInfo } from '../../src/core/types';

export interface TabBarProps {
  tabs: TabInfo[];
  active: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNew: () => void;
  onNewWorktree: () => void;
}

/** Tooltip: agente · cwd · branch (a aba é o indicador de lane — sem painel novo). */
function tabTip(t: TabInfo): string {
  const lane = t.lane ? ` · ${S.tabs.laneTip(t.lane.path)}` : '';
  const state = t.busy ? ` · ${S.tabs.busy}` : t.waiting ? ` · ${S.tabs.waiting}` : '';
  return `${t.agent || 'hermes'} · ${t.cwd}${lane}${state}`;
}

function RenameInput({ value, onCommit, onCancel }: {
  value: string; onCommit: (v: string) => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      class="tab-rename"
      value={value}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onCommit((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit((e.target as HTMLInputElement).value);
        else if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

export function TabBar({ tabs, active, onActivate, onClose, onRename, onNew, onNewWorktree }: TabBarProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const commit = (id: string, value: string) => {
    setEditing(null);
    if (value.trim()) onRename(id, value.trim());
  };

  return (
    <div class="tabbar" role="tablist" aria-label={S.tabs.new}>
      <button class="tab-add" title={S.tabs.newTip} aria-label={S.tabs.new} onClick={onNew}>
        <Icon name="add" />
      </button>
      <button class="tab-add" title={S.tabs.newWorktreeTip} aria-label={S.tabs.newWorktree} onClick={onNewWorktree}>
        <Icon name="git-branch" />
      </button>
      <div class="tabbar-strip">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <div
              key={t.id}
              class={`tab ${isActive ? 'active' : ''}`}
              role="tab"
              aria-selected={isActive}
              title={tabTip(t)}
              onClick={() => onActivate(t.id)}
              onDblClick={() => setEditing(t.id)}
            >
              {t.busy && <Icon name="loading" spin cls="tab-state" label={S.tabs.busy} />}
              {!t.busy && t.waiting && <Icon name="bell-dot" cls="tab-state warn" label={S.tabs.waiting} />}
              {editing === t.id ? (
                <RenameInput value={t.title} onCommit={(v) => commit(t.id, v)} onCancel={() => setEditing(null)} />
              ) : (
                <span class="tab-label">{t.title || S.tabs.noSession}</span>
              )}
              <button
                class="tab-x"
                title={S.tabs.closeTip}
                aria-label={S.tabs.close}
                onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
              >×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
