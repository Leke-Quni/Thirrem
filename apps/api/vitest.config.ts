import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.e2e-spec.ts'], globals: true, hookTimeout: 30000 },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
