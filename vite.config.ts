import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/frontend'),
  base: '/dashboard/',
  build: {
    outDir: resolve(__dirname, 'public/dist'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
