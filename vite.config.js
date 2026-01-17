import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: {
    fs: {
      allow: [path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')]
    },
    host: '0.0.0.0',
    port: 8080,
    strictPort: true
  },
  resolve: {
    preserveSymlinks: true
  }
});
