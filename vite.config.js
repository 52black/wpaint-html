import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    preserveSymlinks: true
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true
  }
});
