/**
 * Bundle ru da webview do chat (tradução do pt-BR).
 *
 * O tipo `Strings` é o contrato: chave faltando ou a mais quebra o `tsc`.
 */
import { type Strings } from './i18n.pt-br';

/** `Strings` tem literais aninhados (`empty.actions` é `as const`): Widen troca literal →
 *  string mantendo as chaves, então o `tsc` ainda pega chave faltando ou sobrando. */
type Widen<T> = T extends string ? string
  : T extends readonly unknown[] ? { [K in keyof T]: Widen<T[K]> }
  : T extends object ? { [K in keyof T]: Widen<T[K]> }
  : T;

const bundle: Widen<Strings> = {
  /* ───── vazio / boas-vindas ───── */
  empty: {
    greeting: 'Hermes работает на вашем компьютере — с вашими skills, памятью и инструментами.',
    actions: [
      ['Объяснить этот проект', 'Объясните архитектуру этого проекта и с чего мне начать.'],
      ['Найти проблемы', 'Найдите проблемы в коде этого рабочего пространства и расставьте риски по приоритету.'],
      ['Написать тесты', 'Напишите тесты для кода, который ещё не покрыт.'],
      ['Спланировать изменение', 'Спланируйте, шаг за шагом, изменение, которое я опишу.'],
    ] as const,
    manage: 'Управление моделями, skills и MCP…',
  },

  /* ───── papéis ───── */
  role: { user: 'вы', agentFallback: 'hermes' },

  /* ───── estados ───── */
  status: {
    completed: 'Завершено', failed: 'Ошибка', in_progress: 'Выполняется',
    pending: 'Ожидает', cancelled: 'Отменено',
  } as Record<string, string>,
  statusGlyph: {
    completed: 'check', failed: 'close', in_progress: 'circle-filled', pending: 'circle-outline',
    cancelled: 'circle-slash',
  } as Record<string, string>,

  /* ───── raciocínio ───── */
  thought: {
    summary: 'Рассуждения',
    running: 'думает',
    done: 'готово',
    elapsed: (s: string) => `${s} с`,
  },

  /* ───── tool calls ───── */
  tool: {
    titleFallback: 'Инструмент',
    input: 'Ввод', output: 'Вывод',
    duration: (s: string) => `${s} с`,
    expand: 'Развернуть', collapse: 'Свернуть',
    locations: 'Расположения',
    kind: {
      read: 'Чтение', edit: 'Изменение', delete: 'Удаление', move: 'Перемещение', search: 'Поиск',
      execute: 'Команда', think: 'Рассуждения', fetch: 'Загрузка', switch_mode: 'Смена режима',
      other: 'Инструмент',
    } as Record<string, string>,
  },

  /* ───── plano ───── */
  plan: {
    title: 'План',
    count: (done: number, total: number) => `${done}/${total}`,
    viewInView: 'Показать на панели',
    implement: 'Реализовать план',
  },

  /* ───── arquivos alterados ───── */
  workingSet: {
    title: 'Изменённые файлы',
    summary: (n: number, add: number, rem: number) => `${n} · +${add} −${rem}`,
    diff: 'diff',
    keep: 'Оставить',
    undo: 'Отменить',
    keepAll: 'Оставить всё',
    undoAll: 'Отменить всё',
    scopeNote:
      'Hermes уже записал эти файлы на диск. «Отменить» применяет обратный diff. ' +
      'Восстановление всего хода выполняется через checkpoint самого Hermes (hermes chat --checkpoints + /rollback) — ' +
      'сессия ACP пока не создаёт checkpoints, поэтому кнопка появляется, только когда для этого каталога есть store.',
  },

  /* ───── aprovação ───── */
  permission: {
    label: 'Требуется разрешение',
    cwdPrefix: 'cwd:',
    remaining: (s: number) => `истекает через ${s} с`,
  },

  /* ───── bloco de código / barra de resposta ───── */
  code: { copy: 'Копировать', insert: 'Вставить в редактор' },
  response: {
    copy: 'Копировать ответ',
    rerun: 'Запустить снова',
    insert: 'Вставить в редактор',
    openDiff: 'Открыть diff',
    copied: 'Скопировано',
  },
  userMsg: { edit: 'Изменить и отправить заново', copied: 'Скопировано' },

  /* ───── composer ───── */
  composer: {
    placeholderIdle: 'Спросите Hermes, # — контекст, / — команды',
    placeholderBusy: 'Поставить в очередь или задать направление текущему ходу',
    placeholderChips: (n: number) =>
      n === 1 ? 'Спросите о прикреплённом элементе' : `Спросите о ${n} прикреплённых элементах`,
    inputLabel: 'Сообщение для Hermes',
    addContext: 'Добавить контекст',
    addContextTip: 'Добавить контекст (+ или #)',
    mode: 'Режим',
    modeTip: 'Режим / политика подтверждения изменений',
    noModes: 'нет режимов',
    model: 'Модель',
    modelTip: 'Модель',
    noModels: 'нет моделей',
    tools: 'Инструменты',
    toolsTip: 'Настроить инструменты (Управление)',
    attach: 'Прикрепить',
    dropHint: 'Перетащите файлы сюда, чтобы прикрепить как контекст',
    removeChip: (label: string) => `Убрать ${label}`,
    toggleChip: (label: string) => `Включить/выключить неявный контекст ${label}`,
    chipTokens: (n: string) => `~${n} токенов`,
    chipTooltipSent: 'будет отправлено как текст в промпте',
    noQueueTip: 'Очередь отключена в настройках; это станет указанием для хода.',
  },

  /* ───── envio ───── */
  send: {
    send: 'Отправить', sendTip: 'Отправить (Enter)',
    stop: 'Остановить', stopTip: 'Остановить (Esc)',
    menuLabel: 'Параметры отправки',
    idleMenu: 'Отправить', queue: 'Добавить в очередь', steer: 'Задать направление ходу',
    interrupt: 'Отправить сейчас (прервать)',
  },

  /* ───── popover de contexto (#) ───── */
  hash: {
    title: 'Контекст',
    empty: 'Ничего не найдено',
    sources: {
      file: 'Файл', folder: 'Папка', symbol: 'Символ', selection: 'Выделение',
      diagnostic: 'Проблемы', terminal: 'Терминал', git: 'Изменения Git',
      url: 'URL', image: 'Изображение',
    } as Record<string, string>,
    sourceHint: 'открывает выбор в VS Code',
  },

  /* ───── popover de comandos (/) ───── */
  slash: { title: 'Команды', empty: 'Ни одна команда не найдена' },

  /* ───── fila ───── */
  queue: {
    title: (n: number) => `${n} в очереди`,
    clear: 'Очистить',
    now: 'сейчас', nowTip: 'Отправить сейчас (отменяет текущий ход)',
    edit: 'Изменить', editTip: 'Изменить в поле ввода',
    remove: 'Удалить',
    drag: 'Перетащите, чтобы изменить порядок',
    up: 'Вверх (Alt+↑)',
    down: 'Вниз (Alt+↓)',
  },

  /* ───── medidor de contexto ───── */
  meter: {
    label: 'Использование контекста',
    noWindow: 'Агент ещё не сообщил окно контекста',
    reported: (used: string, size: string, pct: string) =>
      `${used} из ${size} токенов (${pct}%) — по данным агента`,
    popoverTitle: 'Контекст',
    usedOf: (used: string, size: string, pct: string) => `${used} из ${size} токенов (${pct}%)`,
    fromAgent: '(от агента)',
    estimated: 'оценочно',
    measured: 'измерено',
    notAvailable: '—',
    notAvailableTip: 'webview пока не получает эти данные от хоста',
    categories: {
      instructions: 'Инструкции проекта', skills: 'Активные skills', tools: 'Инструменты / MCP',
      files: 'Файлы и вложения', history: 'История', reasoning: 'Рассуждения (последний ход)',
      unassigned: 'Не отнесено',
    } as Record<string, string>,
    lastTurn: 'Последний ход',
    lastTurnLine: (inp: string, out: string, thought: string, cached: string) =>
      `${inp} вход · ${out} выход · ${thought} рассуждения · ${cached} кэш`,
    costUnknown: 'Стоимость сессии: агент не сообщил',
    compact: 'Сжать',
    compactTip: 'Сжимает контекст (/compress)',
    compactBusyTip: 'дождитесь окончания хода или отмените его, чтобы сжать',
    newWithSummary: 'Новый диалог с резюме',
    newWithSummaryTip: 'Начинает новый диалог',
    details: 'Подробнее',
    detailsTip: 'Открыть вкладку «Контекст и использование» в разделе Управление',
  },

  /* ───── avisos ───── */
  notice: { cancelled: 'Ход отменён.', copied: 'Скопировано.' },

  /* ───── a11y genéricos ───── */
  a11y: {
    transcript: 'Диалог', queue: 'Очередь запросов', context: 'Прикреплённый контекст',
    plan: 'План', workingSet: 'Изменённые файлы', permissionDialog: 'Разрешение Hermes',
    responseActions: (role: string) => `Действия с ответом ${role}`,
    thinking: 'Идёт рассуждение',
  },

  allowAlwaysNote: '«Разрешать всегда» записывается в постоянный allowlist Hermes — действует в будущих сессиях.',
  permissionHint: {
    allow_once: 'Разрешает только этот вызов.',
    allow_session: 'Разрешает все одинаковые вызовы до конца этой сессии агента.',
    allow_always: 'Разрешает все одинаковые вызовы навсегда (записывается в постоянный allowlist Hermes).',
    reject_once: 'Запрещает этот вызов.',
    reject_always: 'Запрещает этот и одинаковые вызовы до конца сессии.',
  } as Record<string, string>,

  /* ───── ícones por tipo (sem emoji — símbolos + aria-label) ───── */
  icon: {
    file: 'file', folder: 'folder', symbol: 'symbol-method', selection: 'selection',
    diagnostic: 'warning', terminal: 'terminal', git: 'git-branch', url: 'link-external',
    image: 'file-media', skill: 'symbol-event',
    read: 'book', edit: 'edit', delete: 'trash', move: 'arrow-right', search: 'search',
    execute: 'terminal', think: 'lightbulb', fetch: 'cloud-download', switch_mode: 'arrow-swap',
    other: 'tools', showOlder: 'chevron-up',
  } as Record<string, string>,
};

export const ru: Strings = bundle as unknown as Strings;
