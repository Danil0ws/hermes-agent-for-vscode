/**
 * Barra de execução: a ÚNICA resposta visível a "o que está rodando".
 *
 * Fica no rodapé, entre a conversa e o campo, e lê a fase JÁ DECIDIDA por `status.ts` (`runStatus`).
 * Uma linha só: um ícone animado, o texto da fase em palavras e o tempo decorrido recalculado a
 * cada 200ms — o usuário reclamou de "travar sem entender", então o tempo tem de estar à vista.
 *
 * Escondida no `idle` (nada roda) e no `starting` (o giro do bloco "Iniciar" é o dono daquele
 * momento — não duplicamos o mesmo evento). SEM botões: parar/pausar vivem SÓ no toolbar do
 * composer; dois caminhos para a mesma ação já foram relatados como defeito.
 */
import { useEffect, useState } from 'preact/hooks';
import { permission, state, tools, turns } from './store';
import { runStatus, type RunStatus } from './status';
import { S } from './i18n';
import { Icon } from '../shared/icon';

/** Segundos inteiros da fase atual. */
const elapsed = (ms: number) => (Math.max(0, ms) / 1000).toFixed(0);

/** Texto da fase em palavras (a queixa era a tela mentir sobre o que rodava). */
function phaseText(st: RunStatus): string {
  switch (st.phase) {
    case 'paused': return S.runbar.paused;
    case 'thinking': return S.runbar.thinking;
    case 'writing': return S.runbar.writing;
    case 'working': return S.runbar.working;
    case 'waiting': return S.runbar.waitingApproval(permission.value?.title || S.permission.label);
    case 'tool': {
      const kind = st.tool?.kind ?? 'other';
      const label = S.tool.kind[kind] ?? S.tool.kind.other;
      return `${label}: ${st.tool?.title || S.tool.titleFallback}`;
    }
    default: return '';
  }
}

export function RunBar() {
  const st = runStatus({
    busy: state.value.busy,
    starting: state.value.starting,
    paused: state.value.paused,
    permission: permission.value,
    tools: tools.value,
    turns: turns.value,
  });
  const [, tick] = useState(0);
  useEffect(() => {
    if (st.phase === 'idle' || st.phase === 'starting') return;
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [st.phase, st.since]);

  if (st.phase === 'idle' || st.phase === 'starting') return null;

  // Uma linha só: o que não couber em painel estreito vira reticências, então a frase inteira (fase +
  // contagem + tempo + aviso) viaja no `title` — truncar nunca pode APAGAR a informação.
  const secs = elapsed(Date.now() - st.since);
  const full = [
    phaseText(st),
    st.open > 1 ? S.runbar.multiple(st.open) : '',
    S.runbar.elapsed(secs),
    st.slow ? S.runbar.slow : '',
  ].filter(Boolean).join(' · ');

  return (
    <div class="runbar" role="status" aria-live="polite" aria-label={S.runbar.a11y} title={full}>
      <Icon name="loading" spin cls="ic" />
      <span class="runbar-text">{phaseText(st)}</span>
      {st.open > 1 && <span class="runbar-more muted">{S.runbar.multiple(st.open)}</span>}
      <span class="spacer" />
      <span class="runbar-time muted">{S.runbar.elapsed(secs)}</span>
      {st.slow && <span class="runbar-slow">{S.runbar.slow}</span>}
    </div>
  );
}
