import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    command: 'yarn workspace @thirrem/api build && yarn workspace @thirrem/api start',
    url: 'http://localhost:3100/health',
    env: { PORT: '3100' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
