import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

// Duas webviews (chat e Gerenciar) -> bundles ES separados em dist/, com o CSS extraído.
// CSP da webview bloqueia script remoto; tudo entra por nonce (ver ChatViewProvider.html).
export default defineConfig({
  plugins: [preact()],
  // Caminhos relativos: os assets do CSS (codicon.ttf) têm de resolver ao lado do próprio CSS.
  // Com a base padrão o codicon.css referencia `/codicon.ttf`, que na webview aponta para a raiz
  // do vscode-webview e dá 404 — os ícones viram tofu.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        chat: resolve(__dirname, 'webview/chat/main.tsx'),
        manage: resolve(__dirname, 'webview/manage/main.tsx'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        chunkFileNames: '[name].js',
      },
    },
  },
});
