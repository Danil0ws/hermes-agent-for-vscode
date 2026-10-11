/**
 * Strings de UI (pt-BR) da webview do chat.
 *
 * Isoladas aqui para o host mover para `package.nls.pt-br.json` sem tocar no bundle.
 * Regra: nenhuma string literal de superfície nos componentes — tudo sai daqui.
 */
export const S = {
  /* ───── vazio / boas-vindas ───── */
  empty: {
    greeting: 'O Hermes roda na sua máquina, com as suas skills, memória e ferramentas.',
    actions: [
      ['Explicar este projeto', 'Explique a arquitetura deste projeto e por onde eu começo.'],
      ['Encontrar problemas', 'Encontre problemas no código deste workspace e priorize os riscos.'],
      ['Escrever testes', 'Escreva testes para o que ainda não tem cobertura.'],
      ['Planejar uma mudança', 'Planeje, passo a passo, a mudança que eu descrever.'],
    ] as const,
    manage: 'Gerenciar modelos, skills e MCP…',
  },

  /* ───── papéis ───── */
  role: { user: 'você', agentFallback: 'hermes' },

  /* ───── estados ───── */
  status: {
    completed: 'Concluído', failed: 'Falhou', in_progress: 'Em andamento',
    pending: 'Pendente', cancelled: 'Cancelado',
  } as Record<string, string>,
  statusGlyph: {
    completed: '✓', failed: '✕', in_progress: '◐', pending: '○', cancelled: '⊘',
  } as Record<string, string>,

  /* ───── raciocínio ───── */
  thought: {
    summary: 'Raciocínio',
    running: 'pensando',
    done: 'concluído',
    elapsed: (s: string) => `${s} s`,
  },

  /* ───── tool calls ───── */
  tool: {
    titleFallback: 'Ferramenta',
    input: 'Entrada', output: 'Saída',
    duration: (s: string) => `${s} s`,
    expand: 'Expandir', collapse: 'Recolher',
    locations: 'Locais',
    kind: {
      read: 'Leitura', edit: 'Edição', delete: 'Exclusão', move: 'Mover', search: 'Busca',
      execute: 'Comando', think: 'Raciocínio', fetch: 'Obtenção', switch_mode: 'Troca de modo',
      other: 'Ferramenta',
    } as Record<string, string>,
  },

  /* ───── plano ───── */
  plan: {
    title: 'Plano',
    count: (done: number, total: number) => `${done}/${total}`,
    viewInView: 'Ver na view',
    implement: 'Implementar plano',
  },

  /* ───── arquivos alterados ───── */
  workingSet: {
    title: 'Arquivos alterados',
    summary: (n: number, add: number, rem: number) => `${n} · +${add} −${rem}`,
    diff: 'diff',
    keep: 'Manter',
    undo: 'Desfazer',
    keepAll: 'Manter tudo',
    undoAll: 'Desfazer tudo',
    scopeNote:
      'O Hermes já escreveu estes arquivos no disco. "Desfazer" aplica o diff inverso. ' +
      'Restaurar o turno inteiro usa o checkpoint do próprio Hermes (hermes chat --checkpoints + /rollback) — ' +
      'a sessão ACP ainda não tira checkpoints, então o botão só aparece quando existe store para este diretório.',
  },

  /* ───── aprovação ───── */
  permission: {
    label: 'Aprovação necessária',
    cwdPrefix: 'cwd:',
    remaining: (s: number) => `expira em ${s} s`,
  },

  /* ───── bloco de código / barra de resposta ───── */
  code: { copy: 'Copiar', insert: 'Inserir no editor' },
  response: {
    copy: 'Copiar resposta',
    rerun: 'Reexecutar',
    insert: 'Inserir no editor',
    openDiff: 'Abrir diff',
    copied: 'Copiado',
  },
  userMsg: { edit: 'Editar e reenviar', copied: 'Copiado' },

  /* ───── composer ───── */
  composer: {
    placeholderIdle: 'Pergunte ao Hermes, # para contexto, / para comandos',
    placeholderBusy: 'Enfileirar ou dar direção ao turno em andamento',
    placeholderChips: (n: number) =>
      n === 1 ? 'Pergunte sobre o item anexado' : `Pergunte sobre os ${n} itens anexados`,
    inputLabel: 'Mensagem para o Hermes',
    addContext: 'Adicionar contexto',
    addContextTip: 'Adicionar contexto (+ ou #)',
    mode: 'Modo',
    modeTip: 'Modo / política de aprovação de edição',
    noModes: '(sem modos anunciados)',
    model: 'Modelo',
    modelTip: 'Modelo',
    noModels: '(sem catálogo do agente)',
    tools: 'Ferramentas',
    toolsTip: 'Configurar ferramentas (Gerenciar)',
    attach: 'Anexar',
    dropHint: 'Solte arquivos aqui para anexar como contexto',
    removeChip: (label: string) => `Remover ${label}`,
    toggleChip: (label: string) => `Ligar/desligar contexto implícito ${label}`,
    chipTokens: (n: string) => `~${n} tokens`,
    chipTooltipSent: 'será enviado como texto no prompt',
    noQueueTip: 'A fila está desativada nas configurações; isto vira direção ao turno.',
  },

  /* ───── envio ───── */
  send: {
    send: 'Enviar', sendTip: 'Enviar (Enter)',
    stop: 'Parar', stopTip: 'Parar (Esc)',
    menuLabel: 'Opções de envio',
    idleMenu: 'Enviar', queue: 'Adicionar à fila', steer: 'Direcionar turno',
    interrupt: 'Enviar agora (interromper)',
  },

  /* ───── popover de contexto (#) ───── */
  hash: {
    title: 'Contexto',
    empty: 'Nada corresponde',
    sources: {
      file: 'Arquivo', folder: 'Pasta', symbol: 'Símbolo', selection: 'Seleção',
      diagnostic: 'Problemas', terminal: 'Terminal', git: 'Alterações do Git',
      url: 'URL', image: 'Imagem',
    } as Record<string, string>,
    sourceHint: 'abre o seletor no VS Code',
  },

  /* ───── popover de comandos (/) ───── */
  slash: { title: 'Comandos', empty: 'Nenhum comando corresponde' },

  /* ───── fila ───── */
  queue: {
    title: (n: number) => `${n} na fila`,
    clear: 'Limpar',
    now: 'agora', nowTip: 'Enviar agora (cancela o turno atual)',
    edit: 'Editar', editTip: 'Editar no composer',
    remove: 'Remover',
    drag: 'Arrastar para reordenar',
    up: 'Subir (Alt+↑)',
    down: 'Descer (Alt+↓)',
  },

  /* ───── medidor de contexto ───── */
  meter: {
    label: 'Uso do contexto',
    noWindow: 'O agente ainda não reportou a janela de contexto',
    reported: (used: string, size: string, pct: string) =>
      `${used} de ${size} tokens (${pct}%) — reportado pelo agente`,
    popoverTitle: 'Contexto',
    usedOf: (used: string, size: string, pct: string) => `${used} de ${size} tokens (${pct}%)`,
    fromAgent: '(do agente)',
    estimated: 'estimado',
    measured: 'medido',
    notAvailable: '—',
    notAvailableTip: 'a webview ainda não recebe este dado do host',
    categories: {
      instructions: 'Instruções do projeto', skills: 'Skills ativas', tools: 'Ferramentas / MCP',
      files: 'Arquivos e anexos', history: 'Histórico', reasoning: 'Raciocínio (último turno)',
      unassigned: 'Não atribuído',
    } as Record<string, string>,
    lastTurn: 'Último turno',
    lastTurnLine: (inp: string, out: string, thought: string, cached: string) =>
      `${inp} in · ${out} out · ${thought} raciocínio · ${cached} cache`,
    costUnknown: 'Custo da sessão: não informado pelo agente',
    compact: 'Compactar',
    compactTip: 'Compacta o contexto (/compress)',
    compactBusyTip: 'aguarde o turno terminar ou cancele para compactar',
    newWithSummary: 'Nova conversa com resumo',
    newWithSummaryTip: 'Inicia uma nova conversa',
    details: 'Ver detalhes',
    detailsTip: 'Abrir a aba "Contexto e uso" em Gerenciar',
  },

  /* ───── avisos ───── */
  notice: { cancelled: 'Turno cancelado.', copied: 'Copiado.' },

  /* ───── a11y genéricos ───── */
  a11y: {
    transcript: 'Conversa', queue: 'Fila de prompts', context: 'Contexto anexado',
    plan: 'Plano', workingSet: 'Arquivos alterados', permissionDialog: 'Aprovação do Hermes',
    responseActions: (role: string) => `Ações da resposta de ${role}`,
    thinking: 'Raciocínio em andamento',
  },

  /* ───── ícones por tipo (sem emoji — símbolos + aria-label) ───── */
  icon: {
    file: '▤', folder: '▦', symbol: '⟨⟩', selection: '▭', diagnostic: '⚑', terminal: '▷',
    git: '⑂', url: '↗', image: '▨', skill: 'ϟ',
    read: '▤', edit: '✎', delete: '⊗', move: '→', search: '⌕', execute: '▷',
    think: '✧', fetch: '⇣', switch_mode: '⇄', other: '❖',
    showOlder: '▴',
  } as Record<string, string>,
};

/** Formata número com separador pt-BR (ex.: 12 400). */
export function num(n: number): string {
  return n.toLocaleString('pt-BR');
}
