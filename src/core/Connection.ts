/**
 * Spawn + conexão ACP com `hermes acp` (JSON-RPC sobre stdio).
 *
 * @agentclientprotocol/sdk 1.8.0 fala PROTOCOL_VERSION 1 (verificado) e é ESM-only,
 * por isso o extension host é empacotado em CJS com esbuild (o SDK entra no bundle).
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';

export interface AgentConfig {
  command: string;
  args: string[];
  profile?: string;
  cwd?: string;
  env?: Record<string, string>;
  model?: string;
}

export interface ConnectionEvents {
  onTraffic?(direction: 'in' | 'out', message: unknown): void;
  onStderr?(line: string): void;
  onExit?(code: number | null, signal: string | null): void;
}

/**
 * Divide `"wsl hermes"` em executável + seu prefixo de ambiente, sem shell (sem injeção).
 *
 * O PRIMEIRO token é o executável e os seguintes são os argumentos do wrapper:
 * `"wsl hermes"` → spawn('wsl', ['hermes', 'acp']). Invertido (pegar o último token como
 * executável) fazia o Windows/WSL spawnar `hermes wsl acp`, que nunca sobe — o CLI "não era
 * encontrado" justamente no caminho documentado.
 */
export function splitCommand(command: string): { file: string; prefix: string[] } {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error('hermes.cliPath vazio');
  return { file: parts[0], prefix: parts.slice(1) };
}

export class Connection {
  private child?: ChildProcessWithoutNullStreams;
  private conn?: acp.ClientSideConnection;
  private disposed = false;

  constructor(private readonly cfg: AgentConfig, private readonly events: ConnectionEvents = {}) {}

  get connection(): acp.ClientSideConnection {
    if (!this.conn) throw new Error('ACP não inicializado');
    return this.conn;
  }

  get alive(): boolean {
    return !!this.child && this.child.exitCode === null && !this.disposed;
  }

  async start(cwd: string, client: acp.Client): Promise<acp.InitializeResponse> {
    const { file, prefix } = splitCommand(this.cfg.command);
    const env: NodeJS.ProcessEnv = { ...process.env, ...(this.cfg.env ?? {}) };
    // ponytail: 1 flag, evita os MCP globais atrasarem o initialize; o client manda os seus por sessão
    if (process.env.HERMES_ACP_SKIP_CONFIGURED_MCP === undefined) {
      env.HERMES_ACP_SKIP_CONFIGURED_MCP = '1';
    }
    // `--profile` é do Hermes, então vem DEPOIS do prefixo do wrapper: `wsl hermes --profile x acp`,
    // nunca `wsl --profile x hermes acp` (que passaria a flag para o wsl).
    const profile = this.cfg.profile?.trim();
    const args = [...prefix, ...(profile ? ['--profile', profile] : []), ...this.cfg.args];

    this.child = spawn(file, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const exited = new Promise<never>((_, reject) => {
      this.child!.on('exit', (code, signal) => {
        this.events.onExit?.(code, signal);
        if (!this.disposed) reject(new Error(`hermes acp terminou (code=${code} signal=${signal})`));
      });
    });
    this.child.stderr.setEncoding('utf8');
    let buf = '';
    this.child.stderr.on('data', (d: string) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines) if (l.trim()) this.events.onStderr?.(l);
    });

    const stream = acp.ndJsonStream(
      Writable.toWeb(this.child.stdin) as unknown as WritableStream<Uint8Array>,
      Readable.toWeb(this.child.stdout) as unknown as ReadableStream<Uint8Array>,
    );
    this.conn = new acp.ClientSideConnection(() => client, stream);

    const init = await Promise.race([
      this.conn.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
          auth: { terminal: true },
        },
        clientInfo: { name: 'hermes-agent-vscode', version: '0.1.0' },
      }),
      exited,
    ]);
    if (init.protocolVersion !== acp.PROTOCOL_VERSION) {
      throw new Error(`protocolo incompatível: agente=${init.protocolVersion} cliente=${acp.PROTOCOL_VERSION}`);
    }
    return init;
  }

  /** SIGTERM -> SIGKILL em 3 s. Nunca deixa órfão. */
  stop(): void {
    this.disposed = true;
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* já morreu */ } }, 3000);
    child.once('exit', () => clearTimeout(t));
  }
}
