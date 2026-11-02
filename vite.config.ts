import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// `base: './'` keeps the build portable: it can be served from any folder,
// GitHub Pages sub-path, or opened via a static file server.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
