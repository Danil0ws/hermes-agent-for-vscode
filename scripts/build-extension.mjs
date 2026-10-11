/**
 * Bundle do extension host em CJS (o VS Code exige `main` CJS) com o SDK ACP embutido,
 * porque `@agentclientprotocol/sdk` é ESM-only.
 */
import { build } from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
  external: ['vscode'],
};

if (watch) {
  const ctx = await (await import('esbuild')).context(options);
  await ctx.watch();
  console.log('esbuild em watch');
} else {
  await build(options);
}
