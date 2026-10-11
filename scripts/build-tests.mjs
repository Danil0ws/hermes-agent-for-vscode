/**
 * Bundle dos testes com esbuild (mesma resolução de módulos do extension host).
 * `vscode` fica external: nenhum teste importa o runtime dele (só tipos).
 */
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';

const entries = readdirSync('src/test')
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => `src/test/${f}`);

await build({
  entryPoints: entries,
  outdir: 'dist-test',
  outExtension: { '.js': '.test.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: 'inline',
  logLevel: 'info',
  external: ['vscode'],
});
console.log(`testes empacotados: ${entries.length}`);
