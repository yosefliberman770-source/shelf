import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.SHELF_API_PORT ?? '8787';

export default defineConfig({
  // Set SHELF_BASE=/repo-name/ when hosting under a sub-path (e.g. GitHub Pages).
  base: process.env.SHELF_BASE ?? '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
