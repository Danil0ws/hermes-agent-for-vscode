/** Escape hatches da CLI: terminal integrado com o comando real do Hermes. */
import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { activeAgent, settings, workingDirectory } from '../config/Settings';
import { tr } from '../l10n';

const execFileAsync = promisify(execFile);

/** Resultado da detecção do Hermes instalado. */
export interface CliStatus {
  /** `hermes --version` respondeu. */
  ok: boolean;
  version?: string;
  /** `hermes acp --check` respondeu OK (o que o chat realmente precisa). */
  acpOk?: boolean;
  error?: string;
  /** O comando que foi tentado, como está em `hermes.cliPath` / `hermes.agents`. */
  command: string;
}

/** Comandos oferecidos no quick pick (todos existem na CLI instalada). */
const CLI_COMMANDS: { label: string; detail: string; args: string[] }[] = [
  { label: tr('hermes model'), detail: tr('Escolher modelo e provider padrão'), args: ['model'] },
  { label: tr('hermes setup'), detail: tr('Assistente de configuração inicial'), args: ['setup'] },
  { label: tr('hermes doctor'), detail: tr('Checar configuração e dependências'), args: ['doctor'] },
  { label: tr('hermes status'), detail: tr('Status de todos os componentes'), args: ['status'] },
  { label: tr('hermes acp --check'), detail: tr('Verificar dependências do ACP'), args: ['acp', '--check'] },
  { label: tr('hermes acp --setup'), detail: tr('Setup de provider/modelo para o ACP'), args: ['acp', '--setup'] },
  { label: tr('hermes update'), detail: tr('Atualizar o Hermes'), args: ['update'] },
  { label: tr('hermes sessions browse'), detail: tr('Navegar sessões (inclui renomear/excluir)'), args: ['sessions', 'browse'] },
  { label: tr('hermes skills list'), detail: tr('Listar skills instaladas'), args: ['skills', 'list'] },
  { label: tr('hermes mcp list'), detail: tr('Listar servidores MCP'), args: ['mcp', 'list'] },
  { label: tr('hermes tools'), detail: tr('Configurar toolsets interativamente'), args: ['tools'] },
  { label: tr('hermes approvals suggest'), detail: tr('Propor allowlist a partir de aprovações passadas'), args: ['approvals', 'suggest'] },
  { label: tr('hermes checkpoints status'), detail: tr('Status do store de checkpoints'), args: ['checkpoints', 'status'] },
  { label: tr('hermes profile list'), detail: tr('Listar perfis'), args: ['profile', 'list'] },
  { label: tr('hermes config show'), detail: tr('Mostrar configuração'), args: ['config', 'show'] },
  { label: tr('hermes insights'), detail: tr('Uso de tokens, custos e tendências'), args: ['insights'] },
];

export class CliRunner {
  private terminals = new Map<string, vscode.Terminal>();

  constructor(private readonly log: (level: 'info' | 'warn' | 'error', text: string) => void) {}

  /**
   * Comando oficial de instalação, copiado da doc (`getting-started/installation`) — não é um
   * palpite nosso. POSIX instala em `~/.local/bin/hermes`; o wrapper entra no PATH ao reabrir o
   * shell (por isso o aviso de "reabra o terminal" depois).
   */
  static installCommand(): string {
    return process.platform === 'win32'
      ? 'iex (irm https://hermes-agent.nousresearch.com/install.ps1)'
      : 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash';
  }

  /** O comando configurado responde? (`hermes --version` e `hermes acp --check`) */
  async detect(): Promise<CliStatus> {
    const s = settings();
    const command = activeAgent(s).cfg.command;
    // O PRIMEIRO token é o executável (ver `splitCommand`): `wsl hermes` → execFile('wsl', ['hermes', …]).
    const [file, ...prefix] = command.trim().split(/\s+/).filter(Boolean);
    const cwd = workingDirectory(s);
    const run = async (args: string[]): Promise<string> => {
      const { stdout, stderr } = await execFileAsync(file, [...prefix, ...args], {
        cwd, timeout: 25_000, maxBuffer: 1 << 20,
      });
      return `${stdout}${stderr}`;
    };
    try {
      const version = (await run(['--version'])).split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
      let acpOk = false;
      try { acpOk = /check ok|\bok\b/i.test(await run(['acp', '--check'])); } catch { acpOk = false; }
      return { ok: true, version, acpOk, command };
    } catch (e) {
      return { ok: false, error: String((e as Error).message ?? e), command };
    }
  }

  /** Detecta o Hermes e, se algo faltar, oferece o caminho de correção (com o comando real). */
  async setupFlow(silentWhenReady = false): Promise<CliStatus> {
    const st = await this.detect();
    this.log('info', st.ok
      ? `Hermes detectado: ${st.version} (acp --check: ${st.acpOk ? 'OK' : 'falhou'})`
      : `Hermes NÃO encontrado via "${st.command}": ${st.error ?? ''}`);
    if (st.ok && st.acpOk) {
      if (!silentWhenReady) void vscode.window.showInformationMessage(`Hermes ${st.version} · ACP OK`);
      return st;
    }
    const s = settings();
    const cwd = workingDirectory(s);
    const command = activeAgent(s).cfg.command;

    if (st.ok) {
      const pick = await vscode.window.showWarningMessage(
        tr('O Hermes está instalado, mas `hermes acp --check` não respondeu. O chat precisa do suporte a ACP.'),
        { modal: true },
        tr('Configurar o ACP'), tr('Ver diagnóstico'), tr('Atualizar o Hermes'),
      );
      if (pick === tr('Configurar o ACP')) await this.run(command, ['acp', '--setup'], cwd, 'Hermes: acp');
      else if (pick === tr('Ver diagnóstico')) await this.run(command, ['doctor'], cwd, 'Hermes: doctor');
      else if (pick === tr('Atualizar o Hermes')) await this.run(command, ['update'], cwd, 'Hermes: update');
      return st;
    }

    const pick = await vscode.window.showErrorMessage(
      tr(`O Hermes não foi encontrado (comando configurado: "${st.command}"). Este chat precisa da CLI instalada — ela é o agente; a extensão é só a interface.`),
      { modal: true },
      tr('Instalar o Hermes'), tr('Já tenho: informar o caminho'), tr('Ver diagnóstico'),
    );
    if (pick === tr('Instalar o Hermes')) {
      await this.runInstall();
    } else if (pick === tr('Já tenho: informar o caminho')) {
      const value = await vscode.window.showInputBox({
        title: tr('Caminho do executável do Hermes'),
        prompt: tr('Aceita prefixo de ambiente, ex.: wsl hermes'),
        value: st.command,
      });
      if (value?.trim()) {
        await vscode.workspace.getConfiguration('hermes').update('cliPath', value.trim(), vscode.ConfigurationTarget.Global);
        await this.setupFlow();
      }
    } else if (pick === tr('Ver diagnóstico')) {
      await this.run(command, ['doctor'], cwd, 'Hermes: doctor');
    }
    return st;
  }

  /** Instala o Hermes pelo script oficial, num terminal integrado. */
  async runInstall(): Promise<void> {
    const s = settings();
    const name = tr('Hermes: instalação');
    let terminal = this.terminals.get(name);
    if (!terminal || terminal.exitStatus !== undefined) {
      terminal = vscode.window.createTerminal({ name, cwd: workingDirectory(s) });
      this.terminals.set(name, terminal);
    }
    terminal.show();
    terminal.sendText(CliRunner.installCommand(), true);
    this.log('info', `instalação do Hermes iniciada: ${CliRunner.installCommand()}`);
    void vscode.window.showInformationMessage(
      tr('Instalação iniciada no terminal. Ao terminar, reabra o terminal (o wrapper entra no PATH) e rode "Hermes: Verificar o Hermes".'),
    );
  }

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
      { title: tr('Executar comando do Hermes'), placeHolder: tr('Um comando da CLI, num terminal integrado'), matchOnDetail: true },
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
