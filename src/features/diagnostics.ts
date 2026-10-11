/**
 * Feature "diagnostics": verificação de ambiente, exportação da conversa e a degradação
 * honesta de checkpoints (ARCHITECTURE §11 item 7b).
 *
 * - `hermes.diagnostics`: abre `hermes doctor` e `hermes acp --check` no terminal integrado
 *   (via deps.openCli) e atualiza a checagem de ambiente.
 * - `hermes.export`: exporta o transcript em Markdown ou JSON via `showSaveDialog`.
 * - Checagem ao ativar: `hermes --version` + `hermes acp --check`, publicada num
 *   DiagnosticCollection e na aba "Hermes Diagnóstico" (OutputChannel nativo).
 * - `hermes.checkpoints.restore`: nunca finge um checkpoint; restauração só existe na CLI.
 */
import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { splitCommand } from '../core/Connection';
import { settings, workingDirectory } from '../config/Settings';
import type { Feature, FeatureDeps } from './registry';
import type { HostToWebview } from '../core/types';
import { DiagnosticsView } from '../ui/DiagnosticsView';
import { tr } from '../l10n';

const ENV_URI = 'hermes-doctor:/ambiente';

export const feature: Feature = {
  id: 'diagnostics',
  register(ctx: vscode.ExtensionContext, deps: FeatureDeps): void {
    const view = new DiagnosticsView();
    const collection = vscode.languages.createDiagnosticCollection('hermes');
    ctx.subscriptions.push(view, collection);

    const refreshEnv = () => checkEnvironment(deps, view, collection);

    register(ctx, deps, 'hermes.diagnostics', async () => {
      await deps.openCli({ args: ['doctor'] });
      await deps.openCli({ args: ['acp', '--check'] });
      await refreshEnv();
      view.show();
    });
    register(ctx, deps, 'hermes.export', () => exportConversation(deps));
    register(ctx, deps, 'hermes.checkpoints.restore', () => offerCheckpointRestore(deps));

    // Checagem ao ativar (não bloqueante). Em workspace restrito não spawna nada (§8).
    void refreshEnv();
  },
};

/* ─────────────────────────── ambiente ─────────────────────────── */

interface Probe { ok: boolean; out: string }

function run(file: string, args: string[], cwd: string, timeout = 8000): Promise<Probe> {
  return new Promise((resolve) => {
    execFile(file, args, { cwd, timeout, windowsHide: true }, (err, stdout, stderr) => {
      const out = `${stdout ?? ''}${stderr ?? ''}`.trim();
      resolve({ ok: !err, out: out || (err ? String(err.message ?? err) : '') });
    });
  });
}

function cli(): { file: string; prefix: string[] } {
  return splitCommand(settings().cliPath?.trim() || 'hermes');
}

async function checkEnvironment(deps: FeatureDeps, view: DiagnosticsView, collection: vscode.DiagnosticCollection): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    view.set(tr('Workspace em modo restrito: a verificação de ambiente foi desativada.'));
    return;
  }
  const cwd = workingDirectory(settings());
  const { file, prefix } = cli();
  const diags: vscode.Diagnostic[] = [];
  const lines: string[] = [];

  const version = await run(file, [...prefix, '--version'], cwd);
  const versionLine = version.out.split('\n')[0]?.trim() ?? '';
  if (version.ok && versionLine) {
    lines.push(tr(`Versão: ${versionLine}`));
  } else {
    lines.push(tr(`Versão: indisponível (${version.out || tr('sem saída')})`));
    diags.push(diag(tr(`Não foi possível obter a versão do Hermes: ${version.out || tr('sem saída')}`)));
  }

  const acp = await run(file, [...prefix, 'acp', '--check'], cwd);
  const acpOk = acp.ok && /check ok/i.test(acp.out);
  if (acpOk) {
    lines.push(tr('ACP: ok (hermes acp --check)'));
  } else {
    lines.push(tr(`ACP: falhou (${acp.out || tr('sem saída')})`));
    diags.push(diag(tr(`hermes acp --check falhou: ${acp.out || tr('sem saída')}`)));
  }

  const cp = await checkpointsStatus(cwd);
  lines.push(cp.hasStore
    ? tr(`Checkpoints: store encontrado para ${cwd}. Restaurar é /rollback numa sessão CLI (\`hermes chat --checkpoints\`).`)
    : tr('Checkpoints: a sessão ACP não tira checkpoints e não há store deste diretório. Restauração só na CLI (`hermes chat --checkpoints` + /rollback).'));

  lines.push('', tr(`cwd: ${cwd}`), tr(`comando: ${file} ${[...prefix].join(' ')}`.trim()));

  view.set(lines.join('\n'));
  collection.set(vscode.Uri.parse(ENV_URI), diags);
  deps.log(acpOk && version.ok ? 'info' : 'warn', `ambiente: ${versionLine || '?'} · acp ${acpOk ? 'ok' : 'falhou'}`);
}

function diag(message: string): vscode.Diagnostic {
  return new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), message, vscode.DiagnosticSeverity.Error);
}

/* ─────────────────────────── checkpoints (§11.7b) ─────────────────────────── */

export interface CheckpointStatus { hasStore: boolean; raw: string }

/**
 * `hermes checkpoints` só faz status|list|prune|clear — NÃO restaura. Não inventamos um
 * formato de saída: consideramos "há store" apenas se a saída citar o próprio cwd.
 */
export async function checkpointsStatus(cwd: string): Promise<CheckpointStatus> {
  const { file, prefix } = cli();
  const r = await run(file, [...prefix, 'checkpoints', 'status'], cwd);
  return { hasStore: r.ok && !!cwd && r.out.includes(cwd), raw: r.out };
}

/** Oferece restaurar via CLI quando existe store real; senão explica o porquê. Nunca finge. */
export async function offerCheckpointRestore(deps: FeatureDeps, cwd?: string): Promise<void> {
  const dir = cwd ?? workingDirectory(settings());
  const { hasStore } = await checkpointsStatus(dir);
  const restore = tr('Abrir CLI com --checkpoints para restaurar');
  if (hasStore) {
    const pick = await vscode.window.showInformationMessage(
      tr(`Existe checkpoint do Hermes para ${dir}. Restaurar é /rollback, dentro de uma sessão CLI (a sessão ACP não tira checkpoints).`),
      restore,
    );
    if (pick === restore) await deps.openCli({ args: ['chat', '--checkpoints'] });
  } else {
    void vscode.window.showInformationMessage(tr('A sessão ACP não tira checkpoints (o adaptador ignora `checkpoints.enabled`). Para restaurar um turno, abra a CLI: `hermes chat --checkpoints` e use /rollback.'),
    );
  }
}

/* ─────────────────────────── exportar conversa ─────────────────────────── */

interface ExportMeta { exportedAt: string; agent: string; sessionId: string | null }

async function exportConversation(deps: FeatureDeps): Promise<void> {
  // O transcript é o mesmo que a webview recebeu. `last` é privado hoje: se o acessor
  // abaixo não existir ainda, degradamos com aviso (ver relatório — mudança no ChatViewProvider).
  const msgs = (deps.provider as unknown as { transcript?: HostToWebview[] }).transcript;
  if (!msgs || msgs.length === 0) {
    void vscode.window.showInformationMessage(tr('Nada para exportar nesta conversa.'));
    return;
  }

  const target = await vscode.window.showSaveDialog({
    title: tr('Exportar conversa do Hermes'),
    saveLabel: tr('Exportar'),
    filters: { Markdown: ['md'], JSON: ['json'] },
  });
  if (!target) return;

  const s = settings();
  const meta: ExportMeta = {
    exportedAt: new Date().toISOString(),
    agent: s.defaultAgent,
    sessionId: deps.agents.session?.sessionId ?? null,
  };
  const isJson = target.fsPath.toLowerCase().endsWith('.json');
  const content = isJson ? transcriptToJson(msgs, meta) : transcriptToMarkdown(msgs, meta);
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(content));
  void vscode.window.showInformationMessage(tr(`Conversa exportada em ${basename(target.fsPath)}.`));
}

export function transcriptToJson(msgs: HostToWebview[], meta: ExportMeta): string {
  return JSON.stringify({ protocol: 1, ...meta, transcript: msgs }, null, 2);
}

export function transcriptToMarkdown(msgs: HostToWebview[], meta: ExportMeta): string {
  const out: string[] = [
    tr('# Conversa do Hermes'), '',
    tr(`- Exportado em: ${meta.exportedAt}`),
    tr(`- Agente: ${meta.agent}`),
    tr(`- Sessão: ${meta.sessionId ?? '—'}`), '',
  ];
  let buf = '';
  const flush = () => { if (buf.trim()) { out.push(buf.trim(), ''); buf = ''; } };
  for (const m of msgs) {
    switch (m.type) {
      case 'user/message': flush(); out.push(tr('## Você'), '', m.text, ''); break;
      case 'agent/chunk': buf += m.text; break;
      case 'agent/message': flush(); out.push(tr('## Hermes'), '', m.text, ''); break;
      case 'tool/start': flush(); out.push(tr(`### Ferramenta: ${m.tool.title} (${m.tool.kind})`), ''); break;
      case 'plan': flush(); out.push(tr('### Plano'), '', ...m.entries.map((e) => `- [${e.status === 'completed' ? 'x' : ' '}] ${e.content} (${e.priority})`), ''); break;
      case 'error': flush(); out.push(tr(`> Erro: ${m.text}`), ''); break;
      default: break; // thought/chunk, tool/update, usage, init, etc.: não entram no resumo
    }
  }
  flush();
  return out.join('\n');
}

/* ─────────────────────────── registro defensivo ─────────────────────────── */

function register(ctx: vscode.ExtensionContext, deps: FeatureDeps, id: string, fn: (...args: unknown[]) => unknown): void {
  try {
    ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));
  } catch (e) {
    // Comandos ainda no-op / registrados em src/extension.ts; remover de lá libera o comando.
    deps.log('warn', `comando ${id} já registrado (${String(e)}); remova o registro em src/extension.ts.`);
  }
}
