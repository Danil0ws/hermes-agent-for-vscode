import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

// Duas webviews (chat e Gerenciar) -> bundles ES separados em dist/, com o CSS extraído.
// CSP da webview bloqueia script remoto; tudo entra por nonce (ver ChatViewProvider.html).
export default defineConfig({
  plugins: [preact()],
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
