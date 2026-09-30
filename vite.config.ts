import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Data whose licence doesn't allow republishing (Atlas of Rural Settlement:
 * "personal and business use") is never shipped in a build unless it is
 * explicitly a local build (VITE_SHELF_LOCAL_DATA=1).
 */
const LOCAL_ONLY = ['world/tiles/rural-settlement.pmtiles', 'world/tiles/local-sites.pmtiles'];
const keepLocalDataLocal = (): Plugin => ({
  name: 'shelf-local-only-data',
  apply: 'build',
  writeBundle(opts) {
    if (process.env.VITE_SHELF_LOCAL_DATA === '1') return;
    for (const f of LOCAL_ONLY) rmSync(join(opts.dir ?? 'dist', f), { force: true });
  },
});

const apiPort = process.env.SHELF_API_PORT ?? '8787';

export default defineConfig({
  // Set SHELF_BASE=/repo-name/ when hosting under a sub-path (e.g. GitHub Pages).
  base: process.env.SHELF_BASE ?? '/',
  plugins: [react(), keepLocalDataLocal()],
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
