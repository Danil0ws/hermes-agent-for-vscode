/**
 * Leitura ÚNICA de "o que está rodando".
 *
 * O painel tinha VÁRIOS indicadores independentes de execução — spinner do raciocínio, glifo do tool
 * call, spinner do estado vazio, placeholder do campo, botão de parar — e cada um decidia sozinho se
 * estava rodando. O resultado relatado: "aparecia rodando três coisas ao mesmo tempo" quando não
 * rodava nada diferente (e, quando o turno morria por cancelamento, um tool ficava girando para
 * sempre). Aqui existe UMA função que responde a pergunta, com precedência fixa: a barra de status
 * (`runbar.tsx`) é a única coisa que anima, e o reducer usa `closingPatch`/`openTools` para fechar o
 * que ficou preso.
 *
 * Puro: sem DOM, sem sinais, sem `vscode`, sem i18n (devolve a FASE; o texto é do bundle de strings).
 */
import type { PermissionRequest, ToolView } from '../../src/core/types';

/**
 * Turno do transcript, tipado ESTRUTURALMENTE de propósito: `status.ts` não pode importar `store.ts`
 * (o store importa este módulo) e não precisa de mais do que estes campos para dizer a fase.
 */
export interface TurnLike {
  id: string;
  role: 'user' | 'agent';
  text: string;
  streaming?: boolean;
  startedAt?: number;
  thoughtStartedAt?: number;
}

/* ─────────── tools abertas / fechamento do que ficou preso ─────────── */

/** `pending`/`in_progress` são os dois status em que o ACP considera o tool RODANDO. */
export function isOpenTool(t: Pick<ToolView, 'status'>): boolean {
  return t.status === 'pending' || t.status === 'in_progress';
}

export function openTools(tools: ToolView[]): ToolView[] {
  return tools.filter(isOpenTool);
}

/**
 * Patch que FECHA um tool ainda aberto. O agente deixa de mandar `tool_call_update` terminal quando
 * o turno morre por cancelamento: sem fechar, o card fica com o status "rodando" para sempre — foi
 * assim que a tela mostrou execução que não existia. `cancelled` é o status ACP correto para isso.
 */
export function closingPatch(at: number): Partial<ToolView> {
  return { status: 'cancelled', endedAt: at };
}

/* ─────────── a fase ─────────── */

export type RunPhase =
  /** nada rodando */
  | 'idle'
  /** handshake do "Iniciar" (quem mostra isso é o estado vazio, não a barra) */
  | 'starting'
  /** execuções pausadas pelo usuário */
  | 'paused'
  /** o turno está bloqueado esperando uma aprovação — nada avança até responder */
  | 'waiting'
  /** ferramenta em execução */
  | 'tool'
  /** o modelo está raciocinando (chegou `thought/chunk`) */
  | 'thinking'
  /** o modelo está escrevendo a resposta (chegou `agent/chunk`) */
  | 'writing'
  /** o turno está aberto e nada mais específico foi anunciado ainda */
  | 'working';

export interface RunStatus {
  phase: RunPhase;
  /** a ferramenta em execução (a última aberta) quando `phase === 'tool'` */
  tool?: ToolView;
  /** quantas tools abertas — >1 é anomalia (anunciamos as duas, não escondemos) */
  open: number;
  /** tools já terminadas nesta conversa */
  done: number;
  /** epoch ms do início da fase atual */
  since: number;
  /**
   * A fase já passa de `STALL_MS` sem sinal. O usuário relatou "não entendi por que eu tinha
   * travado": com o tempo sempre visível, travamento longo fica VISÍVEL em vez de silencioso.
   */
  slow: boolean;
}

/** Acima disso a barra avisa que a fase está longa (não é erro — é informação). */
export const STALL_MS = 60_000;

export interface RunInput {
  busy: boolean;
  starting?: boolean;
  paused?: boolean;
  permission: PermissionRequest | null;
  tools: ToolView[];
  turns: TurnLike[];
  /** injetável para o teste; default `Date.now()` */
  now?: number;
}

/**
 * A ÚNICA resposta a "o que está rodando", decidida nesta ordem (o primeiro que casa manda):
 *
 *  1. `starting`  — o handshake ainda corre; nada mais existe, então nem avaliamos o resto;
 *  2. `paused`    — o usuário pausou: por definição não roda nada (a pausa cancela o turno);
 *  3. `waiting`   — permissão pendente: o turno está PARADO esperando a pessoa, e isso é diferente
 *                   de "rodando" — era este o caso em que a tela mentia;
 *  4. `tool`      — o que de fato executa (comando, leitura, escrita);
 *  5. `thinking`/`writing` — raciocínio/resposta chegando em streaming;
 *  6. `working`   — o turno está aberto (o agente ainda não anunciou o primeiro chunk);
 *  7. `idle`.
 */
export function runStatus(i: RunInput): RunStatus {
  const now = i.now ?? Date.now();
  const open = openTools(i.tools);
  const done = i.tools.length - open.length;
  const last = i.turns[i.turns.length - 1];
  const streaming = last && last.role === 'agent' && last.streaming ? last : undefined;

  const mk = (phase: RunPhase, since: number, tool?: ToolView): RunStatus => ({
    phase, tool, open: open.length, done, since, slow: now - since > STALL_MS,
  });

  if (i.starting) return mk('starting', now);
  if (i.paused) return mk('paused', now);
  if (i.permission) return mk('waiting', now);
  if (open.length > 0) {
    const t = open[open.length - 1] as ToolView;
    return mk('tool', t.startedAt || now, t);
  }
  if (streaming) {
    const since = (streaming.text ? streaming.startedAt : streaming.thoughtStartedAt) ?? streaming.startedAt ?? now;
    return mk(streaming.text ? 'writing' : 'thinking', since);
  }
  if (i.busy) return mk('working', now);
  return mk('idle', now);
}
