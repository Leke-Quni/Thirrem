import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.e2e-spec.ts', 'test/**/*.spec.ts'], globals: true, globalSetup: ['test/support/migrate.ts'], hookTimeout: 30000 },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
