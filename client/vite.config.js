import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // In dev, proxy /api calls to the Express server
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  // Build into public/ so Express serves the React app
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
});
