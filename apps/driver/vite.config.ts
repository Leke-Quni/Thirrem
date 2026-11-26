import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.API_URL ?? 'http://localhost:5001';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['maplibre-gl'] },
  define: { __API_BASE_URL__: JSON.stringify((process.env.API_BASE_URL ?? '').replace(/\/$/, '')) },
  server: { port: 5003, strictPort: true, proxy: { '/driver': api, '/health': api } },
});
