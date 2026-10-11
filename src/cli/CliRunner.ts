/** Escape hatches da CLI: terminal integrado com o comando real do Hermes. */
import * as vscode from 'vscode';
import { activeAgent, settings, workingDirectory } from '../config/Settings';

/** Comandos oferecidos no quick pick (todos existem na CLI instalada). */
const CLI_COMMANDS: { label: string; detail: string; args: string[] }[] = [
  { label: 'hermes model', detail: 'Escolher modelo e provider padrão', args: ['model'] },
  { label: 'hermes setup', detail: 'Assistente de configuração inicial', args: ['setup'] },
  { label: 'hermes doctor', detail: 'Checar configuração e dependências', args: ['doctor'] },
  { label: 'hermes status', detail: 'Status de todos os componentes', args: ['status'] },
  { label: 'hermes acp --check', detail: 'Verificar dependências do ACP', args: ['acp', '--check'] },
  { label: 'hermes acp --setup', detail: 'Setup de provider/modelo para o ACP', args: ['acp', '--setup'] },
  { label: 'hermes update', detail: 'Atualizar o Hermes', args: ['update'] },
  { label: 'hermes sessions browse', detail: 'Navegar sessões (inclui renomear/excluir)', args: ['sessions', 'browse'] },
  { label: 'hermes skills list', detail: 'Listar skills instaladas', args: ['skills', 'list'] },
  { label: 'hermes mcp list', detail: 'Listar servidores MCP', args: ['mcp', 'list'] },
  { label: 'hermes tools', detail: 'Configurar toolsets interativamente', args: ['tools'] },
  { label: 'hermes approvals suggest', detail: 'Propor allowlist a partir de aprovações passadas', args: ['approvals', 'suggest'] },
  { label: 'hermes checkpoints status', detail: 'Status do store de checkpoints', args: ['checkpoints', 'status'] },
  { label: 'hermes profile list', detail: 'Listar perfis', args: ['profile', 'list'] },
  { label: 'hermes config show', detail: 'Mostrar configuração', args: ['config', 'show'] },
  { label: 'hermes insights', detail: 'Uso de tokens, custos e tendências', args: ['insights'] },
];

export class CliRunner {
  private terminals = new Map<string, vscode.Terminal>();

  constructor(private readonly log: (level: 'info' | 'warn' | 'error', text: string) => void) {}

  /** `hermes` interativo (TUI/REPL) na pasta do workspace, retomando a sessão quando possível. */
  async openFullCli(opts?: { command?: string; args?: string[]; sessionId?: string }): Promise<void> {
    const s = settings();
    const agent = activeAgent(s);
    const cwd = workingDirectory(s);
    const args = opts?.args ?? (opts?.sessionId ? ['--resume', opts.sessionId] : []);
    await this.run(opts?.command ?? agent.cfg.command, args, cwd, 'Hermes');
  }

  /** Quick pick com os comandos da CLI. */
  async runCommand(): Promise<void> {
    const pick = await vscode.window.showQuickPick(
      CLI_COMMANDS.map((c) => ({ label: c.label, detail: c.detail, args: c.args })),
      { title: 'Executar comando do Hermes', placeHolder: 'Um comando da CLI, num terminal integrado', matchOnDetail: true },
    );
    if (!pick) return;
    const s = settings();
    const agent = activeAgent(s);
    await this.run(agent.cfg.command, pick.args, workingDirectory(s), `Hermes: ${pick.args[0]}`);
  }

  async run(command: string, args: string[], cwd: string, name: string): Promise<void> {
    const parts = command.trim().split(/\s+/);
    const file = parts.pop()!;
    const shellArgs = [...parts, ...args].map((a) => (/\s/.test(a) ? `'${a.replace(/'/g, `'\\''`)}'` : a));
    const existing = this.terminals.get(name);
    if (existing && existing.exitStatus === undefined) {
      // reaproveita o terminal: roda o novo comando na mesma sessão de shell
      existing.sendText([file, ...shellArgs].join(' '), true);
      existing.show();
      return;
    }
    const terminal = vscode.window.createTerminal({ name, cwd, env: process.env as Record<string, string> });
    this.terminals.set(name, terminal);
    terminal.show();
    terminal.sendText([file, ...shellArgs].join(' '), true);
    this.log('info', `terminal "${name}": ${file} ${shellArgs.join(' ')}`);
  }

  dispose(): void {
    for (const t of this.terminals.values()) t.dispose();
    this.terminals.clear();
  }
}
