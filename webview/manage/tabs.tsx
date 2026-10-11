/**
 * Componentes das abas do painel "Gerenciar". Só leitura/escrita pela ponte:
 * nada de rede, nada de estado paralelo — o que se vê vem do estado que o host envia.
 */
import { useState } from 'preact/hooks';
import { manageState, sendManage } from './store';
import { t } from './i18n';
import { Icon } from '../shared/icon';

const nf = (n: number) => n.toLocaleString('pt-BR');

/* ─────────── Modelos ─────────── */

export function ModelsTab() {
  const m = manageState.value.models;
  const [q, setQ] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const needle = q.trim().toLowerCase();
  const groups = m.groups
    .map((g) => ({
      ...g,
      models: g.models.filter((x) =>
        (!needle || `${x.modelId} ${x.name} ${x.description ?? ''}`.toLowerCase().includes(needle)) &&
        (!onlyFav || m.favorites.includes(x.modelId))),
    }))
    .filter((g) => g.models.length > 0);
  const visible = groups.reduce((a, g) => a + g.models.length, 0);

  if (!m.available) return <p class="hint">{t.models.emptyNoSession}</p>;

  return (
    <>
      <div class="toolrow">
        <input class="search" type="search" placeholder={t.common.search} aria-label={t.common.search}
          value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <label class="check">
          <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav((e.target as HTMLInputElement).checked)} />
          {t.models.onlyFavorites}
        </label>
        <span class="spacer" />
        <span class="count">{t.models.count(visible, m.total)}</span>
      </div>

      {m.recent.length > 0 && (
        <div class="chips" aria-label={t.models.recent}>
          <span class="chip-label">{t.models.recent}:</span>
          {m.recent.map((id) => (
            <button class="chip" key={id} onClick={() => sendManage({ type: 'manage/model/set', modelId: id })}>{id}</button>
          ))}
        </div>
      )}

      <div class="list" role="list">
        {groups.map((g) => (
          <details class="group" key={g.provider} open>
            <summary>{g.label} <span class="kind">({g.models.length})</span></summary>
            {g.models.map((x) => {
              const active = x.modelId === m.current;
              const fav = m.favorites.includes(x.modelId);
              return (
                <div class={`item${active ? ' active' : ''}`} role="listitem" key={x.modelId}>
                  <button class="star" title={fav ? t.models.unstar : t.models.star}
                    aria-label={fav ? t.models.unstar : t.models.star} aria-pressed={fav}
                    onClick={() => sendManage({ type: 'manage/model/favorite', modelId: x.modelId, on: !fav })}>
                    <Icon name={fav ? 'star-full' : 'star-empty'} />
                  </button>
                  <button class="grow" title={x.description} onClick={() => sendManage({ type: 'manage/model/set', modelId: x.modelId })}>
                    {x.name}
                  </button>
                  <span class="kind">{x.modelId}</span>
                  {active && <span class="badge" aria-label={t.models.active}><Icon name="check" /> {t.models.active}</span>}
                </div>
              );
            })}
          </details>
        ))}
        {visible === 0 && <p class="hint">{t.models.emptyFiltered}</p>}
      </div>

      <div class="footer">
        <div>
          <strong>{t.models.windowTitle}:</strong>{' '}
          {m.activeWindow
            ? `${nf(m.activeWindow.size)} tokens — ${t.models.windowReported}`
            : <span class="hint">{t.models.windowUnknown}</span>}
        </div>
        <button class="secondary" onClick={() => sendManage({ type: 'manage/cli', args: ['acp', '--setup'] })}>
          {t.models.switchProvider}
        </button>
        <div class="hint">{t.common.source}: {t.models.source}</div>
      </div>
    </>
  );
}

/* ─────────── Skills ─────────── */

export function SkillsTab() {
  const sk = manageState.value.skills;
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('');
  const [createScope, setCreateScope] = useState<'user' | 'project'>('user');
  const needle = q.trim().toLowerCase();
  const list = sk.skills.filter((s) => {
    if (scope && s.scope !== scope) return false;
    if (!needle) return true;
    return `${s.name} ${s.description} ${s.tags.join(' ')}`.toLowerCase().includes(needle);
  });

  return (
    <>
      <div class="toolrow">
        <input class="search" type="search" placeholder={t.common.search} aria-label={t.common.search}
          value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <select aria-label={t.skills.scopeAll} value={scope} onChange={(e) => setScope((e.target as HTMLSelectElement).value)}>
          <option value="">{t.skills.scopeAll}</option>
          <option value="user">{t.skills.scopeUser}</option>
          <option value="project">{t.skills.scopeProject}</option>
          <option value="hub">{t.skills.scopeHub}</option>
        </select>
        <span class="spacer" />
        <span class="count">{list.length} / {sk.skills.length}</span>
      </div>

      <div class="toolrow">
        <select aria-label={t.skills.create} value={createScope} onChange={(e) => setCreateScope((e.target as HTMLSelectElement).value as 'user' | 'project')}>
          <option value="user">{t.skills.scopeUser}</option>
          <option value="project">{t.skills.scopeProject}</option>
        </select>
        <button onClick={() => sendManage({ type: 'manage/skill/create', scope: createScope })}>{t.skills.create}</button>
        <button class="secondary" onClick={() => sendManage({ type: 'manage/skills/install' })}>{t.skills.install}</button>
      </div>

      <div class="roots hint">
        <strong>{t.skills.rootsTitle}:</strong>
        <ul>
          {sk.roots.map((r) => (
            <li key={r.path} class={r.exists ? '' : 'muted'}>
              <code>{r.path}</code>{r.exists ? '' : ' (ausente)'}
            </li>
          ))}
        </ul>
      </div>

      <div class="list" role="list">
        {list.map((s) => (
          <div class="item col" role="listitem" key={s.path}>
            <div class="itemhead">
              <strong>{s.name}</strong>
              {s.version && <span class="kind">v{s.version}</span>}
              <span class="badge">{s.scope}</span>
              <span class="spacer" />
              <button class="secondary" onClick={() => sendManage({ type: 'manage/skill/open', path: s.path })}>{t.common.open}</button>
            </div>
            <div class="hint">{s.description}</div>
            {s.tags.length > 0 && <div class="tags">{s.tags.map((tag) => <span class="tag" key={tag}>{tag}</span>)}</div>}
          </div>
        ))}
        {list.length === 0 && <p class="hint">{t.skills.empty}</p>}
      </div>
      <div class="footer hint">{t.common.source}: {t.skills.source}</div>
    </>
  );
}

/* ─────────── Ferramentas e MCP ─────────── */

export function ToolsTab() {
  const tl = manageState.value.tools;
  return (
    <>
      <div class="toolrow">
        <strong>{t.tools.counter(tl.activeCount, tl.totalCount)}</strong>
        <span class="spacer" />
        <button class="secondary" onClick={() => sendManage({ type: 'manage/refresh', tab: 'tools' })}>{t.common.refresh}</button>
        <button onClick={() => sendManage({ type: 'manage/mcp/add' })}>{t.tools.addMcp}</button>
      </div>

      <p class="notice warning" role="status">{t.tools.newSession}</p>
      {!tl.source.toolsOk && <p class="hint">{t.tools.unavailable}</p>}

      <div class="kv">
        <div><span class="kind">{t.tools.acpToolset}</span>{' '}
          {tl.acpToolsetIsDefault
            ? <em>{t.tools.acpDefault}</em>
            : <code>{tl.acpToolset.join(', ')}</code>}
        </div>
        <div><span class="kind">{t.tools.disabled}</span>{' '}
          {tl.disabled.length ? <code>{tl.disabled.join(', ')}</code> : <em>{t.common.none}</em>}
        </div>
      </div>

      <div class="list" role="list">
        {tl.groups.map((g) => (
          <details class="group" key={g.kind} open>
            <summary>{g.kind === 'builtin' ? t.tools.builtin : t.tools.plugin} <span class="kind">({g.items.length})</span></summary>
            {g.items.map((it) => (
              <div class="item" role="listitem" key={it.name}>
                <Icon name={it.enabled ? 'check' : 'close'} cls={`dot ${it.enabled ? 'on' : 'off'}`} />
                <span class="mono">{it.name}</span>
                <span class="hint">{it.label}</span>
              </div>
            ))}
          </details>
        ))}
        {tl.groups.length === 0 && <p class="hint">{t.tools.empty}</p>}
      </div>

      <h3>{t.tools.mcp} <span class="kind">({tl.mcp.length})</span></h3>
      <div class="list" role="list">
        {tl.mcp.map((srv) => (
          <div class="item" role="listitem" key={srv.name}>
            <Icon name={srv.enabled ? 'check' : 'close'} cls={`dot ${srv.enabled ? 'on' : 'off'}`} />
            <strong>{srv.name}</strong>
            <span class="hint mono">{srv.transport}</span>
            <span class="spacer" />
            <span class="kind">{srv.tools}</span>
            <span class="badge">{srv.status}</span>
          </div>
        ))}
        {tl.mcp.length === 0 && <p class="hint">{t.common.empty}</p>}
      </div>
      <div class="footer hint">{t.common.source}: {t.tools.source}</div>
    </>
  );
}

/* ─────────── Instruções ─────────── */

export function InstructionsTab() {
  const ins = manageState.value.instructions;
  const found = ins.files.filter((f) => f.found);
  return (
    <>
      <div class="list" role="list">
        {ins.files.map((f) => (
          <div class="item" role="listitem" key={`${f.scope}:${f.path}`}>
            <Icon name={f.found ? 'check' : 'circle-outline'} cls={`dot ${f.found ? 'on' : 'off'}`} />
            <strong>{f.label}</strong>
            <span class="badge">{f.scope === 'workspace' ? t.instructions.workspace : t.instructions.profile}</span>
            <span class="spacer" />
            {f.found ? (
              <>
                <span class="kind">{nf(f.tokens)} {t.instructions.tokens} <em>({t.common.estimado})</em></span>
                <button class="secondary" onClick={() => sendManage({ type: 'manage/instructions/open', path: f.path })}>{t.common.open}</button>
              </>
            ) : (
              <span class="hint">{t.instructions.missing}</span>
            )}
          </div>
        ))}
      </div>
      {found.length === 0 && <p class="hint">{t.instructions.empty}</p>}
      <div class="footer hint">{t.common.source}: {t.instructions.source}</div>
    </>
  );
}

/* ─────────── Contexto e uso ─────────── */

export function ContextTab() {
  const c = manageState.value.context;
  const pct = c.available && c.size && c.used !== undefined ? Math.round((c.used / c.size) * 100) : null;
  return (
    <>
      {c.available && pct !== null ? (
        <>
          <div class="bar" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t.context.estimates}>
            <span style={`width:${Math.min(100, pct)}%`} />
          </div>
          <p>{t.context.used(c.used ?? 0, c.size ?? 0, pct)}</p>
        </>
      ) : (
        <p class="hint">{t.context.noUsage}</p>
      )}
      <h3>{t.context.estimates}</h3>
      <div class="list" role="list">
        {c.estimates.map((e) => (
          <div class="item" role="listitem" key={e.label}>
            <span>{e.label}</span>
            <span class="spacer" />
            <span class="kind">{nf(e.tokens)} <em>({t.common.estimado})</em></span>
          </div>
        ))}
      </div>
      <p class="hint">{t.context.note}</p>
      <div class="footer hint">{t.common.source}: {t.context.source}</div>
    </>
  );
}

/* ─────────── Agentes/Perfis ─────────── */

export function AgentsTab() {
  const a = manageState.value.agents;
  return (
    <>
      <div class="list" role="list">
        {a.agents.map((ag) => (
          <div class="item col" role="listitem" key={ag.name}>
            <div class="itemhead">
              <strong>{ag.name}</strong>
              {ag.active && <span class="badge">{t.agents.active}</span>}
              <span class="spacer" />
              <button class="secondary" onClick={() => sendManage({ type: 'manage/agents/test', name: ag.name })}>{t.agents.test}</button>
            </div>
            <div class="kv small">
              <div><span class="kind">{t.agents.command}</span> <code>{ag.command}</code></div>
              <div><span class="kind">{t.agents.args}</span> <code>{ag.args.join(' ')}</code></div>
              {ag.profile && <div><span class="kind">{t.agents.profile}</span> <code>{ag.profile}</code></div>}
              {ag.cwd && <div><span class="kind">{t.agents.cwd}</span> <code>{ag.cwd}</code></div>}
              {ag.model && <div><span class="kind">{t.agents.model}</span> <code>{ag.model}</code></div>}
            </div>
          </div>
        ))}
      </div>

      <h3>{t.agents.profiles}</h3>
      {a.profilesError && <p class="hint">{a.profilesError}</p>}
      <div class="list" role="list">
        {a.profiles.map((p) => (
          <div class="item" role="listitem" key={p.name}>
            <Icon name={p.active ? 'check' : 'circle-outline'} cls={`dot ${p.active ? 'on' : 'off'}`} />
            <strong>{p.name}</strong>
            <span class="spacer" />
            <span class="kind mono">{p.model}</span>
          </div>
        ))}
        {a.profiles.length === 0 && <p class="hint">{t.common.empty}</p>}
      </div>
      <div class="footer hint">{t.common.source}: {t.agents.source}</div>
    </>
  );
}

/* ─────────── Aprovações ─────────── */

export function ApprovalsTab() {
  const ap = manageState.value.approvals;
  return (
    <>
      <div class="kv">
        <div><span class="kind">{t.approvals.policy}</span> <code>{ap.policy}</code></div>
      </div>
      <h3>{t.approvals.allowlist}</h3>
      <div class="list" role="list">
        {ap.allowlist.map((cmd) => (
          <div class="item" role="listitem" key={cmd}><code>{cmd}</code></div>
        ))}
        {ap.allowlist.length === 0 && <p class="hint">{t.approvals.empty}</p>}
      </div>
      <div class="toolrow">
        <button class="secondary" onClick={() => sendManage({ type: 'manage/approvals/open' })}>{t.approvals.openConfig}</button>
        <button class="secondary" onClick={() => sendManage({ type: 'manage/approvals/suggest' })}>{t.approvals.suggest}</button>
      </div>
      <div class="footer hint">{t.common.source}: {t.approvals.source}</div>
    </>
  );
}

/* ─────────── Avançado ─────────── */

export function AdvancedTab() {
  const ad = manageState.value.advanced;
  return (
    <>
      <div class="kv">
        <div><span class="kind">{t.advanced.version}</span> <code>{ad.version}</code></div>
        <div><span class="kind">{t.advanced.configPath}</span> <code>{ad.configPath || '—'}</code></div>
        <div><span class="kind">{t.advanced.envPath}</span> <code>{ad.envPath || '—'}</code></div>
      </div>
      <label class="check">
        <input type="checkbox" checked={ad.logTraffic}
          onChange={(e) => sendManage({ type: 'manage/advanced/toggleTraffic', value: (e.target as HTMLInputElement).checked })} />
        {t.advanced.logTraffic}
      </label>
      <div class="toolrow">
        <button class="secondary" onClick={() => sendManage({ type: 'manage/cli', args: ['doctor'], name: 'doctor' })}>{t.advanced.doctor}</button>
        <button class="secondary" onClick={() => sendManage({ type: 'manage/cli', args: ['acp', '--check'] })}>{t.advanced.check}</button>
        {ad.configPath && <button class="secondary" onClick={() => sendManage({ type: 'manage/openFile', path: ad.configPath })}>{t.tools.openConfig}</button>}
      </div>
      <div class="footer hint">{t.common.source}: {t.advanced.source}</div>
    </>
  );
}
