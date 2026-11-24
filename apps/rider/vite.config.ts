import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.API_URL ?? 'http://localhost:5001';

export default defineConfig({
  plugins: [react()],
  server: { port: 5002, strictPort: true, proxy: { '/rider': api } },
});
